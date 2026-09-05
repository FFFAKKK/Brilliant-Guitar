use std::{cmp::Ordering, collections::HashMap};

use brilliant_core_types::{FiniteNumber, LosslessJsonValue as Value};
use serde::{Deserialize, Serialize};

use crate::{
    AssessmentFailureV1, CoreDiagnosticCodeV1 as Code, CoreDiagnosticV1, assess_score_semantics,
    assessment::{effective_measure, event_duration, fraction},
    candidate::CandidateNode as Node,
    music_rules,
};

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CardinalityConstraintV1 {
    pub minimum: FiniteNumber,
    pub maximum: FiniteNumber,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProfileMeterV1 {
    pub numerator: FiniteNumber,
    pub denominator: FiniteNumber,
}

/// A feature policy is distinct from score validity and from strong store DTOs.
/// Custom profiles retain their numeric comparison semantics; they do not
/// change which score data is valid or which mutations can be adopted.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreFeatureProfileV1 {
    pub id: String,
    pub part_count: CardinalityConstraintV1,
    pub staff_count_per_part: CardinalityConstraintV1,
    pub voice_count_per_measure: CardinalityConstraintV1,
    pub meters: Vec<ProfileMeterV1>,
    pub allow_pickup: bool,
    pub require_sequence_start_at_zero: bool,
    pub require_complete_measure: bool,
    pub note_value_bases: Vec<FiniteNumber>,
    pub note_value_dots: Vec<FiniteNumber>,
    pub allow_time_modification: bool,
    pub maximum_notes_per_event: FiniteNumber,
}

impl ScoreFeatureProfileV1 {
    pub fn k1() -> Self {
        let n = |value| FiniteNumber::new(value).expect("finite K1 profile literal");
        let one = CardinalityConstraintV1 {
            minimum: n(1.0),
            maximum: n(1.0),
        };
        Self {
            id: "brilliant-guitar.k1".to_owned(),
            part_count: one.clone(),
            staff_count_per_part: one.clone(),
            voice_count_per_measure: one,
            meters: vec![ProfileMeterV1 {
                numerator: n(4.0),
                denominator: n(4.0),
            }],
            allow_pickup: false,
            require_sequence_start_at_zero: true,
            require_complete_measure: true,
            note_value_bases: vec![n(4.0), n(8.0), n(16.0)],
            note_value_dots: vec![n(0.0)],
            allow_time_modification: false,
            maximum_notes_per_event: n(1.0),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum ScoreSupportV1 {
    Supported { diagnostics: [CoreDiagnosticV1; 0] },
    Unsupported { diagnostics: Vec<CoreDiagnosticV1> },
    Invalid { diagnostics: Vec<CoreDiagnosticV1> },
}

impl crate::LosslessEncode for ScoreSupportV1 {
    fn write_lossless<W: std::io::Write + ?Sized>(
        &self,
        writer: &mut W,
    ) -> Result<(), crate::LosslessJsonError> {
        let mut object = crate::LosslessObjectWriter::new(writer)?;
        let (status, diagnostics): (&str, &[CoreDiagnosticV1]) = match self {
            Self::Supported { diagnostics } => ("supported", diagnostics),
            Self::Unsupported { diagnostics } => ("unsupported", diagnostics),
            Self::Invalid { diagnostics } => ("invalid", diagnostics),
        };
        object.field("status", status)?;
        object.field("diagnostics", diagnostics)?;
        object.end()
    }
}

fn within(value: usize, constraint: &CardinalityConstraintV1) -> bool {
    value as f64 >= constraint.minimum.get() && value as f64 <= constraint.maximum.get()
}

fn append(
    diagnostics: &mut Vec<CoreDiagnosticV1>,
    code: Code,
    node: &Node<'_>,
) -> Result<(), AssessmentFailureV1> {
    crate::diagnostics::append_diagnostic(diagnostics, code, node.path(), None)
}

/// Full reference assessment. Local Runtime edits use their dependency scheduler,
/// not this whole-document traversal. Invalid semantics suppress classification.
pub fn assess_score_profile(
    candidate: &Value,
    profile: &ScoreFeatureProfileV1,
) -> Result<ScoreSupportV1, AssessmentFailureV1> {
    let report = assess_score_semantics(candidate)?;
    if !report.ok {
        return Ok(ScoreSupportV1::Invalid {
            diagnostics: report.diagnostics,
        });
    }
    classify_valid_score(candidate, profile)
}

fn classify_valid_score(
    candidate: &Value,
    profile: &ScoreFeatureProfileV1,
) -> Result<ScoreSupportV1, AssessmentFailureV1> {
    let root = Node::root(candidate);
    let mut diagnostics = Vec::new();
    let parts = root.field("parts");
    if !within(parts.len()?, &profile.part_count) {
        append(&mut diagnostics, Code::UnsupportedPartCount, &parts)?;
    }
    let definitions = root.field("measureDefinitions");
    let mut measures = HashMap::new();
    measures
        .try_reserve(definitions.len()?)
        .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
    for measure in definitions.items()? {
        measures.insert(measure.field("id").string()?, measure.clone());
        let meter = measure.field("meter");
        let numerator = meter.field("numerator").number()?;
        let denominator = meter.field("denominator").number()?;
        if !profile.meters.iter().any(|allowed| {
            allowed.numerator.get() == numerator && allowed.denominator.get() == denominator
        }) {
            append(&mut diagnostics, Code::UnsupportedMeter, &meter)?;
        }
        if !profile.allow_pickup
            && let Some(pickup) = measure.optional("pickupDuration")
        {
            append(&mut diagnostics, Code::UnsupportedPickup, &pickup)?;
        }
    }
    for part in parts.items()? {
        let staves = part.field("staves");
        if !within(staves.len()?, &profile.staff_count_per_part) {
            append(&mut diagnostics, Code::UnsupportedStaffCount, &staves)?;
        }
        for content in part.field("measureContents").items()? {
            let voices = content.field("voices");
            if !within(voices.len()?, &profile.voice_count_per_measure) {
                append(&mut diagnostics, Code::UnsupportedVoiceCount, &voices)?;
            }
            let measure = measures.get(content.field("measureId").string()?);
            for voice in voices.items()? {
                let sequence = voice.field("sequence");
                let start = sequence.field("start");
                let (numerator, denominator) = fraction(&start)?;
                if profile.require_sequence_start_at_zero
                    && (numerator != 0.0 || denominator != 1.0)
                {
                    append(&mut diagnostics, Code::UnsupportedSequenceStart, &start)?;
                }
                let mut end = music_rules::canonical_fraction(numerator, denominator);
                for event in sequence.field("events").items()? {
                    let duration = event.field("duration");
                    let base = duration.field("base");
                    let dots = duration.field("dots");
                    let base_number = base.number()?;
                    let dots_number = dots.number()?;
                    if !profile
                        .note_value_bases
                        .iter()
                        .any(|allowed| allowed.get() == base_number)
                    {
                        append(&mut diagnostics, Code::UnsupportedNoteValueBase, &base)?;
                    }
                    if !profile
                        .note_value_dots
                        .iter()
                        .any(|allowed| allowed.get() == dots_number)
                    {
                        append(&mut diagnostics, Code::UnsupportedDots, &dots)?;
                    }
                    if !profile.allow_time_modification
                        && let Some(modification) = duration.optional("timeModification")
                    {
                        append(
                            &mut diagnostics,
                            Code::UnsupportedTimeModification,
                            &modification,
                        )?;
                    }
                    let content = event.field("content");
                    if content.field("kind").string()?.eq_ascii("notes") {
                        let notes = content.field("notes");
                        if notes.len()? as f64 > profile.maximum_notes_per_event.get() {
                            append(&mut diagnostics, Code::UnsupportedChord, &notes)?;
                        }
                    }
                    end = match (end, event_duration(&duration)?) {
                        (Some(current), Ok(duration)) => current.checked_add(duration).ok(),
                        _ => None,
                    };
                }
                if profile.require_complete_measure
                    && let Some(measure) = measure
                {
                    let comparison = match (end, effective_measure(measure)?) {
                        (Some(end), Ok(duration)) => end.checked_compare(duration).ok(),
                        _ => None,
                    };
                    if comparison != Some(Ordering::Equal) {
                        append(
                            &mut diagnostics,
                            Code::UnsupportedSequenceDuration,
                            &sequence,
                        )?;
                    }
                }
            }
        }
    }
    Ok(if diagnostics.is_empty() {
        ScoreSupportV1::Supported { diagnostics: [] }
    } else {
        ScoreSupportV1::Unsupported { diagnostics }
    })
}
