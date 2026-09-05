use brilliant_core_types::{FiniteNumber, ScoreSchemaVersionV1, StablePathV1};
use serde_json::Value;

use crate::LosslessDecode;
use crate::{ScoreDocumentV1, validation::validate_score_document};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FoundationDecodeFailure {
    InvalidShape { path: StablePathV1 },
    UnsupportedSchema,
    DuplicateId { path: StablePathV1 },
    InvalidReference { path: StablePathV1 },
    InvalidValue { path: StablePathV1 },
    InternalCapacity,
}

pub fn decode_score_document_value(
    value: Value,
) -> Result<ScoreDocumentV1, FoundationDecodeFailure> {
    let schema = value
        .as_object()
        .and_then(|object| object.get("schemaVersion"))
        .and_then(Value::as_str)
        .ok_or_else(|| FoundationDecodeFailure::InvalidShape {
            path: StablePathV1::field("schemaVersion"),
        })?;
    if schema != ScoreSchemaVersionV1::VALUE {
        return Err(FoundationDecodeFailure::UnsupportedSchema);
    }
    let document: ScoreDocumentV1 =
        serde_json::from_value(value).map_err(|_| FoundationDecodeFailure::InvalidShape {
            path: StablePathV1::root(),
        })?;
    validate_score_document(&document)?;
    Ok(document)
}

/// Production request path after Contracts' bounded structural capture.
/// It shares semantic validation with the legacy scalar-Unicode test adapter.
pub fn decode_lossless_score_document_value(
    value: brilliant_core_types::LosslessJsonValue,
) -> Result<ScoreDocumentV1, FoundationDecodeFailure> {
    use brilliant_core_types::{JsString, JsonValue};
    let schema = match &value {
        JsonValue::Object(fields) => fields.get(&JsString::from("schemaVersion")),
        _ => None,
    };
    let Some(JsonValue::String(schema)) = schema else {
        return Err(FoundationDecodeFailure::InvalidShape {
            path: StablePathV1::field("schemaVersion"),
        });
    };
    if !schema.eq_ascii(ScoreSchemaVersionV1::VALUE) {
        return Err(FoundationDecodeFailure::UnsupportedSchema);
    }
    let document = ScoreDocumentV1::from_lossless_value(value).map_err(|_| {
        FoundationDecodeFailure::InvalidShape {
            path: StablePathV1::root(),
        }
    })?;
    validate_score_document(&document)?;
    Ok(document)
}

pub fn canonical_score_bytes(
    document: &ScoreDocumentV1,
) -> Result<Vec<u8>, FoundationDecodeFailure> {
    serde_json::to_vec(document).map_err(|_| FoundationDecodeFailure::InvalidValue {
        path: StablePathV1::root(),
    })
}

/// Exact scalar wire length for the Runtime's checked logical-byte budget.
/// JSON formatting stays in Foundation instead of adding a codec to Runtime.
pub fn finite_number_json_len(value: &FiniteNumber) -> u64 {
    serde_json::to_string(value)
        .expect("FiniteNumber always serializes")
        .len() as u64
}

#[cfg(test)]
pub(crate) const SMOKE_DOCUMENT: &str = r#"{"schemaVersion":"brilliant-score-1","id":"score-rkp1","metadata":{"title":"Smoke","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-1","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-1","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-1","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-1","voices":[{"id":"voice-1","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-1","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[{"namespace":"example.rkp1","schemaVersion":1,"owner":{"kind":"score"},"payload":{"z":[1,true,null],"a":{"future":"kept"}}}]}"#;

#[cfg(test)]
mod tests {
    use brilliant_core_types::StableId;

    use super::*;
    use crate::ExtensionOwnerV1;

    #[test]
    fn finite_json_preserves_extremes_and_uses_wire_lengths_for_resource_budgets() {
        for (wire, expected) in [
            ("0", 0.0),
            ("0.125", 0.125),
            ("-0.125", -0.125),
            ("1e+100", 1e100),
            ("5e-324", f64::from_bits(1)),
            ("1.7976931348623157e+308", f64::MAX),
            ("-9.084938291167941e+48", -9.084938291167941e48),
        ] {
            let decoded: FiniteNumber = serde_json::from_str(wire).expect("finite JSON");
            assert_eq!(decoded.get().to_bits(), expected.to_bits(), "{wire}");
            assert_eq!(serde_json::to_string(&decoded).expect("encode"), wire);
            assert_eq!(finite_number_json_len(&decoded), wire.len() as u64);
        }
    }

    #[test]
    fn extension_owner_exact_score_and_public_part_wire_round_trip() {
        let score: ExtensionOwnerV1 =
            serde_json::from_str(r#"{"kind":"score"}"#).expect("exact score owner");
        assert_eq!(score, ExtensionOwnerV1::Score);
        assert_eq!(
            serde_json::to_value(&score).expect("encode score owner"),
            serde_json::json!({"kind": "score"})
        );

        let part: ExtensionOwnerV1 = serde_json::from_str(r#"{"kind":"part","partId":"part-1"}"#)
            .expect("public partId owner");
        assert_eq!(
            part,
            ExtensionOwnerV1::Part {
                part_id: StableId::new("part-1").expect("stable part id"),
            }
        );
        assert_eq!(
            serde_json::to_value(&part).expect("encode part owner"),
            serde_json::json!({"kind": "part", "partId": "part-1"})
        );
    }

    #[test]
    fn extension_owner_part_rejects_private_or_extra_fields() {
        for rejected in [
            r#"{"kind":"part","part_id":"part-1"}"#,
            r#"{"kind":"part","partId":"part-1","part_id":"part-1"}"#,
            r#"{"kind":"part","partId":"part-1","extra":true}"#,
        ] {
            assert!(
                serde_json::from_str::<ExtensionOwnerV1>(rejected).is_err(),
                "Part owner shape must reject: {rejected}"
            );
        }
    }

    #[test]
    fn canonical_smoke_round_trip_preserves_unknown_extension_data() {
        let value: Value = serde_json::from_str(SMOKE_DOCUMENT).expect("fixture JSON");
        let document = decode_score_document_value(value).expect("valid smoke document");
        let first = canonical_score_bytes(&document).expect("first encode");
        let decoded: Value = serde_json::from_slice(&first).expect("encoded JSON");
        let second =
            canonical_score_bytes(&decode_score_document_value(decoded).expect("second decode"))
                .expect("second encode");
        assert_eq!(first, second);
        assert!(
            String::from_utf8(first)
                .expect("UTF-8")
                .contains(r#""a":{"future":"kept"},"z""#)
        );
    }

    #[test]
    fn future_schema_and_extra_fields_are_rejected() {
        let mut future: Value = serde_json::from_str(SMOKE_DOCUMENT).expect("fixture JSON");
        future["schemaVersion"] = Value::String("brilliant-score-2".to_owned());
        assert_eq!(
            decode_score_document_value(future),
            Err(FoundationDecodeFailure::UnsupportedSchema)
        );

        let mut extra: Value = serde_json::from_str(SMOKE_DOCUMENT).expect("fixture JSON");
        extra["extra"] = Value::Bool(true);
        assert_eq!(
            decode_score_document_value(extra),
            Err(FoundationDecodeFailure::InvalidShape {
                path: StablePathV1::root(),
            })
        );
    }

    #[test]
    fn structural_failures_retain_exact_static_nested_paths() {
        let value: Value = serde_json::from_str(SMOKE_DOCUMENT).expect("fixture JSON");
        let mut invalid_reference =
            decode_score_document_value(value.clone()).expect("valid smoke document");
        invalid_reference.parts[0].measure_contents[0].voices[0].default_staff_id =
            StableId::new("missing-staff").expect("stable id");
        assert_eq!(
            validate_score_document(&invalid_reference),
            Err(FoundationDecodeFailure::InvalidReference {
                path: StablePathV1::new(vec![
                    brilliant_core_types::StablePathSegmentV1::Field("parts".to_owned()),
                    brilliant_core_types::StablePathSegmentV1::Index(0),
                    brilliant_core_types::StablePathSegmentV1::Field("measureContents".to_owned()),
                    brilliant_core_types::StablePathSegmentV1::Index(0),
                    brilliant_core_types::StablePathSegmentV1::Field("voices".to_owned()),
                    brilliant_core_types::StablePathSegmentV1::Index(0),
                    brilliant_core_types::StablePathSegmentV1::Field("defaultStaffId".to_owned()),
                ])
                .expect("stable path"),
            })
        );

        let mut duplicate = decode_score_document_value(value).expect("valid smoke document");
        duplicate.parts[0].staves[0].id = duplicate.measure_definitions[0].id.clone();
        assert_eq!(
            validate_score_document(&duplicate),
            Err(FoundationDecodeFailure::DuplicateId {
                path: StablePathV1::new(vec![
                    brilliant_core_types::StablePathSegmentV1::Field("parts".to_owned()),
                    brilliant_core_types::StablePathSegmentV1::Index(0),
                    brilliant_core_types::StablePathSegmentV1::Field("staves".to_owned()),
                    brilliant_core_types::StablePathSegmentV1::Index(0),
                    brilliant_core_types::StablePathSegmentV1::Field("id".to_owned()),
                ])
                .expect("stable path"),
            })
        );
    }
}
