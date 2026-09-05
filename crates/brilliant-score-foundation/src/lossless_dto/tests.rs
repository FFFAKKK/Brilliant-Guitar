use super::*;
use crate::{
    canonical_score_bytes, codec::SMOKE_DOCUMENT, decode_lossless_json, decode_score_document_value,
};

fn oracle() -> serde_json::Value {
    serde_json::from_str(include_str!(
        "../../../../test/core-kernel/rust-migration/fixtures/lossless-score-dto-oracle-v1.json"
    ))
    .unwrap()
}

fn encode<T: LosslessEncode>(value: &T) -> Vec<u8> {
    let mut output = Vec::new();
    value.write_lossless(&mut output).unwrap();
    output
}

#[test]
fn borrowed_field_keys_preserve_order_lookup_and_error_paths_for_all_key_shapes() {
    let fields = [
        "apiVersion",
        "",
        "\0\n",
        "é/😀",
        "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    ];
    for field in fields {
        let key = JsString::from(field);
        let high = JsString::from_utf16(vec![0xd800]);
        let mut object = BTreeMap::from([
            (key.clone(), LosslessJsonValue::String("value".into())),
            (high.clone(), LosslessJsonValue::Bool(false)),
        ]);
        assert_eq!(
            with_json_field_key(field, |units| object.get(units)),
            Some(&LosslessJsonValue::String("value".into()))
        );
        assert_eq!(
            object.get(high.code_units()),
            Some(&LosslessJsonValue::Bool(false))
        );
        object.remove(high.code_units());
        let mut reader = ObjectReader::new(LosslessJsonValue::Object(object)).unwrap();
        assert!(reader.take::<JsString>(field).unwrap().eq_ascii("value"));
        assert_eq!(reader.optional::<JsString>(field).unwrap(), None);
        let error = reader.take::<JsString>(field).unwrap_err();
        assert_eq!(error.failure, LosslessValueFailure::MissingField);
        assert_eq!(error.path, vec![LosslessValuePath::Field(key)]);
        reader.end().unwrap();
    }
}

#[test]
fn complete_lossless_score_preserves_every_text_id_reference_and_extension_key() {
    for sample in oracle()["samples"].as_array().unwrap() {
        let input = sample["input"].as_str().unwrap();
        let document =
            LosslessScoreDocumentV1::from_lossless_value(decode_lossless_json(input).unwrap())
                .unwrap();
        let expected: Vec<u16> = sample["units"]
            .as_array()
            .unwrap()
            .iter()
            .map(|value| value.as_u64().unwrap() as u16)
            .collect();
        assert_eq!(document.metadata.title.code_units(), expected);
        assert_eq!(document.parts[0].name.code_units(), expected);
        assert_eq!(document.parts[0].instrument.name.code_units(), expected);
        assert_eq!(
            document.parts[0].staves[0].id,
            document.parts[0].measure_contents[0].voices[0].default_staff_id
        );
        assert_eq!(
            encode(&document),
            input.as_bytes(),
            "sample {}",
            sample["index"]
        );
        assert_eq!(
            LosslessScoreDocumentV1::from_lossless_value(
                decode_lossless_json(std::str::from_utf8(&encode(&document)).unwrap()).unwrap()
            )
            .unwrap(),
            document
        );
    }
}

#[test]
fn existing_strong_dto_and_declared_wire_order_remain_identical() {
    let value = decode_lossless_json(SMOKE_DOCUMENT).unwrap();
    let strong = ScoreDocumentV1::from_lossless_value(value.clone()).unwrap();
    let legacy =
        decode_score_document_value(serde_json::from_str(SMOKE_DOCUMENT).unwrap()).unwrap();
    assert_eq!(strong, legacy);
    assert_eq!(encode(&strong), canonical_score_bytes(&legacy).unwrap());
    assert_eq!(
        encode(&LosslessScoreDocumentV1::from_lossless_value(value).unwrap()),
        canonical_score_bytes(&legacy).unwrap()
    );
    let event: RhythmicEventV1 = RhythmicEventV1::from_lossless_value(decode_lossless_json(r#"{"id":"e","duration":{"base":4,"dots":0,"timeModification":{"actualNotes":3,"normalNotes":2}},"staffId":"s","content":{"kind":"rest"}}"#).unwrap()).unwrap();
    assert_eq!(encode(&event), serde_json::to_vec(&event).unwrap());
    let measure: MeasureDefinitionV1 = MeasureDefinitionV1::from_lossless_value(decode_lossless_json(r#"{"id":"m","meter":{"numerator":4,"denominator":4},"pickupDuration":{"numerator":1,"denominator":4}}"#).unwrap()).unwrap();
    assert_eq!(encode(&measure), serde_json::to_vec(&measure).unwrap());
}

#[test]
fn ordinary_serde_fails_closed_for_non_scalar_text_in_values_keys_and_full_dtos() {
    for units in [vec![0xd800], vec![0xdc00]] {
        let text = JsString::from_utf16(units);
        assert!(serde_json::to_vec(&text).is_err());
        assert!(serde_json::to_value(&text).is_err());
        let key = BTreeMap::from([(text.clone(), JsonValue::<JsString>::Null)]);
        assert!(serde_json::to_vec(&key).is_err());
        assert!(serde_json::to_value(&key).is_err());
        assert!(serde_json::to_vec(&JsonValue::String(text)).is_err());
        assert!(decode_lossless_json(std::str::from_utf8(&encode(&key)).unwrap()).is_ok());
    }
    for invalid in ["null", "0", "[55296]", "{\"units\":[55296]}"] {
        assert!(serde_json::from_str::<JsString>(invalid).is_err());
    }
    for text in ["ordinary", "🎸", "\u{e000}", "\u{fffd}"] {
        let encoded = serde_json::to_vec(&JsString::from(text)).unwrap();
        assert_eq!(
            serde_json::from_slice::<JsString>(&encoded).unwrap(),
            JsString::from(text)
        );
    }
    for index in [1, 2] {
        let oracle = oracle();
        let sample = oracle["samples"][index]["input"].as_str().unwrap();
        let dto =
            LosslessScoreDocumentV1::from_lossless_value(decode_lossless_json(sample).unwrap())
                .unwrap();
        assert!(serde_json::to_vec(&dto).is_err());
        assert!(serde_json::to_value(&dto).is_err());
        let strong: ScoreDocumentV1 =
            ScoreDocumentV1::from_lossless_value(decode_lossless_json(sample).unwrap()).unwrap();
        assert_eq!(strong.id.as_js_string(), &dto.id);
        assert_eq!(encode(&strong), encode(&dto));
        assert!(serde_json::to_vec(&strong).is_err());
        let error = ScoreDocumentV1::<String, String>::from_lossless_value(
            decode_lossless_json(sample).unwrap(),
        )
        .unwrap_err();
        assert_eq!(error.failure, LosslessValueFailure::NonScalarText);
        assert_eq!(error.path, [LosslessValuePath::Field("id".into())]);
        let error = ScoreDocumentV1::<StableId, String>::from_lossless_value(
            decode_lossless_json(sample).unwrap(),
        )
        .unwrap_err();
        assert_eq!(error.failure, LosslessValueFailure::NonScalarText);
        assert_eq!(
            error.path,
            [
                LosslessValuePath::Field("metadata".into()),
                LosslessValuePath::Field("title".into())
            ]
        );
    }
}

fn mutate<'a>(value: &'a mut LosslessJsonValue, path: &[&str]) -> &'a mut LosslessJsonValue {
    let mut target = value;
    for field in path {
        target = match target {
            JsonValue::Object(values) => values.get_mut(&JsString::from(*field)).unwrap(),
            JsonValue::Array(values) => &mut values[field.parse::<usize>().unwrap()],
            _ => panic!("fixture path"),
        };
    }
    target
}

#[test]
fn every_score_component_rejects_extra_and_missing_fields_with_exact_lossless_paths() {
    let mut base = decode_lossless_json(SMOKE_DOCUMENT).unwrap();
    let event_path = [
        "parts",
        "0",
        "measureContents",
        "0",
        "voices",
        "0",
        "sequence",
        "events",
        "0",
    ];
    *mutate(&mut base, &event_path) = decode_lossless_json(r#"{"id":"e","duration":{"base":4,"dots":0,"timeModification":{"actualNotes":3,"normalNotes":2}},"content":{"kind":"notes","notes":[{"id":"n","writtenPitch":{"step":"C","alter":0,"octave":4}}]}}"#).unwrap();
    let mut paths: Vec<Vec<&str>> = vec![
        vec![],
        vec!["metadata"],
        vec!["metadata", "tempo"],
        vec!["measureDefinitions", "0"],
        vec!["measureDefinitions", "0", "meter"],
        vec!["parts", "0"],
        vec!["parts", "0", "instrument"],
        vec!["parts", "0", "instrument", "writtenToSounding"],
        vec!["parts", "0", "staves", "0"],
        vec!["parts", "0", "staves", "0", "defaultClef"],
        vec!["parts", "0", "measureContents", "0"],
        vec!["parts", "0", "measureContents", "0", "voices", "0"],
        vec![
            "parts",
            "0",
            "measureContents",
            "0",
            "voices",
            "0",
            "sequence",
        ],
        vec![
            "parts",
            "0",
            "measureContents",
            "0",
            "voices",
            "0",
            "sequence",
            "start",
        ],
        vec![
            "parts",
            "0",
            "measureContents",
            "0",
            "voices",
            "0",
            "sequence",
            "events",
            "0",
        ],
        vec![
            "parts",
            "0",
            "measureContents",
            "0",
            "voices",
            "0",
            "sequence",
            "events",
            "0",
            "duration",
        ],
        vec![
            "parts",
            "0",
            "measureContents",
            "0",
            "voices",
            "0",
            "sequence",
            "events",
            "0",
            "content",
        ],
        vec!["extensions", "0"],
        vec!["extensions", "0", "owner"],
    ];
    for suffix in [
        vec!["duration", "timeModification"],
        vec!["content", "notes", "0"],
        vec!["content", "notes", "0", "writtenPitch"],
    ] {
        let mut path = event_path.to_vec();
        path.extend(suffix);
        paths.push(path);
    }
    let raw_extra = JsString::from_utf16(vec![0xd800]);
    for path in paths {
        let expected_path: Vec<_> = path
            .iter()
            .map(|field| {
                field.parse::<usize>().map_or_else(
                    |_| LosslessValuePath::Field((*field).into()),
                    LosslessValuePath::Index,
                )
            })
            .collect();
        let mut extra = base.clone();
        let JsonValue::Object(fields) = mutate(&mut extra, &path) else {
            panic!("object")
        };
        let keys: Vec<_> = fields.keys().cloned().collect();
        fields.insert(raw_extra.clone(), JsonValue::Null);
        let error = LosslessScoreDocumentV1::from_lossless_value(extra).unwrap_err();
        assert_eq!(error.failure, LosslessValueFailure::ExtraField, "{path:?}");
        let mut extra_path = expected_path.clone();
        extra_path.push(LosslessValuePath::Field(raw_extra.clone()));
        assert_eq!(error.path, extra_path);
        for key in keys {
            let mut missing = base.clone();
            let JsonValue::Object(fields) = mutate(&mut missing, &path) else {
                panic!("object")
            };
            fields.remove(&key);
            if key.eq_ascii("timeModification") {
                assert!(LosslessScoreDocumentV1::from_lossless_value(missing).is_ok());
                continue;
            }
            let error = LosslessScoreDocumentV1::from_lossless_value(missing).unwrap_err();
            assert_eq!(
                error.failure,
                LosslessValueFailure::MissingField,
                "{path:?} {key:?}"
            );
            let mut missing_path = expected_path.clone();
            missing_path.push(LosslessValuePath::Field(key));
            assert_eq!(error.path, missing_path);
        }
    }
}

#[test]
fn optional_null_variants_safe_integers_and_raw_ids_keep_their_individual_contracts() {
    for input in [
        r#"{"id":"e","duration":{"base":4,"dots":0},"staffId":null,"content":{"kind":"rest"}}"#,
        r#"{"id":"e","duration":{"base":4,"dots":0,"timeModification":null},"content":{"kind":"rest"}}"#,
    ] {
        assert_eq!(
            RhythmicEventV1::<JsString>::from_lossless_value(decode_lossless_json(input).unwrap())
                .unwrap_err()
                .failure,
            LosslessValueFailure::WrongType
        );
    }
    for input in [
        r#"{"kind":"rest","notes":[]}"#,
        r#"{"kind":"notes"}"#,
        r#"{"kind":"\ud800"}"#,
    ] {
        assert!(
            RhythmicContentV1::<JsString>::from_lossless_value(
                decode_lossless_json(input).unwrap()
            )
            .is_err()
        );
    }
    assert!(
        ExtensionOwnerV1::<JsString>::from_lossless_value(
            decode_lossless_json(r#"{"kind":"score","partId":"x"}"#).unwrap()
        )
        .is_err()
    );
    assert!(
        ExtensionOwnerV1::<JsString>::from_lossless_value(
            decode_lossless_json(r#"{"kind":"part","part_id":"x"}"#).unwrap()
        )
        .is_err()
    );
    for number in [0.5, 9007199254740992.0, -9007199254740992.0] {
        assert_eq!(
            SafeInteger::from_lossless_value(JsonValue::Number(FiniteNumber::new(number).unwrap()))
                .unwrap_err()
                .failure,
            LosslessValueFailure::InvalidValue
        );
    }
    for number in [0.0, -9007199254740991.0, 9007199254740991.0] {
        assert_eq!(
            SafeInteger::from_lossless_value(JsonValue::Number(FiniteNumber::new(number).unwrap()))
                .unwrap()
                .get(),
            number as i64
        );
    }
    let raw = decode_lossless_json(r#""""#).unwrap();
    assert!(
        JsString::from_lossless_value(raw.clone())
            .unwrap()
            .is_empty()
    );
    assert!(StableId::from_lossless_value(raw).is_err());
}

#[test]
fn opaque_payload_conversion_reuses_the_owned_tree_and_shared_text() {
    let value = decode_lossless_json(r#"{"namespace":"example.opaque","schemaVersion":1,"owner":{"kind":"score"},"payload":{"\ud800":{"\udc00":["\ud800",0,null]}}}"#).unwrap();
    let JsonValue::Object(root) = &value else {
        panic!("root")
    };
    let JsonValue::Object(payload) = &root[&JsString::from("payload")] else {
        panic!("payload")
    };
    let (key, JsonValue::Object(inner)) = payload.first_key_value().unwrap() else {
        panic!("nested")
    };
    let key_ptr = key.code_units().as_ptr();
    let (inner_key, JsonValue::Array(items)) = inner.first_key_value().unwrap() else {
        panic!("array")
    };
    let inner_key_ptr = inner_key.code_units().as_ptr();
    let items_ptr = items.as_ptr();
    let dto = ExtensionBlockV1::<JsString, JsString>::from_lossless_value(value).unwrap();
    let (key, JsonValue::Object(inner)) = dto.payload.first_key_value().unwrap() else {
        panic!("decoded")
    };
    let (inner_key, JsonValue::Array(items)) = inner.first_key_value().unwrap() else {
        panic!("decoded array")
    };
    assert_eq!(key.code_units().as_ptr(), key_ptr);
    assert_eq!(inner_key.code_units().as_ptr(), inner_key_ptr);
    assert_eq!(items.as_ptr(), items_ptr);
}

#[test]
fn dto_writer_failures_and_payload_root_limits_do_not_publish_partial_values() {
    struct FailAfter {
        remaining: usize,
        bytes: Vec<u8>,
    }
    impl Write for FailAfter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            if self.remaining == 0 {
                return Err(std::io::Error::other("injected"));
            }
            let count = self.remaining.min(bytes.len());
            self.bytes.extend_from_slice(&bytes[..count]);
            self.remaining -= count;
            Ok(count)
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let dto = ScoreMetadataV1::<JsString>::from_lossless_value(
        decode_lossless_json(r#"{"title":"\ud800","authors":["🎸"],"tempo":{"bpm":120.5}}"#)
            .unwrap(),
    )
    .unwrap();
    let expected = encode(&dto);
    for remaining in 0..expected.len() {
        let mut writer = FailAfter {
            remaining,
            bytes: Vec::new(),
        };
        assert!(dto.write_lossless(&mut writer).is_err());
        assert_eq!(writer.bytes, expected[..remaining]);
    }
    let half = brilliant_core_types::JSON_PROPERTY_LIMIT / 2;
    let payload = BTreeMap::from([
        (
            JsString::from("a"),
            JsonValue::Array(vec![JsonValue::Null; half]),
        ),
        (
            JsString::from("b"),
            JsonValue::Array(vec![JsonValue::Null; half]),
        ),
    ]);
    assert!(
        payload
            .values()
            .all(|value| value.validate_limits().is_ok())
    );
    let mut bytes = Vec::new();
    assert!(matches!(
        payload.write_lossless(&mut bytes),
        Err(LosslessJsonError::Limit(_))
    ));
    assert!(bytes.is_empty());
}
