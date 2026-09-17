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

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum CoreRuleWarningCodeV1 {
    #[serde(rename = "rule.sequence-exceeds-measure")]
    SequenceExceedsMeasure,
}

impl CoreRuleWarningCodeV1 {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SequenceExceedsMeasure => "rule.sequence-exceeds-measure",
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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScoreRuleWarningPageV1 {
    pub offset: usize,
    pub total: usize,
    pub warnings: Vec<CoreRuleWarningV1>,
    pub next_offset: Option<usize>,
}

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
                let mut actual = ExactFraction::from_canonical(&voice.sequence.start)
                    .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
                for event in &voice.sequence.events {
                    actual = actual
                        .checked_add(
                            assess_note_duration(&event.duration)
                                .map_err(|_| AssessmentFailureV1::InternalCapacity)?,
                        )
                        .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
                }
                if actual
                    .checked_compare(nominal)
                    .map_err(|_| AssessmentFailureV1::InternalCapacity)?
                    != Ordering::Greater
                {
                    continue;
                }
                if total >= offset && total - offset < page_size {
                    warnings
                        .try_reserve(1)
                        .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
                    let code = CoreRuleWarningCodeV1::SequenceExceedsMeasure;
                    warnings.push(CoreRuleWarningV1 {
                        warning_version: 1,
                        code,
                        message_key: format!("core.{}", code.as_str()),
                        part_id: part.id.clone(),
                        measure_id: content.measure_id.clone(),
                        voice_id: voice.id.clone(),
                        nominal_duration: nominal.to_fraction_v1(),
                        actual_duration: actual.to_fraction_v1(),
                        overflow: actual
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{LosslessDecode, NoteValueV1};
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
    fn overfull_measure_has_no_one_beat_ceiling_and_reports_many_extra_beats() {
        let mut document = document();
        let event = document.parts[0].measure_contents[0].voices[0]
            .sequence
            .events[0]
            .clone();
        let events = &mut document.parts[0].measure_contents[0].voices[0]
            .sequence
            .events;
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
