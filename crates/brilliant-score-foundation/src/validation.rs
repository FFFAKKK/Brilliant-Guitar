use std::{
    cmp::Ordering,
    collections::{HashMap, HashSet},
    hash::Hash,
};

use brilliant_core_types::{JsString, StableId, StablePathSegmentV1, StablePathV1};

use crate::{
    ExactFraction, ExtensionOwnerV1, FoundationDecodeFailure, MeasureDefinitionV1, PartV1,
    PitchStepV1, RhythmicContentV1, ScoreDocumentV1, WrittenPitchV1,
};

#[derive(Clone, Copy)]
enum PathPart {
    Field(&'static str),
    Index(usize),
}

fn path(parts: &[PathPart]) -> StablePathV1 {
    StablePathV1::new(
        parts
            .iter()
            .map(|part| match part {
                PathPart::Field(field) => StablePathSegmentV1::Field((*field).to_owned()),
                PathPart::Index(index) => StablePathSegmentV1::Index(*index as u64),
            })
            .collect(),
    )
    .unwrap_or_else(|_| StablePathV1::root())
}

fn nested_path(prefix: &[PathPart], suffix: &[PathPart]) -> StablePathV1 {
    let mut parts = Vec::with_capacity(prefix.len() + suffix.len());
    parts.extend_from_slice(prefix);
    parts.extend_from_slice(suffix);
    path(&parts)
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
enum ExtensionOwnerKey<'a> {
    Score,
    Part(&'a JsString),
}

#[derive(Default)]
struct PartScratch<'a> {
    staff_ids: HashSet<&'a JsString>,
    covered_measure_ids: HashSet<&'a JsString>,
}

#[derive(Clone, Copy, Default)]
struct ReservationPolicy {
    #[cfg(test)]
    fail: bool,
}

impl ReservationPolicy {
    fn production() -> Self {
        Self::default()
    }

    #[cfg(test)]
    fn fail_all() -> Self {
        Self { fail: true }
    }

    fn hash_set<T>(&self, values: &mut HashSet<T>, additional: usize) -> Result<(), ()>
    where
        T: Eq + Hash,
    {
        #[cfg(test)]
        if self.fail {
            return Err(());
        }
        values.try_reserve(additional).map_err(|_| ())
    }

    fn hash_map<K, V>(&self, values: &mut HashMap<K, V>, additional: usize) -> Result<(), ()>
    where
        K: Eq + Hash,
    {
        #[cfg(test)]
        if self.fail {
            return Err(());
        }
        values.try_reserve(additional).map_err(|_| ())
    }

    fn vector<T>(&self, values: &mut Vec<T>, additional: usize) -> Result<(), ()> {
        #[cfg(test)]
        if self.fail {
            return Err(());
        }
        values.try_reserve_exact(additional).map_err(|_| ())
    }
}

struct ValidationScratch<'a> {
    ids: HashSet<&'a JsString>,
    measures: HashMap<&'a JsString, &'a MeasureDefinitionV1>,
    measure_durations: HashMap<&'a JsString, ExactFraction>,
    part_ids: HashSet<&'a JsString>,
    part_scratch: Vec<PartScratch<'a>>,
    extension_keys: HashSet<(ExtensionOwnerKey<'a>, &'a JsString)>,
}

pub(crate) fn validate_score_document(
    document: &ScoreDocumentV1,
) -> Result<(), FoundationDecodeFailure> {
    validate_with_policy(document, ReservationPolicy::production())
}

#[cfg(test)]
pub(crate) fn validate_score_document_with_reserve_fault(
    document: &ScoreDocumentV1,
) -> Result<(), FoundationDecodeFailure> {
    validate_with_policy(document, ReservationPolicy::fail_all())
}

fn validate_with_policy(
    document: &ScoreDocumentV1,
    policy: ReservationPolicy,
) -> Result<(), FoundationDecodeFailure> {
    let scratch = prepare_scratch(document, policy)?;
    Validator { scratch }.validate(document)
}

fn prepare_scratch<'a>(
    document: &'a ScoreDocumentV1,
    policy: ReservationPolicy,
) -> Result<ValidationScratch<'a>, FoundationDecodeFailure> {
    let id_count = checked_entity_id_count(document)?;
    let mut scratch = ValidationScratch {
        ids: HashSet::new(),
        measures: HashMap::new(),
        measure_durations: HashMap::new(),
        part_ids: HashSet::new(),
        part_scratch: Vec::new(),
        extension_keys: HashSet::new(),
    };
    policy
        .hash_set(&mut scratch.ids, id_count)
        .and_then(|()| policy.hash_map(&mut scratch.measures, document.measure_definitions.len()))
        .and_then(|()| {
            policy.hash_map(
                &mut scratch.measure_durations,
                document.measure_definitions.len(),
            )
        })
        .and_then(|()| policy.hash_set(&mut scratch.part_ids, document.parts.len()))
        .and_then(|()| policy.vector(&mut scratch.part_scratch, document.parts.len()))
        .and_then(|()| policy.hash_set(&mut scratch.extension_keys, document.extensions.len()))
        .map_err(|()| FoundationDecodeFailure::InternalCapacity)?;

    for part in &document.parts {
        let mut part_scratch = PartScratch::default();
        policy
            .hash_set(&mut part_scratch.staff_ids, part.staves.len())
            .and_then(|()| {
                policy.hash_set(
                    &mut part_scratch.covered_measure_ids,
                    part.measure_contents.len(),
                )
            })
            .map_err(|()| FoundationDecodeFailure::InternalCapacity)?;
        scratch.part_scratch.push(part_scratch);
    }
    Ok(scratch)
}

fn checked_entity_id_count(document: &ScoreDocumentV1) -> Result<usize, FoundationDecodeFailure> {
    let mut count = 1_usize;
    count = count
        .checked_add(document.measure_definitions.len())
        .and_then(|value| value.checked_add(document.parts.len()))
        .ok_or(FoundationDecodeFailure::InternalCapacity)?;
    for part in &document.parts {
        count = count
            .checked_add(part.staves.len())
            .ok_or(FoundationDecodeFailure::InternalCapacity)?;
        for content in &part.measure_contents {
            count = count
                .checked_add(content.voices.len())
                .ok_or(FoundationDecodeFailure::InternalCapacity)?;
            for voice in &content.voices {
                count = count
                    .checked_add(voice.sequence.events.len())
                    .ok_or(FoundationDecodeFailure::InternalCapacity)?;
                for event in &voice.sequence.events {
                    if let RhythmicContentV1::Notes { notes } = &event.content {
                        count = count
                            .checked_add(notes.len())
                            .ok_or(FoundationDecodeFailure::InternalCapacity)?;
                    }
                }
            }
        }
    }
    Ok(count)
}

struct Validator<'a> {
    scratch: ValidationScratch<'a>,
}

impl<'a> Validator<'a> {
    fn validate(mut self, document: &'a ScoreDocumentV1) -> Result<(), FoundationDecodeFailure> {
        self.insert_id(&document.id, path(&[PathPart::Field("id")]))?;
        if !crate::tempo_is_valid(document.metadata.tempo.bpm.get()) {
            return Err(invalid_value(&[
                PathPart::Field("metadata"),
                PathPart::Field("tempo"),
                PathPart::Field("bpm"),
            ]));
        }
        self.validate_measures(document)?;
        if document.parts.is_empty() {
            return Err(invalid_value(&[PathPart::Field("parts")]));
        }
        for (part_index, part) in document.parts.iter().enumerate() {
            self.validate_part(part, part_index, &document.measure_definitions)?;
        }
        self.validate_extensions(document)
    }

    fn validate_measures(
        &mut self,
        document: &'a ScoreDocumentV1,
    ) -> Result<(), FoundationDecodeFailure> {
        if document.measure_definitions.is_empty() {
            return Err(invalid_value(&[PathPart::Field("measureDefinitions")]));
        }
        for (measure_index, measure) in document.measure_definitions.iter().enumerate() {
            let prefix = [
                PathPart::Field("measureDefinitions"),
                PathPart::Index(measure_index),
            ];
            self.insert_id(&measure.id, nested_path(&prefix, &[PathPart::Field("id")]))?;
            let numerator = measure.meter.numerator.get();
            let denominator = measure.meter.denominator.get();
            if numerator <= 0 {
                return Err(FoundationDecodeFailure::InvalidValue {
                    path: nested_path(
                        &prefix,
                        &[PathPart::Field("meter"), PathPart::Field("numerator")],
                    ),
                });
            }
            if !is_note_value_base(denominator) {
                return Err(FoundationDecodeFailure::InvalidValue {
                    path: nested_path(
                        &prefix,
                        &[PathPart::Field("meter"), PathPart::Field("denominator")],
                    ),
                });
            }
            let regular = ExactFraction::from_parts(numerator, denominator).map_err(|_| {
                FoundationDecodeFailure::InvalidValue {
                    path: nested_path(&prefix, &[PathPart::Field("meter")]),
                }
            })?;
            let effective = if let Some(pickup) = &measure.pickup_duration {
                let pickup_path = nested_path(&prefix, &[PathPart::Field("pickupDuration")]);
                let pickup = ExactFraction::from_canonical(pickup).map_err(|_| {
                    FoundationDecodeFailure::InvalidValue {
                        path: pickup_path.clone(),
                    }
                })?;
                if pickup.numerator() <= 0
                    || pickup.checked_compare(regular).map_err(|_| {
                        FoundationDecodeFailure::InvalidValue {
                            path: pickup_path.clone(),
                        }
                    })? == Ordering::Greater
                {
                    return Err(FoundationDecodeFailure::InvalidValue { path: pickup_path });
                }
                pickup
            } else {
                regular
            };
            self.scratch
                .measures
                .insert(measure.id.as_js_string(), measure);
            self.scratch
                .measure_durations
                .insert(measure.id.as_js_string(), effective);
        }
        Ok(())
    }

    fn validate_part(
        &mut self,
        part: &'a PartV1,
        part_index: usize,
        document_measures: &'a [MeasureDefinitionV1],
    ) -> Result<(), FoundationDecodeFailure> {
        let prefix = [PathPart::Field("parts"), PathPart::Index(part_index)];
        self.insert_id(&part.id, nested_path(&prefix, &[PathPart::Field("id")]))?;
        self.scratch.part_ids.insert(part.id.as_js_string());
        if part.staves.is_empty() {
            return Err(FoundationDecodeFailure::InvalidReference {
                path: nested_path(&prefix, &[PathPart::Field("staves")]),
            });
        }

        let mut part_scratch = std::mem::take(&mut self.scratch.part_scratch[part_index]);
        for (staff_index, staff) in part.staves.iter().enumerate() {
            let staff_prefix = [
                PathPart::Field("parts"),
                PathPart::Index(part_index),
                PathPart::Field("staves"),
                PathPart::Index(staff_index),
            ];
            self.insert_id(
                &staff.id,
                nested_path(&staff_prefix, &[PathPart::Field("id")]),
            )?;
            part_scratch.staff_ids.insert(staff.id.as_js_string());
            if staff.line_count.get() <= 0 {
                return Err(FoundationDecodeFailure::InvalidValue {
                    path: nested_path(&staff_prefix, &[PathPart::Field("lineCount")]),
                });
            }
            if !(1..=5).contains(&staff.default_clef.line.get()) {
                return Err(FoundationDecodeFailure::InvalidValue {
                    path: nested_path(
                        &staff_prefix,
                        &[PathPart::Field("defaultClef"), PathPart::Field("line")],
                    ),
                });
            }
        }

        for (content_index, content) in part.measure_contents.iter().enumerate() {
            let content_prefix = [
                PathPart::Field("parts"),
                PathPart::Index(part_index),
                PathPart::Field("measureContents"),
                PathPart::Index(content_index),
            ];
            let Some(&measure) = self.scratch.measures.get(content.measure_id.as_js_string())
            else {
                return Err(FoundationDecodeFailure::InvalidReference {
                    path: nested_path(&content_prefix, &[PathPart::Field("measureId")]),
                });
            };
            if !part_scratch
                .covered_measure_ids
                .insert(content.measure_id.as_js_string())
            {
                return Err(FoundationDecodeFailure::InvalidReference {
                    path: nested_path(&content_prefix, &[PathPart::Field("measureId")]),
                });
            }
            if content.voices.is_empty() {
                return Err(FoundationDecodeFailure::InvalidReference {
                    path: nested_path(&content_prefix, &[PathPart::Field("voices")]),
                });
            }
            let measure_duration = *self
                .scratch
                .measure_durations
                .get(measure.id.as_js_string())
                .ok_or(FoundationDecodeFailure::InternalCapacity)?;
            for (voice_index, voice) in content.voices.iter().enumerate() {
                let voice_prefix = [
                    PathPart::Field("parts"),
                    PathPart::Index(part_index),
                    PathPart::Field("measureContents"),
                    PathPart::Index(content_index),
                    PathPart::Field("voices"),
                    PathPart::Index(voice_index),
                ];
                self.insert_id(
                    &voice.id,
                    nested_path(&voice_prefix, &[PathPart::Field("id")]),
                )?;
                if !part_scratch
                    .staff_ids
                    .contains(voice.default_staff_id.as_js_string())
                {
                    return Err(FoundationDecodeFailure::InvalidReference {
                        path: nested_path(&voice_prefix, &[PathPart::Field("defaultStaffId")]),
                    });
                }
                self.validate_voice(
                    part,
                    &part_scratch.staff_ids,
                    voice,
                    &voice_prefix,
                    measure_duration,
                )?;
            }
        }

        for measure in document_measures {
            if !part_scratch
                .covered_measure_ids
                .contains(measure.id.as_js_string())
            {
                return Err(FoundationDecodeFailure::InvalidReference {
                    path: nested_path(&prefix, &[PathPart::Field("measureContents")]),
                });
            }
        }
        Ok(())
    }

    fn validate_voice(
        &mut self,
        part: &PartV1,
        staff_ids: &HashSet<&JsString>,
        voice: &'a crate::VoiceV1,
        voice_prefix: &[PathPart],
        measure_duration: ExactFraction,
    ) -> Result<(), FoundationDecodeFailure> {
        let start_path = nested_path(
            voice_prefix,
            &[PathPart::Field("sequence"), PathPart::Field("start")],
        );
        let mut current = ExactFraction::from_canonical(&voice.sequence.start).map_err(|_| {
            FoundationDecodeFailure::InvalidValue {
                path: start_path.clone(),
            }
        })?;
        if current.numerator() < 0
            || current.checked_compare(measure_duration).map_err(|_| {
                FoundationDecodeFailure::InvalidValue {
                    path: start_path.clone(),
                }
            })? == Ordering::Greater
        {
            return Err(FoundationDecodeFailure::InvalidValue { path: start_path });
        }

        for (event_index, event) in voice.sequence.events.iter().enumerate() {
            let mut event_prefix = voice_prefix.to_vec();
            event_prefix.extend([
                PathPart::Field("sequence"),
                PathPart::Field("events"),
                PathPart::Index(event_index),
            ]);
            self.insert_id(
                &event.id,
                nested_path(&event_prefix, &[PathPart::Field("id")]),
            )?;
            if let Some(staff_id) = &event.staff_id
                && !staff_ids.contains(staff_id.as_js_string())
            {
                return Err(FoundationDecodeFailure::InvalidReference {
                    path: nested_path(&event_prefix, &[PathPart::Field("staffId")]),
                });
            }
            if let RhythmicContentV1::Notes { notes } = &event.content {
                if notes.is_empty() {
                    return Err(FoundationDecodeFailure::InvalidValue {
                        path: nested_path(
                            &event_prefix,
                            &[PathPart::Field("content"), PathPart::Field("notes")],
                        ),
                    });
                }
                for (note_index, note) in notes.iter().enumerate() {
                    let mut note_prefix = event_prefix.clone();
                    note_prefix.extend([
                        PathPart::Field("content"),
                        PathPart::Field("notes"),
                        PathPart::Index(note_index),
                    ]);
                    self.insert_id(
                        &note.id,
                        nested_path(&note_prefix, &[PathPart::Field("id")]),
                    )?;
                    if !written_pitch_is_valid(&note.written_pitch)
                        || !sounding_pitch_is_valid(
                            &note.written_pitch,
                            part.instrument.written_to_sounding.diatonic_steps.get(),
                            part.instrument
                                .written_to_sounding
                                .chromatic_semitones
                                .get(),
                        )
                    {
                        return Err(FoundationDecodeFailure::InvalidValue {
                            path: nested_path(&note_prefix, &[PathPart::Field("writtenPitch")]),
                        });
                    }
                }
            }
            let duration_path = nested_path(&event_prefix, &[PathPart::Field("duration")]);
            let duration = ExactFraction::note_value_duration(&event.duration).map_err(|_| {
                FoundationDecodeFailure::InvalidValue {
                    path: duration_path.clone(),
                }
            })?;
            current = current.checked_add(duration).map_err(|_| {
                FoundationDecodeFailure::InvalidValue {
                    path: duration_path,
                }
            })?;
        }
        Ok(())
    }

    fn validate_extensions(
        &mut self,
        document: &'a ScoreDocumentV1,
    ) -> Result<(), FoundationDecodeFailure> {
        for (extension_index, extension) in document.extensions.iter().enumerate() {
            let prefix = [
                PathPart::Field("extensions"),
                PathPart::Index(extension_index),
            ];
            if !valid_extension_namespace(&extension.namespace) {
                return Err(FoundationDecodeFailure::InvalidValue {
                    path: nested_path(&prefix, &[PathPart::Field("namespace")]),
                });
            }
            if extension.schema_version.get() <= 0 {
                return Err(FoundationDecodeFailure::InvalidValue {
                    path: nested_path(&prefix, &[PathPart::Field("schemaVersion")]),
                });
            }
            let owner = match &extension.owner {
                ExtensionOwnerV1::Score => ExtensionOwnerKey::Score,
                ExtensionOwnerV1::Part { part_id } => {
                    if !self.scratch.part_ids.contains(part_id.as_js_string()) {
                        return Err(FoundationDecodeFailure::InvalidReference {
                            path: nested_path(
                                &prefix,
                                &[PathPart::Field("owner"), PathPart::Field("partId")],
                            ),
                        });
                    }
                    ExtensionOwnerKey::Part(part_id.as_js_string())
                }
            };
            if !self
                .scratch
                .extension_keys
                .insert((owner, &extension.namespace))
            {
                return Err(FoundationDecodeFailure::InvalidValue {
                    path: path(&prefix),
                });
            }
        }
        Ok(())
    }

    fn insert_id(
        &mut self,
        id: &'a StableId,
        id_path: StablePathV1,
    ) -> Result<(), FoundationDecodeFailure> {
        if self.scratch.ids.insert(id.as_js_string()) {
            Ok(())
        } else {
            Err(FoundationDecodeFailure::DuplicateId { path: id_path })
        }
    }
}

fn invalid_value(parts: &[PathPart]) -> FoundationDecodeFailure {
    FoundationDecodeFailure::InvalidValue { path: path(parts) }
}

fn is_note_value_base(value: i64) -> bool {
    matches!(value, 1 | 2 | 4 | 8 | 16 | 32 | 64)
}

fn valid_extension_namespace(namespace: &JsString) -> bool {
    crate::music_rules::extension_namespace(namespace)
}

fn written_pitch_is_valid(pitch: &WrittenPitchV1) -> bool {
    (-2..=2).contains(&pitch.alter.get()) && (0..=8).contains(&pitch.octave.get())
}

fn sounding_pitch_is_valid(
    pitch: &WrittenPitchV1,
    diatonic_steps: i64,
    chromatic_semitones: i64,
) -> bool {
    let (step_index, source_natural) = match pitch.step {
        PitchStepV1::C => (0_i128, 0_i128),
        PitchStepV1::D => (1, 2),
        PitchStepV1::E => (2, 4),
        PitchStepV1::F => (3, 5),
        PitchStepV1::G => (4, 7),
        PitchStepV1::A => (5, 9),
        PitchStepV1::B => (6, 11),
    };
    let source_octave = i128::from(pitch.octave.get());
    let Some(source_diatonic) = source_octave
        .checked_mul(7)
        .and_then(|value| value.checked_add(step_index))
    else {
        return false;
    };
    let Some(target_diatonic) = source_diatonic.checked_add(i128::from(diatonic_steps)) else {
        return false;
    };
    let target_octave = target_diatonic.div_euclid(7);
    let target_step_index = target_diatonic.rem_euclid(7);
    if !(0..=8).contains(&target_octave) {
        return false;
    }
    let target_natural = [0_i128, 2, 4, 5, 7, 9, 11][target_step_index as usize];
    let Some(source_chromatic) = source_octave
        .checked_mul(12)
        .and_then(|value| value.checked_add(source_natural))
        .and_then(|value| value.checked_add(i128::from(pitch.alter.get())))
    else {
        return false;
    };
    let Some(target_chromatic) = source_chromatic.checked_add(i128::from(chromatic_semitones))
    else {
        return false;
    };
    let Some(target_natural_chromatic) = target_octave
        .checked_mul(12)
        .and_then(|value| value.checked_add(target_natural))
    else {
        return false;
    };
    (-2..=2).contains(&(target_chromatic - target_natural_chromatic))
}

#[cfg(test)]
mod tests {
    use brilliant_core_types::{SafeInteger, StableId};

    use super::*;
    use crate::{
        ExtensionBlockV1, FractionV1, NoteValueV1, RhythmicContentV1, ScoreNoteV1,
        TimeModificationV1, WrittenPitchV1, codec::SMOKE_DOCUMENT,
    };

    fn safe(value: i64) -> SafeInteger {
        SafeInteger::new(value).expect("safe integer")
    }

    fn fixture() -> ScoreDocumentV1 {
        serde_json::from_str(SMOKE_DOCUMENT).expect("fixture shape")
    }

    #[test]
    fn hard_validation_preserves_unpaired_id_identity_and_references() {
        use crate::LosslessDecode;

        let input = SMOKE_DOCUMENT
            .replace("score-rkp1", r"\ud800")
            .replace("measure-1", r"\udc00")
            .replace("part-1", r"\ufffd")
            .replace("staff-1", r"\ud800\udc00");
        let mut document =
            ScoreDocumentV1::from_lossless_value(crate::decode_lossless_json(&input).unwrap())
                .unwrap();
        assert_eq!(validate_score_document(&document), Ok(()));
        document.parts[0].measure_contents[0].measure_id = document.id.clone();
        assert_eq!(
            validate_score_document(&document),
            Err(FoundationDecodeFailure::InvalidReference {
                path: path(&[
                    PathPart::Field("parts"),
                    PathPart::Index(0),
                    PathPart::Field("measureContents"),
                    PathPart::Index(0),
                    PathPart::Field("measureId")
                ]),
            })
        );
        document.measure_definitions[0].id = document.id.clone();
        assert_duplicate_at(
            &document,
            &[
                PathPart::Field("measureDefinitions"),
                PathPart::Index(0),
                PathPart::Field("id"),
            ],
        );
    }

    #[test]
    fn hard_namespace_validation_rejects_non_ascii_and_surrogate_units() {
        for units in [vec![0xd800], vec![0xdc00], vec![0xfffd], vec![0x00e9]] {
            let mut document = fixture();
            let mut namespace = vec![u16::from(b'a'), u16::from(b'.')];
            namespace.extend(units);
            document.extensions[0].namespace = JsString::from_utf16(namespace);
            assert_eq!(
                validate_score_document(&document),
                expected_value(&[
                    PathPart::Field("extensions"),
                    PathPart::Index(0),
                    PathPart::Field("namespace"),
                ])
            );
        }
    }

    fn expected_value(parts: &[PathPart]) -> Result<(), FoundationDecodeFailure> {
        Err(FoundationDecodeFailure::InvalidValue { path: path(parts) })
    }

    fn assert_duplicate_at(document: &ScoreDocumentV1, parts: &[PathPart]) {
        assert_eq!(
            validate_score_document(document),
            Err(FoundationDecodeFailure::DuplicateId { path: path(parts) })
        );
    }

    #[test]
    fn valid_document_registers_root_before_every_entity_id() {
        assert_eq!(validate_score_document(&fixture()), Ok(()));
        let mut document = fixture();
        document.measure_definitions[0].id = document.id.clone();
        assert_eq!(
            validate_score_document(&document),
            Err(FoundationDecodeFailure::DuplicateId {
                path: path(&[
                    PathPart::Field("measureDefinitions"),
                    PathPart::Index(0),
                    PathPart::Field("id"),
                ]),
            })
        );
    }

    #[test]
    fn document_root_collides_with_every_persisted_entity_kind_at_the_later_path() {
        let mut part = fixture();
        let root_id = part.id.clone();
        part.parts[0].id = root_id;
        assert_duplicate_at(
            &part,
            &[
                PathPart::Field("parts"),
                PathPart::Index(0),
                PathPart::Field("id"),
            ],
        );

        let mut staff = fixture();
        let root_id = staff.id.clone();
        staff.parts[0].staves[0].id = root_id;
        assert_duplicate_at(
            &staff,
            &[
                PathPart::Field("parts"),
                PathPart::Index(0),
                PathPart::Field("staves"),
                PathPart::Index(0),
                PathPart::Field("id"),
            ],
        );

        let mut voice = fixture();
        let root_id = voice.id.clone();
        voice.parts[0].measure_contents[0].voices[0].id = root_id;
        assert_duplicate_at(
            &voice,
            &[
                PathPart::Field("parts"),
                PathPart::Index(0),
                PathPart::Field("measureContents"),
                PathPart::Index(0),
                PathPart::Field("voices"),
                PathPart::Index(0),
                PathPart::Field("id"),
            ],
        );

        let mut event = fixture();
        let root_id = event.id.clone();
        event.parts[0].measure_contents[0].voices[0].sequence.events[0].id = root_id;
        assert_duplicate_at(
            &event,
            &[
                PathPart::Field("parts"),
                PathPart::Index(0),
                PathPart::Field("measureContents"),
                PathPart::Index(0),
                PathPart::Field("voices"),
                PathPart::Index(0),
                PathPart::Field("sequence"),
                PathPart::Field("events"),
                PathPart::Index(0),
                PathPart::Field("id"),
            ],
        );

        let mut note = fixture();
        let root_id = note.id.clone();
        note.parts[0].measure_contents[0].voices[0].sequence.events[0].content =
            RhythmicContentV1::Notes {
                notes: vec![ScoreNoteV1 {
                    id: root_id,
                    written_pitch: WrittenPitchV1 {
                        step: PitchStepV1::C,
                        alter: safe(0),
                        octave: safe(4),
                    },
                }],
            };
        assert_duplicate_at(
            &note,
            &[
                PathPart::Field("parts"),
                PathPart::Index(0),
                PathPart::Field("measureContents"),
                PathPart::Index(0),
                PathPart::Field("voices"),
                PathPart::Index(0),
                PathPart::Field("sequence"),
                PathPart::Field("events"),
                PathPart::Index(0),
                PathPart::Field("content"),
                PathPart::Field("notes"),
                PathPart::Index(0),
                PathPart::Field("id"),
            ],
        );
    }

    #[test]
    fn empty_collection_wire_classes_and_paths_are_exact() {
        let mut measures = fixture();
        measures.measure_definitions.clear();
        assert_eq!(
            validate_score_document(&measures),
            expected_value(&[PathPart::Field("measureDefinitions")])
        );

        let mut parts = fixture();
        parts.parts.clear();
        assert_eq!(
            validate_score_document(&parts),
            expected_value(&[PathPart::Field("parts")])
        );

        let mut staves = fixture();
        staves.parts[0].staves.clear();
        assert_eq!(
            validate_score_document(&staves),
            Err(FoundationDecodeFailure::InvalidReference {
                path: path(&[
                    PathPart::Field("parts"),
                    PathPart::Index(0),
                    PathPart::Field("staves"),
                ]),
            })
        );

        let mut voices = fixture();
        voices.parts[0].measure_contents[0].voices.clear();
        assert_eq!(
            validate_score_document(&voices),
            Err(FoundationDecodeFailure::InvalidReference {
                path: path(&[
                    PathPart::Field("parts"),
                    PathPart::Index(0),
                    PathPart::Field("measureContents"),
                    PathPart::Index(0),
                    PathPart::Field("voices"),
                ]),
            })
        );

        let mut notes = fixture();
        notes.parts[0].measure_contents[0].voices[0].sequence.events[0].content =
            RhythmicContentV1::Notes { notes: Vec::new() };
        assert_eq!(
            validate_score_document(&notes),
            expected_value(&[
                PathPart::Field("parts"),
                PathPart::Index(0),
                PathPart::Field("measureContents"),
                PathPart::Index(0),
                PathPart::Field("voices"),
                PathPart::Index(0),
                PathPart::Field("sequence"),
                PathPart::Field("events"),
                PathPart::Index(0),
                PathPart::Field("content"),
                PathPart::Field("notes"),
            ])
        );
    }

    #[test]
    fn reference_and_coverage_failures_use_canonical_input_order() {
        let mut missing_staff = fixture();
        missing_staff.parts[0].measure_contents[0].voices[0].default_staff_id =
            StableId::new("missing").expect("id");
        assert!(matches!(
            validate_score_document(&missing_staff),
            Err(FoundationDecodeFailure::InvalidReference { .. })
        ));

        let mut missing_event_staff = fixture();
        missing_event_staff.parts[0].measure_contents[0].voices[0]
            .sequence
            .events[0]
            .staff_id = Some(StableId::new("missing").expect("id"));
        assert_eq!(
            validate_score_document(&missing_event_staff),
            Err(FoundationDecodeFailure::InvalidReference {
                path: path(&[
                    PathPart::Field("parts"),
                    PathPart::Index(0),
                    PathPart::Field("measureContents"),
                    PathPart::Index(0),
                    PathPart::Field("voices"),
                    PathPart::Index(0),
                    PathPart::Field("sequence"),
                    PathPart::Field("events"),
                    PathPart::Index(0),
                    PathPart::Field("staffId"),
                ]),
            })
        );

        let mut duplicate_coverage = fixture();
        let duplicate_content = duplicate_coverage.parts[0].measure_contents[0].clone();
        duplicate_coverage.parts[0]
            .measure_contents
            .push(duplicate_content);
        assert_eq!(
            validate_score_document(&duplicate_coverage),
            Err(FoundationDecodeFailure::InvalidReference {
                path: path(&[
                    PathPart::Field("parts"),
                    PathPart::Index(0),
                    PathPart::Field("measureContents"),
                    PathPart::Index(1),
                    PathPart::Field("measureId"),
                ]),
            })
        );

        let mut missing_coverage = fixture();
        missing_coverage.parts[0].measure_contents.clear();
        assert_eq!(
            validate_score_document(&missing_coverage),
            Err(FoundationDecodeFailure::InvalidReference {
                path: path(&[
                    PathPart::Field("parts"),
                    PathPart::Index(0),
                    PathPart::Field("measureContents"),
                ]),
            })
        );
    }

    #[test]
    fn numeric_music_and_time_failures_keep_exact_first_paths() {
        let mut tempo = fixture();
        tempo.metadata.tempo.bpm = safe(0).into();
        assert_eq!(
            validate_score_document(&tempo),
            expected_value(&[
                PathPart::Field("metadata"),
                PathPart::Field("tempo"),
                PathPart::Field("bpm"),
            ])
        );

        let mut pickup = fixture();
        pickup.measure_definitions[0].pickup_duration = Some(FractionV1 {
            numerator: safe(5),
            denominator: safe(4),
        });
        assert!(matches!(
            validate_score_document(&pickup),
            Err(FoundationDecodeFailure::InvalidValue { .. })
        ));

        let mut bad_duration = fixture();
        bad_duration.parts[0].measure_contents[0].voices[0]
            .sequence
            .events[0]
            .duration
            .base = safe(3);
        assert!(matches!(
            validate_score_document(&bad_duration),
            Err(FoundationDecodeFailure::InvalidValue { .. })
        ));

        let mut overflow_duration = fixture();
        overflow_duration.parts[0].measure_contents[0].voices[0]
            .sequence
            .events[0]
            .duration = NoteValueV1 {
            base: safe(1),
            dots: safe(3),
            time_modification: Some(TimeModificationV1 {
                actual_notes: safe(1),
                normal_notes: safe(brilliant_core_types::JS_SAFE_INTEGER_MAX),
            }),
        };
        assert!(matches!(
            validate_score_document(&overflow_duration),
            Err(FoundationDecodeFailure::InvalidValue { .. })
        ));
    }

    #[test]
    fn written_and_sounding_pitch_are_validated_before_duration() {
        let mut document = fixture();
        let event = &mut document.parts[0].measure_contents[0].voices[0]
            .sequence
            .events[0];
        event.content = RhythmicContentV1::Notes {
            notes: vec![ScoreNoteV1 {
                id: StableId::new("note-1").expect("id"),
                written_pitch: WrittenPitchV1 {
                    step: PitchStepV1::B,
                    alter: safe(0),
                    octave: safe(8),
                },
            }],
        };
        document.parts[0]
            .instrument
            .written_to_sounding
            .diatonic_steps = safe(1);
        assert_eq!(
            validate_score_document(&document),
            expected_value(&[
                PathPart::Field("parts"),
                PathPart::Index(0),
                PathPart::Field("measureContents"),
                PathPart::Index(0),
                PathPart::Field("voices"),
                PathPart::Index(0),
                PathPart::Field("sequence"),
                PathPart::Field("events"),
                PathPart::Index(0),
                PathPart::Field("content"),
                PathPart::Field("notes"),
                PathPart::Index(0),
                PathPart::Field("writtenPitch"),
            ])
        );

        let mut written = fixture();
        written.parts[0].measure_contents[0].voices[0]
            .sequence
            .events[0]
            .content = RhythmicContentV1::Notes {
            notes: vec![ScoreNoteV1 {
                id: StableId::new("note-1").expect("id"),
                written_pitch: WrittenPitchV1 {
                    step: PitchStepV1::C,
                    alter: safe(3),
                    octave: safe(4),
                },
            }],
        };
        assert!(matches!(
            validate_score_document(&written),
            Err(FoundationDecodeFailure::InvalidValue { .. })
        ));
    }

    #[test]
    fn fixed_traversal_precedence_ignores_hash_and_source_identity_order() {
        let mut document = fixture();
        document.metadata.tempo.bpm = safe(0).into();
        document.measure_definitions[0].id = document.id.clone();
        document.parts.clear();
        assert_eq!(
            validate_score_document(&document),
            expected_value(&[
                PathPart::Field("metadata"),
                PathPart::Field("tempo"),
                PathPart::Field("bpm"),
            ])
        );

        let mut later = fixture();
        later.parts[0].id = StableId::new("z-part").expect("id");
        later.parts[0].staves[0].id = StableId::new("a-staff").expect("id");
        later.parts[0].measure_contents[0].voices[0].id = later.parts[0].id.clone();
        assert_duplicate_at(
            &later,
            &[
                PathPart::Field("parts"),
                PathPart::Index(0),
                PathPart::Field("measureContents"),
                PathPart::Index(0),
                PathPart::Field("voices"),
                PathPart::Index(0),
                PathPart::Field("id"),
            ],
        );
    }

    #[test]
    fn extension_envelope_and_owner_failures_are_closed() {
        let mut namespace = fixture();
        namespace.extensions[0].namespace = "Invalid".into();
        assert!(matches!(
            validate_score_document(&namespace),
            Err(FoundationDecodeFailure::InvalidValue { .. })
        ));

        let mut owner = fixture();
        owner.extensions[0].owner = ExtensionOwnerV1::Part {
            part_id: StableId::new("missing-part").expect("id"),
        };
        assert!(matches!(
            validate_score_document(&owner),
            Err(FoundationDecodeFailure::InvalidReference { .. })
        ));

        let mut duplicate = fixture();
        duplicate.extensions.push(ExtensionBlockV1 {
            namespace: duplicate.extensions[0].namespace.clone(),
            schema_version: safe(1),
            owner: ExtensionOwnerV1::Score,
            payload: Default::default(),
        });
        assert_eq!(
            validate_score_document(&duplicate),
            expected_value(&[PathPart::Field("extensions"), PathPart::Index(1)])
        );
    }

    #[test]
    fn reserve_fault_precedes_latent_semantic_failure() {
        let mut document = fixture();
        document.metadata.tempo.bpm = safe(0).into();
        assert_eq!(
            validate_score_document_with_reserve_fault(&document),
            Err(FoundationDecodeFailure::InternalCapacity)
        );
    }
}
