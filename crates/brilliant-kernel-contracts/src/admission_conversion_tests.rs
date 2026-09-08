use crate::*;
use brilliant_core_types::JsString;
use brilliant_score_foundation::LosslessEncode;
use serde_json::{Value, json};

#[test]
fn admission_matrix_keeps_stage4_payloads_and_consuming_conversions_exact() {
    let oracle: Value = serde_json::from_str(include_str!(
        "../../../test/core-kernel/rust-migration/fixtures/command-admission-oracle-v1.json"
    ))
    .unwrap();
    let mut checked = 0;
    let mut raw_only = 0;
    for entry in oracle["cases"].as_array().unwrap() {
        let input = &entry["input"];
        let bytes = serde_json::to_vec(&json!({"apiVersion":1,"command":input})).unwrap();
        let Ok(raw) = decode_admission_submit_request(&bytes) else {
            continue;
        };
        let stage4 = serde_json::to_vec(
            &json!({"apiVersion":1,"operation":{"kind":"submit","command":input}}),
        )
        .unwrap();
        let decoded = decode_admission_stage4_operation_request(&stage4).unwrap();
        let KernelStage4OperationV1::Submit { command } = decoded.operation else {
            panic!("submit")
        };
        assert_eq!(command, raw.command, "{}", entry["id"]);
        match (
            decode_stage3_submit_request(&bytes),
            raw.command.clone().try_into_stable(),
        ) {
            (Ok(stable), Ok(converted)) => {
                assert_eq!(converted, stable.command, "{}", entry["id"]);
                assert_eq!(converted.into_admission(), raw.command, "{}", entry["id"]);
            }
            (Err(_), Err(retained)) => {
                assert_eq!(retained, raw.command, "{}", entry["id"]);
                raw_only += 1;
            }
            (decoded, converted) => panic!(
                "{}: representability drift {decoded:?} {converted:?}",
                entry["id"]
            ),
        }
        checked += 1;
    }
    assert!(checked > 50);
    assert!(raw_only > 0);
}

#[test]
fn raw_stage4_non_submit_paths_keep_existing_failure_and_operation_contracts() {
    for operation in [
        json!({"kind":"undo"}),
        json!({"kind":"redo"}),
        json!({"kind":"mark-persisted","checkpoint":{"documentId":"x"}}),
        json!({"kind":"read","knownSnapshotVersion":null}),
        json!({"kind":"select","selector":{"selectorId":"core.selector.history-state"}}),
    ] {
        let bytes = serde_json::to_vec(&json!({"apiVersion":1,"operation":operation})).unwrap();
        assert_eq!(
            format!("{:?}", decode_stage4_operation_request(&bytes)),
            format!("{:?}", decode_admission_stage4_operation_request(&bytes))
        );
    }
    for bytes in [
        b"{}".as_slice(),
        br#"{"apiVersion":2,"operation":{"kind":"undo"}}"#,
        br#"{"apiVersion":1,"operation":{"kind":"undo","extra":0}}"#,
    ] {
        assert_eq!(
            decode_stage4_operation_request(bytes).unwrap_err(),
            decode_admission_stage4_operation_request(bytes).unwrap_err()
        );
    }
}

#[test]
fn range_transform_failure_preserves_empty_and_unpaired_note_ids() {
    for raw in [JsString::from(""), JsString::from_utf16(vec![0xd800])] {
        let failure = KernelStage3CommandFailureLeafV1::RangeTransformInvalid {
            address: NoteAddressV1::Note {
                note_id: raw.clone().into(),
            },
            reason: PitchTranspositionErrorV1::DerivedPitchAlterOutOfRange,
        };
        let mut bytes = Vec::new();
        failure.write_lossless(&mut bytes).unwrap();
        let decoded =
            brilliant_score_foundation::decode_lossless_json(std::str::from_utf8(&bytes).unwrap())
                .unwrap();
        let brilliant_core_types::JsonValue::Object(fields) = decoded else {
            panic!("failure object")
        };
        let brilliant_core_types::JsonValue::Object(address) = &fields[&JsString::from("address")]
        else {
            panic!("address object")
        };
        assert_eq!(
            address[&JsString::from("noteId")],
            brilliant_core_types::JsonValue::String(raw)
        );
    }
}
