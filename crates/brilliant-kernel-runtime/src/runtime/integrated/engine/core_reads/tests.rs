use super::*;
use crate::runtime::integrated::wire::{encode, number, value};

const METADATA: &[u8] = br#"{"readVersion":2,"selectorId":"core.selector.score-metadata"}"#;

fn source() -> Value {
    object([
        ("document", value(&crate::store::tests::fixture()).unwrap()),
        ("documentVersion", number(4)),
    ])
}
fn select(kind: &str, id: &Value, ownership: bool) -> Vec<u8> {
    encode(&object([
        ("readVersion", number(2)),
        (
            "selectorId",
            text(if ownership {
                "core.selector.score-entity-ownership"
            } else {
                "core.selector.score-entity"
            }),
        ),
        (
            "address",
            object([("kind", text(kind)), (&format!("{kind}Id"), id.clone())]),
        ),
    ]))
    .unwrap()
}
fn edit_field(object: &mut Value, key: &str, new_value: Value) {
    let JsonValue::Object(fields) = object else {
        panic!("object");
    };
    fields.insert(key.into(), new_value);
}

#[test]
fn metadata_is_lazy_lossless_and_migration_does_not_invent_a_revision() {
    let mut request = source();
    let JsonValue::Object(fields) = &mut request else {
        unreachable!()
    };
    fields.remove(&JsString::from("documentVersion"));
    let document = fields.get_mut(&JsString::from("document")).unwrap();
    let metadata =
        decode(br#"{"title":"\ud800","number":-0,"$serde_json::private::RawValue":"true"}"#)
            .unwrap();
    edit_field(document, "metadata", metadata.clone());
    let mut reads = CoreReads::new(&request);
    let reply = decode(&reads.read_core(METADATA).unwrap()).unwrap();
    assert_eq!(
        field(field(&reply, "result").unwrap(), "value").unwrap(),
        &metadata
    );
    assert_eq!(field(&reply, "documentVersion").unwrap(), &JsonValue::Null);
    assert!(reads.index.is_none());
    assert!(!reads.failed());
}

#[test]
fn entity_reads_match_the_source_and_never_include_extension_blocks() {
    let request = source();
    let document = field(&request, "document").unwrap();
    let mut reads = CoreReads::new(&request);
    let reply = decode(
        &reads
            .read_core(&select("document", field(document, "id").unwrap(), false))
            .unwrap(),
    )
    .unwrap();
    let core = field(
        field(field(&reply, "result").unwrap(), "value").unwrap(),
        "value",
    )
    .unwrap();
    assert!(field(core, "extensions").is_err());
    for key in [
        "id",
        "schemaVersion",
        "metadata",
        "parts",
        "measureDefinitions",
    ] {
        assert_eq!(field(core, key).unwrap(), field(document, key).unwrap());
    }
    let entries: Vec<_> = reads
        .index
        .as_ref()
        .unwrap()
        .entries
        .iter()
        .map(|((kind, id), entry)| {
            (
                kind.clone(),
                id.clone(),
                entry.entity.clone(),
                entry.ownership.clone(),
            )
        })
        .collect();
    let visits = reads.index.as_ref().unwrap().visits;
    for (kind, id, entity, ownership) in entries {
        let kind = kind.to_utf8().unwrap();
        let reply = decode(
            &reads
                .read_core(&select(&kind, &JsonValue::String(id.clone()), false))
                .unwrap(),
        )
        .unwrap();
        let selected = field(field(&reply, "result").unwrap(), "value").unwrap();
        if kind != "document" {
            assert_eq!(field(selected, "value").unwrap(), &entity);
        }
        let reply = decode(
            &reads
                .read_core(&select(&kind, &JsonValue::String(id), true))
                .unwrap(),
        )
        .unwrap();
        assert_eq!(
            field(field(&reply, "result").unwrap(), "value").unwrap(),
            &ownership
        );
    }
    assert_eq!(reads.index.as_ref().unwrap().visits, visits);
    // Independent fixture expectations: do not derive ownership from the index
    // being tested, particularly with differently ordered measure content.
    for (kind, id, expected) in [
        (
            "document",
            "score-root",
            r#"{"entityKind":"document","documentId":"score-root"}"#,
        ),
        (
            "measure",
            "measure-a",
            r#"{"entityKind":"measure","documentId":"score-root"}"#,
        ),
        (
            "part",
            "part-z",
            r#"{"entityKind":"part","documentId":"score-root"}"#,
        ),
        (
            "staff",
            "staff-a",
            r#"{"entityKind":"staff","documentId":"score-root","partId":"part-z"}"#,
        ),
        (
            "voice",
            "voice-a",
            r#"{"entityKind":"voice","documentId":"score-root","partId":"part-z","measureId":"measure-a"}"#,
        ),
        (
            "event",
            "event-a",
            r#"{"entityKind":"event","documentId":"score-root","partId":"part-z","measureId":"measure-a","voiceId":"voice-a"}"#,
        ),
        (
            "note",
            "note-a",
            r#"{"entityKind":"note","documentId":"score-root","partId":"part-z","measureId":"measure-a","voiceId":"voice-a","eventId":"event-a"}"#,
        ),
    ] {
        let reply = decode(&reads.read_core(&select(kind, &text(id), true)).unwrap()).unwrap();
        assert_eq!(
            field(field(&reply, "result").unwrap(), "value").unwrap(),
            &decode(expected.as_bytes()).unwrap()
        );
    }
}

#[test]
fn query_admission_is_exact_and_failure_is_sticky_but_not_found_is_data() {
    let source = source();
    let mut reads = CoreReads::new(&source);
    let missing = decode(
        &reads
            .read_core(&select("note", &text("missing"), false))
            .unwrap(),
    )
    .unwrap();
    assert_eq!(
        field(field(&missing, "result").unwrap(), "ok").unwrap(),
        &JsonValue::Bool(false)
    );
    assert!(reads.read_core(METADATA).is_ok());
    for bad in [
        br#"{"readVersion":1,"selectorId":"core.selector.score-metadata"}"#.as_slice(),
        br#"{"readVersion":2,"selectorId":"extensions"}"#,
        br#"{"readVersion":2,"selectorId":"core.selector.score-metadata","documentId":"other"}"#,
        br#"{"readVersion":2,"selectorId":"core.selector.history-state"}"#,
        br#"{"readVersion":2,"selectorId":"core.selector.score-entity","address":{"kind":"note","noteId":"a","extra":true}}"#,
        b"not JSON",
    ] {
        let mut reads = CoreReads::new(&source);
        assert_eq!(reads.read_core(bad), Err(Failure::InvalidRequest));
        assert!(reads.failed());
        assert_eq!(reads.read_core(METADATA), Err(Failure::ResourceLimit));
    }
    assert!(CoreReads::new(&source).read_core(METADATA).is_ok());
}

#[test]
fn call_input_and_streamed_output_limits_bound_the_callback() {
    let source = source();
    let mut reads = CoreReads::new(&source);
    for _ in 0..MAX_QUERIES {
        assert!(reads.read_core(METADATA).is_ok());
    }
    assert_eq!(reads.read_core(METADATA), Err(Failure::ResourceLimit));
    let mut padded = METADATA.to_vec();
    padded.resize(MAX_QUERY_BYTES, b' ');
    assert!(CoreReads::new(&source).read_core(&padded).is_ok());
    padded.push(b' ');
    assert_eq!(
        CoreReads::new(&source).read_core(&padded),
        Err(Failure::ResourceLimit)
    );

    let mut large = source.clone();
    let JsonValue::Object(fields) = &mut large else {
        unreachable!()
    };
    edit_field(
        fields.get_mut(&JsString::from("document")).unwrap(),
        "metadata",
        text(&"x".repeat(MAX_REPLY_BYTES)),
    );
    assert_eq!(
        CoreReads::new(&large).read_core(METADATA),
        Err(Failure::ResourceLimit)
    );
    let mut output = LimitedOutput {
        bytes: Vec::new(),
        limit: 3,
    };
    assert!(output.write_all(b"123").is_ok());
    assert!(output.write_all(b"4").is_err());
    assert_eq!(output.bytes, b"123");
}

#[test]
fn cumulative_reply_bytes_are_charged_and_equal_revisions_do_not_share_sources() {
    let mut first = source();
    let JsonValue::Object(fields) = &mut first else {
        unreachable!()
    };
    edit_field(
        fields.get_mut(&JsString::from("document")).unwrap(),
        "metadata",
        text(&"x".repeat(512 * 1024)),
    );
    let mut reads = CoreReads::new(&first);
    let mut replies = 0;
    while reads.read_core(METADATA).is_ok() {
        replies += 1;
    }
    assert_eq!(replies, 15); // sixteen half-MiB payloads plus envelopes exceed 8 MiB
    let mut second = source();
    let JsonValue::Object(fields) = &mut second else {
        unreachable!()
    };
    edit_field(
        fields.get_mut(&JsString::from("document")).unwrap(),
        "metadata",
        text("another candidate"),
    );
    let reply = decode(&CoreReads::new(&second).read_core(METADATA).unwrap()).unwrap();
    assert_eq!(
        field(field(&reply, "result").unwrap(), "value").unwrap(),
        &text("another candidate")
    );
    assert_eq!(field(&reply, "documentVersion").unwrap(), &number(4));
}

#[test]
fn duplicate_entity_identity_fails_closed_and_keeps_index_unpublished() {
    let mut request = source();
    let JsonValue::Object(fields) = &mut request else {
        unreachable!()
    };
    let document = fields.get_mut(&JsString::from("document")).unwrap();
    let mut parts = source_array(document, "parts").unwrap().to_vec();
    parts.push(parts[0].clone());
    edit_field(document, "parts", JsonValue::Array(parts));
    let mut reads = CoreReads::new(&request);
    assert_eq!(
        reads.read_core(&select("part", &text("missing"), false)),
        Err(Failure::InvalidSource)
    );
    assert!(reads.index.is_none());
    assert!(reads.failed());
}

#[test]
fn a_valid_256_measure_candidate_returns_only_the_requested_note() {
    use brilliant_core_types::StableId;
    use brilliant_score_foundation::RhythmicContentV1;
    let mut document = crate::store::tests::fixture();
    document.extensions.clear();
    let mut part = document.parts[0].clone();
    let template = part.measure_contents.iter().find(|content| {
        content.voices.iter().any(|voice| voice.sequence.events.iter().any(|event| matches!(&event.content, RhythmicContentV1::Notes { notes } if !notes.is_empty())))
    }).unwrap().clone();
    let definition = document
        .measure_definitions
        .iter()
        .find(|measure| measure.id == template.measure_id)
        .unwrap()
        .clone();
    document.measure_definitions.clear();
    part.measure_contents.clear();
    let mut last_note = None;
    for m in 0..256 {
        let mut measure = definition.clone();
        measure.id = StableId::new(format!("large-measure-{m}")).unwrap();
        let mut content = template.clone();
        content.measure_id = measure.id.clone();
        for (v, voice) in content.voices.iter_mut().enumerate() {
            voice.id = StableId::new(format!("large-voice-{m}-{v}")).unwrap();
            for (e, event) in voice.sequence.events.iter_mut().enumerate() {
                event.id = StableId::new(format!("large-event-{m}-{v}-{e}")).unwrap();
                if let RhythmicContentV1::Notes { notes } = &mut event.content {
                    for (n, note) in notes.iter_mut().enumerate() {
                        note.id = StableId::new(format!("large-note-{m}-{v}-{e}-{n}")).unwrap();
                        last_note = Some(note.clone());
                    }
                }
            }
        }
        document.measure_definitions.push(measure);
        part.measure_contents.push(content);
    }
    document.parts = vec![part];
    crate::KernelRuntime::create(document.clone()).unwrap();
    let source = object([
        ("document", value(&document).unwrap()),
        ("documentVersion", number(0)),
    ]);
    let last = last_note.unwrap();
    let mut reads = CoreReads::new(&source);
    let bytes = reads
        .read_core(&select(
            "note",
            &JsonValue::String(last.id.as_js_string().clone()),
            false,
        ))
        .unwrap();
    assert!(bytes.len() < 512);
    let reply = decode(&bytes).unwrap();
    assert_eq!(
        field(
            field(field(&reply, "result").unwrap(), "value").unwrap(),
            "value"
        )
        .unwrap(),
        &value(&last).unwrap()
    );
    let visits = reads.index.as_ref().unwrap().visits;
    assert!(visits > 256);
    reads
        .read_core(&select(
            "note",
            &JsonValue::String(last.id.as_js_string().clone()),
            true,
        ))
        .unwrap();
    assert_eq!(reads.index.as_ref().unwrap().visits, visits);
}

#[test]
fn entity_index_admission_stops_at_its_bound() {
    let mut request = source();
    let JsonValue::Object(fields) = &mut request else {
        unreachable!()
    };
    let document = fields.get_mut(&JsString::from("document")).unwrap();
    // The scope must also stay bounded for intermediate structural candidates.
    let definitions = (0..MAX_INDEX_ENTITIES)
        .map(|i| object([("id", text(&format!("measure-{i}")))]))
        .collect();
    edit_field(
        document,
        "measureDefinitions",
        JsonValue::Array(definitions),
    );
    let mut reads = CoreReads::new(&request);
    assert_eq!(
        reads.read_core(&select("note", &text("missing"), false)),
        Err(Failure::ResourceLimit)
    );
    assert!(reads.index.is_none());
    assert!(reads.failed());
}
