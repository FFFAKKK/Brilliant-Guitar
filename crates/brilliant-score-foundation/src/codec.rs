use brilliant_core_types::{ScoreSchemaVersionV1, StablePathV1};
use serde_json::Value;

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

pub fn canonical_score_bytes(
    document: &ScoreDocumentV1,
) -> Result<Vec<u8>, FoundationDecodeFailure> {
    serde_json::to_vec(document).map_err(|_| FoundationDecodeFailure::InvalidValue {
        path: StablePathV1::root(),
    })
}

#[cfg(test)]
pub(crate) const SMOKE_DOCUMENT: &str = r#"{"schemaVersion":"brilliant-score-1","id":"score-rkp1","metadata":{"title":"Smoke","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-1","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-1","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-1","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-1","voices":[{"id":"voice-1","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-1","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[{"namespace":"example.rkp1","schemaVersion":1,"owner":{"kind":"score"},"payload":{"z":[1,true,null],"a":{"future":"kept"}}}]}"#;

#[cfg(test)]
mod tests {
    use brilliant_core_types::StableId;

    use super::*;

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
