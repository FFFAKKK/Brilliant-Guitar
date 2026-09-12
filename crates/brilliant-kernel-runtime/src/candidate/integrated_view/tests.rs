use super::*;
use crate::candidate::tests::{id, raw_part};
use crate::store::{build_live_score_store, tests::fixture};
use brilliant_score_foundation::{LosslessDecode, LosslessEncode};

fn raw(document: &score::ScoreDocumentV1) -> score::ScoreDocumentV1<JsString> {
    let mut bytes = Vec::new();
    document.write_lossless(&mut bytes).unwrap();
    score::ScoreDocumentV1::from_lossless_value(
        score::decode_js_value_json(std::str::from_utf8(&bytes).unwrap()).unwrap(),
    )
    .unwrap()
}

fn project(candidate: &mut Candidate<'_>) -> score::ScoreDocumentV1<JsString> {
    candidate.integrated_document(&|id| Ok(id.clone())).unwrap()
}

#[test]
fn sdk_mid_batch_view_retains_duplicate_and_empty_ids_by_occurrence() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let mut first = raw_part("temporary-part");
    first.name = "first occurrence".into();
    for staff in &mut first.staves {
        staff.id = "".into();
    }
    for content in &mut first.measure_contents {
        for voice in &mut content.voices {
            voice.id = "".into();
            voice.default_staff_id = "".into();
            for event in &mut voice.sequence.events {
                event.id = "".into();
                event.staff_id = Some("".into());
                if let score::RhythmicContentV1::Notes { notes } = &mut event.content {
                    for note in notes {
                        note.id = "".into();
                    }
                }
            }
        }
    }
    let mut second = first.clone();
    second.name = "second occurrence".into();
    candidate.insert_part(first.clone(), None).unwrap();
    let second_source = candidate.insert_part(second.clone(), None).unwrap();
    let mut expected = raw(&document);
    expected.parts.insert(0, first);
    expected.parts.insert(0, second);
    assert_eq!(project(&mut candidate), expected);
    candidate
        .replace_value(
            &second_source,
            Value::PartName("only second changes".into()),
        )
        .unwrap();
    expected.parts[0].name = "only second changes".into();
    let mut detached = project(&mut candidate);
    assert_eq!(detached, expected);
    detached.parts.clear();
    assert_eq!(
        project(&mut candidate),
        expected,
        "host view mutation cannot edit the candidate"
    );
    assert!(
        candidate.validate_final().is_err(),
        "reading an invalid candidate must not make it publishable"
    );
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn sdk_view_combines_typed_prefix_changes_with_candidate_writes_and_deletions() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut prefix = TransactionOverlayV1::new(&store);
    prefix
        .replace_scalar(
            Scalar::PartName {
                part_id: id("part-z"),
            },
            Value::PartName("prefix name".into()),
        )
        .unwrap();
    let mut candidate = Candidate::new(prefix, document.id.clone());
    let added = raw_part("temporary");
    let source = candidate.insert_part(added.clone(), None).unwrap();
    let mut expected = raw(&document);
    expected.parts[0].name = "prefix name".into();
    expected.parts.insert(0, added);
    assert_eq!(project(&mut candidate), expected);
    candidate.hide(&source).unwrap();
    expected.parts.remove(0);
    assert_eq!(project(&mut candidate), expected);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn sdk_view_preserves_opaque_utf16_and_signed_zero_without_payload_interpretation() {
    let mut document = fixture();
    let opaque_key = JsString::from_utf16(vec![0xd800]);
    document.extensions[0].payload.insert(
        opaque_key.clone(),
        brilliant_core_types::JsonValue::Array(vec![
            brilliant_core_types::JsonValue::Number(
                brilliant_core_types::FiniteNumber::from_js_number(-0.0).unwrap(),
            ),
            brilliant_core_types::JsonValue::String(JsString::from_utf16(vec![0xdfff, 0xd800])),
        ]),
    );
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let projected = project(&mut candidate);
    assert_eq!(projected, raw(&document));
    assert_eq!(
        projected.extensions[0].payload[&opaque_key],
        document.extensions[0].payload[&opaque_key]
    );
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn sdk_view_does_not_transfer_deleted_extensions_to_a_new_part_with_the_same_id() {
    let mut document = fixture();
    document.extensions[0].owner = score::ExtensionOwnerV1::Part {
        part_id: document.parts[0].id.clone(),
    };
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let old = Occurrence::prefix(Entity::Part {
        part_id: document.parts[0].id.clone(),
    });
    let owned = candidate.read_part_extensions(&old).unwrap();
    candidate.remove_part_extensions(&old, &owned).unwrap();
    candidate.hide(&old).unwrap();
    let mut expected = raw(&document);
    expected.extensions.remove(0);
    expected.parts[0].name = "new lifetime".into();
    candidate
        .insert_part(expected.parts[0].clone(), None)
        .unwrap();
    assert_eq!(project(&mut candidate), expected);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn sdk_view_reservation_failures_never_return_partial_success_or_allow_reuse() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut probe = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    project(&mut probe);
    let attempts = probe.reservation.attempts;
    assert!(attempts > 10);
    for fail_at in 1..=attempts {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        candidate.reservation = Reservation::fail_at(fail_at);
        assert!(
            candidate.integrated_document(&|id| Ok(id.clone())).is_err(),
            "reservation {fail_at}"
        );
        assert!(
            candidate.integrated_document(&|id| Ok(id.clone())).is_err(),
            "poisoned read {fail_at}"
        );
        assert!(
            candidate.validate_final().is_err(),
            "poisoned adoption {fail_at}"
        );
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn sdk_view_rejects_inconsistent_visible_fields_instead_of_omitting_a_child() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    candidate.values.insert(
        Occurrence::prefix(Entity::Note {
            note_id: id("note-a"),
        }),
        Value::PartName("wrong scalar".into()),
    );
    assert!(candidate.integrated_document(&|id| Ok(id.clone())).is_err());
    assert!(candidate.validate_final().is_err());
    assert_eq!(store.export_document().unwrap(), document);
}
