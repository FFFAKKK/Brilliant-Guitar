use std::collections::BTreeSet;

use brilliant_core_types::{ScoreSchemaVersionV1, StableId};
use serde_json::Value;

use crate::{RhythmicContentV1, ScoreDocumentV1};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FoundationDecodeFailure {
    InvalidShape,
    UnsupportedSchema,
    DuplicateId,
    InvalidReference,
    InvalidValue,
}

pub fn decode_score_document_value(
    value: Value,
) -> Result<ScoreDocumentV1, FoundationDecodeFailure> {
    let schema = value
        .as_object()
        .and_then(|object| object.get("schemaVersion"))
        .and_then(Value::as_str)
        .ok_or(FoundationDecodeFailure::InvalidShape)?;
    if schema != ScoreSchemaVersionV1::VALUE {
        return Err(FoundationDecodeFailure::UnsupportedSchema);
    }
    let document: ScoreDocumentV1 =
        serde_json::from_value(value).map_err(|_| FoundationDecodeFailure::InvalidShape)?;
    validate_structure(&document)?;
    Ok(document)
}

pub fn canonical_score_bytes(
    document: &ScoreDocumentV1,
) -> Result<Vec<u8>, FoundationDecodeFailure> {
    serde_json::to_vec(document).map_err(|_| FoundationDecodeFailure::InvalidValue)
}

fn insert_id(ids: &mut BTreeSet<String>, id: &StableId) -> Result<(), FoundationDecodeFailure> {
    if ids.insert(id.as_str().to_owned()) {
        Ok(())
    } else {
        Err(FoundationDecodeFailure::DuplicateId)
    }
}

fn validate_structure(document: &ScoreDocumentV1) -> Result<(), FoundationDecodeFailure> {
    if document.measure_definitions.is_empty() || document.parts.is_empty() {
        return Err(FoundationDecodeFailure::InvalidValue);
    }

    let mut ids = BTreeSet::new();
    let mut measure_ids = BTreeSet::new();
    for measure in &document.measure_definitions {
        insert_id(&mut ids, &measure.id)?;
        measure_ids.insert(measure.id.as_str());
        if measure.meter.numerator.get() <= 0
            || !matches!(
                measure.meter.denominator.get(),
                1 | 2 | 4 | 8 | 16 | 32 | 64
            )
        {
            return Err(FoundationDecodeFailure::InvalidValue);
        }
    }

    for part in &document.parts {
        insert_id(&mut ids, &part.id)?;
        if part.staves.is_empty() || part.measure_contents.len() != measure_ids.len() {
            return Err(FoundationDecodeFailure::InvalidReference);
        }
        let mut staff_ids = BTreeSet::new();
        for staff in &part.staves {
            insert_id(&mut ids, &staff.id)?;
            staff_ids.insert(staff.id.as_str());
            if !(1..=5).contains(&staff.default_clef.line.get()) || staff.line_count.get() <= 0 {
                return Err(FoundationDecodeFailure::InvalidValue);
            }
        }
        let mut covered = BTreeSet::new();
        for content in &part.measure_contents {
            if !measure_ids.contains(content.measure_id.as_str())
                || !covered.insert(content.measure_id.as_str())
                || content.voices.is_empty()
            {
                return Err(FoundationDecodeFailure::InvalidReference);
            }
            for voice in &content.voices {
                insert_id(&mut ids, &voice.id)?;
                if !staff_ids.contains(voice.default_staff_id.as_str()) {
                    return Err(FoundationDecodeFailure::InvalidReference);
                }
                for event in &voice.sequence.events {
                    insert_id(&mut ids, &event.id)?;
                    if let Some(staff_id) = &event.staff_id
                        && !staff_ids.contains(staff_id.as_str())
                    {
                        return Err(FoundationDecodeFailure::InvalidReference);
                    }
                    if let RhythmicContentV1::Notes { notes } = &event.content {
                        if notes.is_empty() {
                            return Err(FoundationDecodeFailure::InvalidValue);
                        }
                        for note in notes {
                            insert_id(&mut ids, &note.id)?;
                        }
                    }
                }
            }
        }
    }

    for extension in &document.extensions {
        if extension.namespace.is_empty() || extension.schema_version.get() <= 0 {
            return Err(FoundationDecodeFailure::InvalidValue);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SMOKE_DOCUMENT: &str = r#"{"schemaVersion":"brilliant-score-1","id":"score-rkp1","metadata":{"title":"Smoke","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-1","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-1","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-1","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-1","voices":[{"id":"voice-1","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-1","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[{"namespace":"example.rkp1","schemaVersion":1,"owner":{"kind":"score"},"payload":{"z":[1,true,null],"a":{"future":"kept"}}}]}"#;

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
            Err(FoundationDecodeFailure::InvalidShape)
        );
    }
}
