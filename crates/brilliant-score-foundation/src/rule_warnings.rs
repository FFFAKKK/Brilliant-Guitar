//! Non-blocking score-rule observations derived from a semantically valid document.
//! They are deliberately separate from `SemanticReportV1`, whose diagnostics reject
//! admission or a transaction.
use std::{cmp::Ordering, collections::HashMap};

use brilliant_core_types::StableId;
use serde::Serialize;

use crate::{
    AssessmentFailureV1, CoreDiagnosticV1, ExactFraction, FractionV1, ScoreDocumentV1,
    assess_measure_duration, assess_note_duration, assess_score_semantics_node,
    dto_assessment::DocumentAssessmentNodeV1,
};

pub const CORE_RULE_WARNING_PAGE_LIMIT_V1: usize = 4_096;
pub const CORE_RULE_WARNING_PAGE_LIMIT_V2: usize = 4_096;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum CoreRuleWarningCodeV1 {
    #[serde(rename = "rule.sequence-exceeds-measure")]
    SequenceExceedsMeasure,
    #[serde(rename = "rule.sequence-start-after-measure")]
    SequenceStartAfterMeasure,
}

impl CoreRuleWarningCodeV1 {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SequenceExceedsMeasure => "rule.sequence-exceeds-measure",
            Self::SequenceStartAfterMeasure => "rule.sequence-start-after-measure",
        }
    }
}

impl crate::LosslessEncode for CoreRuleWarningCodeV1 {
    fn write_lossless<W: std::io::Write + ?Sized>(
        &self,
        writer: &mut W,
    ) -> Result<(), crate::LosslessJsonError> {
        self.as_str().write_lossless(writer)
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreRuleWarningV1 {
    pub warning_version: u64,
    pub code: CoreRuleWarningCodeV1,
    pub message_key: String,
    pub part_id: StableId,
    pub measure_id: StableId,
    pub voice_id: StableId,
    pub nominal_duration: FractionV1,
    pub actual_duration: FractionV1,
    pub overflow: FractionV1,
}

impl crate::LosslessEncode for CoreRuleWarningV1 {
    fn write_lossless<W: std::io::Write + ?Sized>(
        &self,
        writer: &mut W,
    ) -> Result<(), crate::LosslessJsonError> {
        let mut object = crate::LosslessObjectWriter::new(writer)?;
        object.field("warningVersion", &self.warning_version)?;
        object.field("code", &self.code)?;
        object.field("messageKey", &self.message_key)?;
        object.field("partId", &self.part_id)?;
        object.field("measureId", &self.measure_id)?;
        object.field("voiceId", &self.voice_id)?;
        object.field("nominalDuration", &self.nominal_duration)?;
        object.field("actualDuration", &self.actual_duration)?;
        object.field("overflow", &self.overflow)?;
        object.end()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum CoreRuleWarningCodeV2 {
    #[serde(rename = "rule.sequence-exceeds-measure")]
    SequenceExceedsMeasure,
    #[serde(rename = "rule.sequence-start-after-measure")]
    SequenceStartAfterMeasure,
    #[serde(rename = "rule.sounding-pitch-out-of-playback-range")]
    SoundingPitchOutOfPlaybackRange,
    #[serde(rename = "rule.sounding-pitch-spelling-unrepresentable")]
    SoundingPitchSpellingUnrepresentable,
}

impl CoreRuleWarningCodeV2 {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SequenceExceedsMeasure => "rule.sequence-exceeds-measure",
            Self::SequenceStartAfterMeasure => "rule.sequence-start-after-measure",
            Self::SoundingPitchOutOfPlaybackRange => "rule.sounding-pitch-out-of-playback-range",
            Self::SoundingPitchSpellingUnrepresentable => {
                "rule.sounding-pitch-spelling-unrepresentable"
            }
        }
    }
}

impl crate::LosslessEncode for CoreRuleWarningCodeV2 {
    fn write_lossless<W: std::io::Write + ?Sized>(
        &self,
        writer: &mut W,
    ) -> Result<(), crate::LosslessJsonError> {
        self.as_str().write_lossless(writer)
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind")]
pub enum CoreRuleWarningLocationV2 {
    #[serde(rename = "voice")]
    Voice {
        #[serde(rename = "partId")]
        part_id: StableId,
        #[serde(rename = "measureId")]
        measure_id: StableId,
        #[serde(rename = "voiceId")]
        voice_id: StableId,
    },
    #[serde(rename = "note")]
    Note {
        #[serde(rename = "partId")]
        part_id: StableId,
        #[serde(rename = "measureId")]
        measure_id: StableId,
        #[serde(rename = "voiceId")]
        voice_id: StableId,
        #[serde(rename = "eventId")]
        event_id: StableId,
        #[serde(rename = "noteId")]
        note_id: StableId,
    },
}

impl crate::LosslessEncode for CoreRuleWarningLocationV2 {
    fn write_lossless<W: std::io::Write + ?Sized>(
        &self,
        writer: &mut W,
    ) -> Result<(), crate::LosslessJsonError> {
        let mut object = crate::LosslessObjectWriter::new(writer)?;
        match self {
            Self::Voice {
                part_id,
                measure_id,
                voice_id,
            } => {
                object.field("kind", "voice")?;
                object.field("partId", part_id)?;
                object.field("measureId", measure_id)?;
                object.field("voiceId", voice_id)?;
            }
            Self::Note {
                part_id,
                measure_id,
                voice_id,
                event_id,
                note_id,
            } => {
                object.field("kind", "note")?;
                object.field("partId", part_id)?;
                object.field("measureId", measure_id)?;
                object.field("voiceId", voice_id)?;
                object.field("eventId", event_id)?;
                object.field("noteId", note_id)?;
            }
        }
        object.end()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum CoreSoundingPitchWarningReasonV2 {
    #[serde(rename = "playback-range")]
    PlaybackRange,
    #[serde(rename = "derived-pitch-octave-out-of-range")]
    DerivedPitchOctaveOutOfRange,
    #[serde(rename = "derived-pitch-alter-out-of-range")]
    DerivedPitchAlterOutOfRange,
}

impl CoreSoundingPitchWarningReasonV2 {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::PlaybackRange => "playback-range",
            Self::DerivedPitchOctaveOutOfRange => "derived-pitch-octave-out-of-range",
            Self::DerivedPitchAlterOutOfRange => "derived-pitch-alter-out-of-range",
        }
    }
}

impl crate::LosslessEncode for CoreSoundingPitchWarningReasonV2 {
    fn write_lossless<W: std::io::Write + ?Sized>(
        &self,
        writer: &mut W,
    ) -> Result<(), crate::LosslessJsonError> {
        self.as_str().write_lossless(writer)
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind")]
pub enum CoreRuleWarningDetailsV2 {
    #[serde(rename = "timing", rename_all = "camelCase")]
    Timing {
        nominal_duration: FractionV1,
        actual_duration: FractionV1,
        overflow: FractionV1,
    },
    #[serde(rename = "soundingPitch", rename_all = "camelCase")]
    SoundingPitch {
        reason: CoreSoundingPitchWarningReasonV2,
        #[serde(skip_serializing_if = "Option::is_none")]
        sounding_semitone: Option<String>,
    },
}

impl crate::LosslessEncode for CoreRuleWarningDetailsV2 {
    fn write_lossless<W: std::io::Write + ?Sized>(
        &self,
        writer: &mut W,
    ) -> Result<(), crate::LosslessJsonError> {
        let mut object = crate::LosslessObjectWriter::new(writer)?;
        match self {
            Self::Timing {
                nominal_duration,
                actual_duration,
                overflow,
            } => {
                object.field("kind", "timing")?;
                object.field("nominalDuration", nominal_duration)?;
                object.field("actualDuration", actual_duration)?;
                object.field("overflow", overflow)?;
            }
            Self::SoundingPitch {
                reason,
                sounding_semitone,
            } => {
                object.field("kind", "soundingPitch")?;
                object.field("reason", reason)?;
                if let Some(value) = sounding_semitone {
                    object.field("soundingSemitone", value)?;
                }
            }
        }
        object.end()
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreRuleWarningV2 {
    warning_version: u64,
    code: CoreRuleWarningCodeV2,
    message_key: String,
    location: CoreRuleWarningLocationV2,
    details: CoreRuleWarningDetailsV2,
}

impl CoreRuleWarningV2 {
    pub const fn warning_version(&self) -> u64 {
        self.warning_version
    }

    pub const fn code(&self) -> CoreRuleWarningCodeV2 {
        self.code
    }

    pub fn message_key(&self) -> &str {
        &self.message_key
    }

    pub const fn location(&self) -> &CoreRuleWarningLocationV2 {
        &self.location
    }

    pub const fn details(&self) -> &CoreRuleWarningDetailsV2 {
        &self.details
    }
}

impl crate::LosslessEncode for CoreRuleWarningV2 {
    fn write_lossless<W: std::io::Write + ?Sized>(
        &self,
        writer: &mut W,
    ) -> Result<(), crate::LosslessJsonError> {
        let mut object = crate::LosslessObjectWriter::new(writer)?;
        object.field("warningVersion", &self.warning_version)?;
        object.field("code", &self.code)?;
        object.field("messageKey", &self.message_key)?;
        object.field("location", &self.location)?;
        object.field("details", &self.details)?;
        object.end()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScoreRuleWarningPageV1 {
    pub offset: usize,
    pub total: usize,
    pub warnings: Vec<CoreRuleWarningV1>,
    pub next_offset: Option<usize>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScoreRuleWarningPageV2 {
    pub offset: usize,
    pub total: usize,
    pub warnings: Vec<CoreRuleWarningV2>,
    pub next_offset: Option<usize>,
}

pub type RuleWarningPageFailureV2 = RuleWarningPageFailureV1;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RuleWarningPageFailureV1 {
    InvalidPageSize { maximum: usize },
    OffsetOutOfBounds { total: usize },
    SemanticInvalid { diagnostics: Vec<CoreDiagnosticV1> },
    Assessment(AssessmentFailureV1),
}

impl From<AssessmentFailureV1> for RuleWarningPageFailureV1 {
    fn from(value: AssessmentFailureV1) -> Self {
        Self::Assessment(value)
    }
}

/// Returns a deterministic, bounded page of warnings. The report is derived
/// from document data and is never persisted as mutable state.
pub fn assess_score_rule_warning_page_v1(
    document: &ScoreDocumentV1,
    offset: usize,
    page_size: usize,
) -> Result<ScoreRuleWarningPageV1, RuleWarningPageFailureV1> {
    if !(1..=CORE_RULE_WARNING_PAGE_LIMIT_V1).contains(&page_size) {
        return Err(RuleWarningPageFailureV1::InvalidPageSize {
            maximum: CORE_RULE_WARNING_PAGE_LIMIT_V1,
        });
    }
    let semantic = assess_score_semantics_node(DocumentAssessmentNodeV1::new(document))?;
    if !semantic.ok {
        return Err(RuleWarningPageFailureV1::SemanticInvalid {
            diagnostics: semantic.diagnostics,
        });
    }

    let measures: HashMap<_, _> = document
        .measure_definitions
        .iter()
        .map(|measure| (&measure.id, measure))
        .collect();
    let mut warnings = Vec::new();
    let mut total = 0_usize;
    for part in &document.parts {
        for content in &part.measure_contents {
            let Some(measure) = measures.get(&content.measure_id) else {
                unreachable!("semantic assessment accepted a missing measure reference")
            };
            let nominal = assess_measure_duration(&measure.meter, measure.pickup_duration.as_ref())
                .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
            for voice in &content.voices {
                let start = ExactFraction::from_canonical(&voice.sequence.start)
                    .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
                let mut actual = start;
                for event in &voice.sequence.events {
                    actual = actual
                        .checked_add(
                            assess_note_duration(&event.duration)
                                .map_err(|_| AssessmentFailureV1::InternalCapacity)?,
                        )
                        .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
                }
                let start_after_measure = start
                    .checked_compare(nominal)
                    .map_err(|_| AssessmentFailureV1::InternalCapacity)?
                    == Ordering::Greater;
                let sequence_exceeds_measure = actual
                    .checked_compare(nominal)
                    .map_err(|_| AssessmentFailureV1::InternalCapacity)?
                    == Ordering::Greater;
                let (code, observed) = if start_after_measure {
                    (CoreRuleWarningCodeV1::SequenceStartAfterMeasure, start)
                } else if sequence_exceeds_measure {
                    (CoreRuleWarningCodeV1::SequenceExceedsMeasure, actual)
                } else {
                    continue;
                };
                if total >= offset && total - offset < page_size {
                    warnings
                        .try_reserve(1)
                        .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
                    warnings.push(CoreRuleWarningV1 {
                        warning_version: 1,
                        code,
                        message_key: format!("core.{}", code.as_str()),
                        part_id: part.id.clone(),
                        measure_id: content.measure_id.clone(),
                        voice_id: voice.id.clone(),
                        nominal_duration: nominal.to_fraction_v1(),
                        actual_duration: observed.to_fraction_v1(),
                        overflow: observed
                            .checked_sub(nominal)
                            .map_err(|_| AssessmentFailureV1::InternalCapacity)?
                            .to_fraction_v1(),
                    });
                }
                total = total
                    .checked_add(1)
                    .ok_or(AssessmentFailureV1::InternalCapacity)?;
            }
        }
    }
    if offset > total {
        return Err(RuleWarningPageFailureV1::OffsetOutOfBounds { total });
    }
    let end = offset + warnings.len();
    Ok(ScoreRuleWarningPageV1 {
        offset,
        total,
        warnings,
        next_offset: (end < total).then_some(end),
    })
}

/// V2 keeps the V1 time-warning behavior while exposing a closed union that can
/// add note-scoped warning details without changing the V1 wire contract.
pub fn assess_score_rule_warning_page_v2(
    document: &ScoreDocumentV1,
    offset: usize,
    page_size: usize,
) -> Result<ScoreRuleWarningPageV2, RuleWarningPageFailureV2> {
    if !(1..=CORE_RULE_WARNING_PAGE_LIMIT_V2).contains(&page_size) {
        return Err(RuleWarningPageFailureV2::InvalidPageSize {
            maximum: CORE_RULE_WARNING_PAGE_LIMIT_V2,
        });
    }
    let page = assess_score_rule_warning_page_v1(document, offset, page_size)?;
    let mut warnings = Vec::new();
    warnings
        .try_reserve(page.warnings.len())
        .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
    for warning in page.warnings {
        let code = match warning.code {
            CoreRuleWarningCodeV1::SequenceExceedsMeasure => {
                CoreRuleWarningCodeV2::SequenceExceedsMeasure
            }
            CoreRuleWarningCodeV1::SequenceStartAfterMeasure => {
                CoreRuleWarningCodeV2::SequenceStartAfterMeasure
            }
        };
        warnings.push(CoreRuleWarningV2 {
            warning_version: 2,
            code,
            message_key: format!("core.{}", code.as_str()),
            location: CoreRuleWarningLocationV2::Voice {
                part_id: warning.part_id,
                measure_id: warning.measure_id,
                voice_id: warning.voice_id,
            },
            details: CoreRuleWarningDetailsV2::Timing {
                nominal_duration: warning.nominal_duration,
                actual_duration: warning.actual_duration,
                overflow: warning.overflow,
            },
        });
    }
    Ok(ScoreRuleWarningPageV2 {
        offset: page.offset,
        total: page.total,
        warnings,
        next_offset: page.next_offset,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{LosslessDecode, LosslessEncode, NoteValueV1};
    use brilliant_core_types::SafeInteger;

    fn document() -> ScoreDocumentV1 {
        ScoreDocumentV1::from_lossless_value(
            crate::decode_js_value_json(crate::codec::SMOKE_DOCUMENT).unwrap(),
        )
        .unwrap()
    }

    #[test]
    fn overfull_measure_is_valid_and_reports_exact_overflow() {
        let mut document = document();
        let event = document.parts[0].measure_contents[0].voices[0]
            .sequence
            .events[0]
            .clone();
        document.parts[0].measure_contents[0].voices[0]
            .sequence
            .events
            .push(event);
        document.parts[0].measure_contents[0].voices[0]
            .sequence
            .events[1]
            .id = StableId::new("event-2").unwrap();
        let semantic =
            crate::assess_score_semantics_node(DocumentAssessmentNodeV1::new(&document)).unwrap();
        assert!(semantic.ok, "{semantic:?}");
        let page = assess_score_rule_warning_page_v1(&document, 0, 16).unwrap();
        assert_eq!(page.total, 1);
        let warning = &page.warnings[0];
        assert_eq!(warning.code, CoreRuleWarningCodeV1::SequenceExceedsMeasure);
        assert_eq!(warning.measure_id, StableId::new("measure-1").unwrap());
        assert_eq!(warning.voice_id, StableId::new("voice-1").unwrap());
        assert_eq!(warning.nominal_duration.numerator.get(), 1);
        assert_eq!(warning.actual_duration.numerator.get(), 2);
        assert_eq!(warning.overflow.numerator.get(), 1);
    }

    #[test]
    fn overfull_measure_uses_exact_arithmetic_without_a_business_ceiling() {
        let mut document = document();
        let event = document.parts[0].measure_contents[0].voices[0]
            .sequence
            .events[0]
            .clone();
        let events = &mut document.parts[0].measure_contents[0].voices[0]
            .sequence
            .events;
        // This finite fixture is a regression witness, not a product limit.
        for index in 2..=4 {
            let mut appended = event.clone();
            appended.id = StableId::new(format!("event-{index}")).unwrap();
            events.push(appended);
        }

        let semantic =
            crate::assess_score_semantics_node(DocumentAssessmentNodeV1::new(&document)).unwrap();
        assert!(semantic.ok, "{semantic:?}");
        let page = assess_score_rule_warning_page_v1(&document, 0, 16).unwrap();
        assert_eq!(page.total, 1);
        let warning = &page.warnings[0];
        assert_eq!(warning.nominal_duration.numerator.get(), 1);
        assert_eq!(warning.nominal_duration.denominator.get(), 1);
        assert_eq!(warning.actual_duration.numerator.get(), 4);
        assert_eq!(warning.actual_duration.denominator.get(), 1);
        assert_eq!(warning.overflow.numerator.get(), 3);
        assert_eq!(warning.overflow.denominator.get(), 1);
    }

    #[test]
    fn delayed_voice_start_is_valid_and_reports_exact_distance_after_measure() {
        let mut document = document();
        document.parts[0].measure_contents[0].voices[0]
            .sequence
            .start = FractionV1 {
            numerator: SafeInteger::new(5).unwrap(),
            denominator: SafeInteger::new(4).unwrap(),
        };

        let semantic =
            crate::assess_score_semantics_node(DocumentAssessmentNodeV1::new(&document)).unwrap();
        assert!(semantic.ok, "{semantic:?}");
        let page = assess_score_rule_warning_page_v1(&document, 0, 16).unwrap();
        assert_eq!(page.total, 1);
        let warning = &page.warnings[0];
        assert_eq!(
            warning.code,
            CoreRuleWarningCodeV1::SequenceStartAfterMeasure
        );
        assert_eq!(warning.nominal_duration.numerator.get(), 1);
        assert_eq!(warning.nominal_duration.denominator.get(), 1);
        assert_eq!(warning.actual_duration.numerator.get(), 5);
        assert_eq!(warning.actual_duration.denominator.get(), 4);
        assert_eq!(warning.overflow.numerator.get(), 1);
        assert_eq!(warning.overflow.denominator.get(), 4);
    }

    #[test]
    fn delayed_start_warning_precedes_the_implied_tail_overflow() {
        let mut document = document();
        document.parts[0].measure_contents[0].voices[0]
            .sequence
            .start = FractionV1 {
            numerator: SafeInteger::new(2).unwrap(),
            denominator: SafeInteger::new(1).unwrap(),
        };

        let page = assess_score_rule_warning_page_v1(&document, 0, 16).unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(
            page.warnings[0].code,
            CoreRuleWarningCodeV1::SequenceStartAfterMeasure
        );
        assert_eq!(page.warnings[0].actual_duration.numerator.get(), 2);
    }

    #[test]
    fn v2_projects_time_warnings_without_changing_v1() {
        let mut document = document();
        document.parts[0].measure_contents[0].voices[0]
            .sequence
            .start = FractionV1 {
            numerator: SafeInteger::new(5).unwrap(),
            denominator: SafeInteger::new(4).unwrap(),
        };

        let v1 = assess_score_rule_warning_page_v1(&document, 0, 16).unwrap();
        let v2 = assess_score_rule_warning_page_v2(&document, 0, 16).unwrap();
        assert_eq!(v1.total, v2.total);
        assert_eq!(v2.warnings.len(), 1);
        assert_eq!(
            v2.warnings[0].code,
            CoreRuleWarningCodeV2::SequenceStartAfterMeasure
        );
        assert!(matches!(
            &v2.warnings[0].location,
            CoreRuleWarningLocationV2::Voice { part_id, measure_id, voice_id }
                if part_id.as_js_string() == "part-1"
                    && measure_id.as_js_string() == "measure-1"
                    && voice_id.as_js_string() == "voice-1"
        ));
        assert!(matches!(
            &v2.warnings[0].details,
            CoreRuleWarningDetailsV2::Timing { nominal_duration, actual_duration, overflow }
                if nominal_duration.numerator.get() == 1
                    && actual_duration.numerator.get() == 5
                    && actual_duration.denominator.get() == 4
                    && overflow.numerator.get() == 1
                    && overflow.denominator.get() == 4
        ));
    }

    #[test]
    fn v2_pitch_union_has_exact_note_location_and_optional_decimal_semitone() {
        let warning = CoreRuleWarningV2 {
            warning_version: 2,
            code: CoreRuleWarningCodeV2::SoundingPitchOutOfPlaybackRange,
            message_key: "core.rule.sounding-pitch-out-of-playback-range".into(),
            location: CoreRuleWarningLocationV2::Note {
                part_id: StableId::new("part-1").unwrap(),
                measure_id: StableId::new("measure-1").unwrap(),
                voice_id: StableId::new("voice-1").unwrap(),
                event_id: StableId::new("event-1").unwrap(),
                note_id: StableId::new("note-1").unwrap(),
            },
            details: CoreRuleWarningDetailsV2::SoundingPitch {
                reason: CoreSoundingPitchWarningReasonV2::PlaybackRange,
                sounding_semitone: Some("9007199254741112".into()),
            },
        };
        let mut bytes = Vec::new();
        warning.write_lossless(&mut bytes).unwrap();
        assert_eq!(
            String::from_utf8(bytes).unwrap(),
            r#"{"warningVersion":2,"code":"rule.sounding-pitch-out-of-playback-range","messageKey":"core.rule.sounding-pitch-out-of-playback-range","location":{"kind":"note","partId":"part-1","measureId":"measure-1","voiceId":"voice-1","eventId":"event-1","noteId":"note-1"},"details":{"kind":"soundingPitch","reason":"playback-range","soundingSemitone":"9007199254741112"}}"#
        );
    }

    #[test]
    fn warning_disappears_when_duration_returns_to_capacity() {
        let mut document = document();
        document.parts[0].measure_contents[0].voices[0]
            .sequence
            .events[0]
            .duration = NoteValueV1 {
            base: SafeInteger::new(4).unwrap(),
            dots: SafeInteger::new(0).unwrap(),
            time_modification: None,
        };
        let page = assess_score_rule_warning_page_v1(&document, 0, 16).unwrap();
        assert_eq!(page.total, 0);
        assert!(page.warnings.is_empty());
    }
}
