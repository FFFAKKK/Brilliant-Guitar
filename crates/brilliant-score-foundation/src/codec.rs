use std::collections::BTreeSet;

use brilliant_core_types::{ScoreSchemaVersionV1, StableId, StablePathSegmentV1, StablePathV1};
use serde_json::Value;

use crate::{RhythmicContentV1, ScoreDocumentV1};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FoundationDecodeFailure {
    InvalidShape { path: StablePathV1 },
    UnsupportedSchema,
    DuplicateId { path: StablePathV1 },
    InvalidReference { path: StablePathV1 },
    InvalidValue { path: StablePathV1 },
}

#[derive(Clone, Copy)]
enum PathPart {
    Field(&'static str),
    Index(usize),
}

fn path(parts: &[PathPart]) -> StablePathV1 {
    let segments = parts
        .iter()
        .map(|part| match part {
            PathPart::Field(field) => StablePathSegmentV1::Field((*field).to_owned()),
            PathPart::Index(index) => StablePathSegmentV1::Index(*index as u64),
        })
        .collect();
    StablePathV1::new(segments).unwrap_or_else(|_| StablePathV1::root())
}

pub fn decode_score_document_value(
    value: Value,
) -> Result<ScoreDocumentV1, FoundationDecodeFailure> {
    let schema = value
        .as_object()
        .and_then(|object| object.get("schemaVersion"))
        .and_then(Value::as_str)
        .ok_or_else(|| FoundationDecodeFailure::InvalidShape {
            path: path(&[PathPart::Field("schemaVersion")]),
        })?;
    if schema != ScoreSchemaVersionV1::VALUE {
        return Err(FoundationDecodeFailure::UnsupportedSchema);
    }
    let document: ScoreDocumentV1 =
        serde_json::from_value(value).map_err(|_| FoundationDecodeFailure::InvalidShape {
            path: StablePathV1::root(),
        })?;
    validate_structure(&document)?;
    Ok(document)
}

pub fn canonical_score_bytes(
    document: &ScoreDocumentV1,
) -> Result<Vec<u8>, FoundationDecodeFailure> {
    serde_json::to_vec(document).map_err(|_| FoundationDecodeFailure::InvalidValue {
        path: StablePathV1::root(),
    })
}

fn insert_id(
    ids: &mut BTreeSet<String>,
    id: &StableId,
    id_path: StablePathV1,
) -> Result<(), FoundationDecodeFailure> {
    if ids.insert(id.as_str().to_owned()) {
        Ok(())
    } else {
        Err(FoundationDecodeFailure::DuplicateId { path: id_path })
    }
}

fn validate_structure(document: &ScoreDocumentV1) -> Result<(), FoundationDecodeFailure> {
    if document.measure_definitions.is_empty() {
        return Err(FoundationDecodeFailure::InvalidValue {
            path: path(&[PathPart::Field("measureDefinitions")]),
        });
    }
    if document.parts.is_empty() {
        return Err(FoundationDecodeFailure::InvalidValue {
            path: path(&[PathPart::Field("parts")]),
        });
    }

    let mut ids = BTreeSet::new();
    let mut measure_ids = BTreeSet::new();
    for (measure_index, measure) in document.measure_definitions.iter().enumerate() {
        insert_id(
            &mut ids,
            &measure.id,
            path(&[
                PathPart::Field("measureDefinitions"),
                PathPart::Index(measure_index),
                PathPart::Field("id"),
            ]),
        )?;
        measure_ids.insert(measure.id.as_str());
        if measure.meter.numerator.get() <= 0 {
            return Err(FoundationDecodeFailure::InvalidValue {
                path: path(&[
                    PathPart::Field("measureDefinitions"),
                    PathPart::Index(measure_index),
                    PathPart::Field("meter"),
                    PathPart::Field("numerator"),
                ]),
            });
        }
        if !matches!(
            measure.meter.denominator.get(),
            1 | 2 | 4 | 8 | 16 | 32 | 64
        ) {
            return Err(FoundationDecodeFailure::InvalidValue {
                path: path(&[
                    PathPart::Field("measureDefinitions"),
                    PathPart::Index(measure_index),
                    PathPart::Field("meter"),
                    PathPart::Field("denominator"),
                ]),
            });
        }
    }

    for (part_index, part) in document.parts.iter().enumerate() {
        insert_id(
            &mut ids,
            &part.id,
            path(&[
                PathPart::Field("parts"),
                PathPart::Index(part_index),
                PathPart::Field("id"),
            ]),
        )?;
        if part.measure_contents.len() != measure_ids.len() {
            return Err(FoundationDecodeFailure::InvalidReference {
                path: path(&[
                    PathPart::Field("parts"),
                    PathPart::Index(part_index),
                    PathPart::Field("measureContents"),
                ]),
            });
        }
        if part.staves.is_empty() {
            return Err(FoundationDecodeFailure::InvalidReference {
                path: path(&[
                    PathPart::Field("parts"),
                    PathPart::Index(part_index),
                    PathPart::Field("staves"),
                ]),
            });
        }
        let mut staff_ids = BTreeSet::new();
        for (staff_index, staff) in part.staves.iter().enumerate() {
            insert_id(
                &mut ids,
                &staff.id,
                path(&[
                    PathPart::Field("parts"),
                    PathPart::Index(part_index),
                    PathPart::Field("staves"),
                    PathPart::Index(staff_index),
                    PathPart::Field("id"),
                ]),
            )?;
            staff_ids.insert(staff.id.as_str());
            if !(1..=5).contains(&staff.default_clef.line.get()) {
                return Err(FoundationDecodeFailure::InvalidValue {
                    path: path(&[
                        PathPart::Field("parts"),
                        PathPart::Index(part_index),
                        PathPart::Field("staves"),
                        PathPart::Index(staff_index),
                        PathPart::Field("defaultClef"),
                        PathPart::Field("line"),
                    ]),
                });
            }
            if staff.line_count.get() <= 0 {
                return Err(FoundationDecodeFailure::InvalidValue {
                    path: path(&[
                        PathPart::Field("parts"),
                        PathPart::Index(part_index),
                        PathPart::Field("staves"),
                        PathPart::Index(staff_index),
                        PathPart::Field("lineCount"),
                    ]),
                });
            }
        }
        let mut covered = BTreeSet::new();
        for (content_index, content) in part.measure_contents.iter().enumerate() {
            let measure_id_path = path(&[
                PathPart::Field("parts"),
                PathPart::Index(part_index),
                PathPart::Field("measureContents"),
                PathPart::Index(content_index),
                PathPart::Field("measureId"),
            ]);
            if !measure_ids.contains(content.measure_id.as_str())
                || !covered.insert(content.measure_id.as_str())
            {
                return Err(FoundationDecodeFailure::InvalidReference {
                    path: measure_id_path,
                });
            }
            if content.voices.is_empty() {
                return Err(FoundationDecodeFailure::InvalidReference {
                    path: path(&[
                        PathPart::Field("parts"),
                        PathPart::Index(part_index),
                        PathPart::Field("measureContents"),
                        PathPart::Index(content_index),
                        PathPart::Field("voices"),
                    ]),
                });
            }
            for (voice_index, voice) in content.voices.iter().enumerate() {
                let voice_prefix = [
                    PathPart::Field("parts"),
                    PathPart::Index(part_index),
                    PathPart::Field("measureContents"),
                    PathPart::Index(content_index),
                    PathPart::Field("voices"),
                    PathPart::Index(voice_index),
                ];
                let mut voice_id_path = voice_prefix.to_vec();
                voice_id_path.push(PathPart::Field("id"));
                insert_id(&mut ids, &voice.id, path(&voice_id_path))?;
                if !staff_ids.contains(voice.default_staff_id.as_str()) {
                    let mut reference_path = voice_prefix.to_vec();
                    reference_path.push(PathPart::Field("defaultStaffId"));
                    return Err(FoundationDecodeFailure::InvalidReference {
                        path: path(&reference_path),
                    });
                }
                for (event_index, event) in voice.sequence.events.iter().enumerate() {
                    let mut event_prefix = voice_prefix.to_vec();
                    event_prefix.extend([
                        PathPart::Field("sequence"),
                        PathPart::Field("events"),
                        PathPart::Index(event_index),
                    ]);
                    let mut event_id_path = event_prefix.clone();
                    event_id_path.push(PathPart::Field("id"));
                    insert_id(&mut ids, &event.id, path(&event_id_path))?;
                    if let Some(staff_id) = &event.staff_id
                        && !staff_ids.contains(staff_id.as_str())
                    {
                        let mut reference_path = event_prefix.clone();
                        reference_path.push(PathPart::Field("staffId"));
                        return Err(FoundationDecodeFailure::InvalidReference {
                            path: path(&reference_path),
                        });
                    }
                    if let RhythmicContentV1::Notes { notes } = &event.content {
                        if notes.is_empty() {
                            let mut notes_path = event_prefix.clone();
                            notes_path
                                .extend([PathPart::Field("content"), PathPart::Field("notes")]);
                            return Err(FoundationDecodeFailure::InvalidValue {
                                path: path(&notes_path),
                            });
                        }
                        for (note_index, note) in notes.iter().enumerate() {
                            let mut note_path = event_prefix.clone();
                            note_path.extend([
                                PathPart::Field("content"),
                                PathPart::Field("notes"),
                                PathPart::Index(note_index),
                                PathPart::Field("id"),
                            ]);
                            insert_id(&mut ids, &note.id, path(&note_path))?;
                        }
                    }
                }
            }
        }
    }

    for (extension_index, extension) in document.extensions.iter().enumerate() {
        if extension.namespace.is_empty() {
            return Err(FoundationDecodeFailure::InvalidValue {
                path: path(&[
                    PathPart::Field("extensions"),
                    PathPart::Index(extension_index),
                    PathPart::Field("namespace"),
                ]),
            });
        }
        if extension.schema_version.get() <= 0 {
            return Err(FoundationDecodeFailure::InvalidValue {
                path: path(&[
                    PathPart::Field("extensions"),
                    PathPart::Index(extension_index),
                    PathPart::Field("schemaVersion"),
                ]),
            });
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
            validate_structure(&invalid_reference),
            Err(FoundationDecodeFailure::InvalidReference {
                path: path(&[
                    PathPart::Field("parts"),
                    PathPart::Index(0),
                    PathPart::Field("measureContents"),
                    PathPart::Index(0),
                    PathPart::Field("voices"),
                    PathPart::Index(0),
                    PathPart::Field("defaultStaffId"),
                ]),
            })
        );

        let mut duplicate = decode_score_document_value(value).expect("valid smoke document");
        duplicate.parts[0].staves[0].id = duplicate.measure_definitions[0].id.clone();
        assert_eq!(
            validate_structure(&duplicate),
            Err(FoundationDecodeFailure::DuplicateId {
                path: path(&[
                    PathPart::Field("parts"),
                    PathPart::Index(0),
                    PathPart::Field("staves"),
                    PathPart::Index(0),
                    PathPart::Field("id"),
                ]),
            })
        );
    }
}
