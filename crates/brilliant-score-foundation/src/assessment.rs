use serde_json::Value;
use std::{
    cmp::Ordering,
    collections::{HashMap, HashSet},
};

use crate::{
    AssessmentFailureV1, CoreDiagnosticCodeV1 as Code, CoreDiagnosticV1, ExactFraction,
    SemanticReportV1, candidate::CandidateNode as Node, music_rules,
};

type Outcome<T> = Result<T, AssessmentFailureV1>;

/// Assess a captured JSON candidate without first constructing strong store
/// IDs or integers. The caller owns decode/shape diagnostics and capture caps;
/// this API accumulates musical diagnostics on the structurally decoded input.
pub fn assess_score_semantics(candidate: &Value) -> Outcome<SemanticReportV1> {
    Validator::default().run(Node::root(candidate))
}

#[derive(Default)]
struct Validator<'a> {
    diagnostics: Vec<CoreDiagnosticV1>,
    ids: HashSet<&'a str>,
    measures: HashMap<&'a str, Node<'a>>,
    measure_order: Vec<&'a str>,
    part_ids: HashSet<&'a str>,
}

pub(crate) fn fraction(node: &Node<'_>) -> Outcome<(f64, f64)> {
    Ok((
        node.field("numerator").number()?,
        node.field("denominator").number()?,
    ))
}

pub(crate) fn effective_measure(node: &Node<'_>) -> Outcome<Result<ExactFraction, &'static str>> {
    let meter = node.field("meter");
    let pickup = node
        .optional("pickupDuration")
        .map(|node| fraction(&node))
        .transpose()?;
    Ok(music_rules::measure_duration(
        meter.field("numerator").number()?,
        meter.field("denominator").number()?,
        pickup,
    ))
}

pub(crate) fn event_duration(node: &Node<'_>) -> Outcome<Result<ExactFraction, &'static str>> {
    let modification = node
        .optional("timeModification")
        .map(|value| {
            Ok((
                value.field("actualNotes").number()?,
                value.field("normalNotes").number()?,
            ))
        })
        .transpose()?;
    Ok(music_rules::note_duration(
        node.field("base").number()?,
        node.field("dots").number()?,
        modification,
    ))
}

fn insert<'a>(set: &mut HashSet<&'a str>, value: &'a str) -> Outcome<bool> {
    set.try_reserve(1)
        .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
    Ok(set.insert(value))
}

impl<'a> Validator<'a> {
    fn add(&mut self, code: Code, node: &Node<'_>, detail: Option<(&str, &str)>) -> Outcome<()> {
        crate::diagnostics::append_diagnostic(&mut self.diagnostics, code, node.path(), detail)
    }

    fn register_id(&mut self, node: &Node<'a>) -> Outcome<()> {
        let id = node.string()?;
        if id.is_empty() {
            self.add(Code::IdEmpty, node, None)?;
        } else if !insert(&mut self.ids, id)? {
            self.add(Code::IdDuplicate, node, Some(("id", id)))?;
        }
        Ok(())
    }

    fn check_fraction(
        &mut self,
        node: &Node<'_>,
        positive: bool,
    ) -> Outcome<Option<ExactFraction>> {
        let (numerator, denominator) = fraction(node)?;
        let Some(value) = music_rules::canonical_fraction(numerator, denominator) else {
            self.add(Code::FractionNonCanonical, node, None)?;
            return Ok(None);
        };
        if if positive {
            numerator <= 0.0
        } else {
            numerator < 0.0
        } {
            self.add(Code::FractionSignInvalid, node, None)?;
            return Ok(None);
        }
        Ok(Some(value))
    }

    fn run(mut self, document: Node<'a>) -> Outcome<SemanticReportV1> {
        self.register_id(&document.field("id"))?;
        let tempo = document.field("metadata").field("tempo").field("bpm");
        if !music_rules::tempo_is_valid(tempo.number()?) {
            self.add(Code::TempoInvalid, &tempo, None)?;
        }
        self.check_measures(document.field("measureDefinitions"))?;
        let parts = document.field("parts");
        if parts.len()? == 0 {
            self.add(Code::PartRequired, &parts, None)?;
        }
        for part in parts.items()? {
            self.check_part(part)?;
        }
        self.check_extensions(document.field("extensions"))?;
        Ok(SemanticReportV1 {
            ok: self.diagnostics.is_empty(),
            diagnostics: self.diagnostics,
        })
    }

    fn check_measures(&mut self, measures: Node<'a>) -> Outcome<()> {
        if measures.len()? == 0 {
            self.add(Code::MeasureRequired, &measures, None)?;
        }
        for measure in measures.items()? {
            let id = measure.field("id");
            self.register_id(&id)?;
            let id = id.string()?;
            if !self.measures.contains_key(id) {
                self.measures
                    .try_reserve(1)
                    .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
                self.measure_order
                    .try_reserve(1)
                    .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
                self.measures.insert(id, measure.clone());
                self.measure_order.push(id);
            }
            let meter = measure.field("meter");
            let numerator = meter.field("numerator");
            let denominator = meter.field("denominator");
            if !music_rules::safe_integer(numerator.number()?) || numerator.number()? <= 0.0 {
                self.add(Code::MeterNumeratorInvalid, &numerator, None)?;
            }
            if !music_rules::note_base(denominator.number()?) {
                self.add(Code::MeterDenominatorInvalid, &denominator, None)?;
            }
            if let Some(pickup) = measure.optional("pickupDuration") {
                let checked = self.check_fraction(&pickup, true)?;
                let regular =
                    music_rules::measure_duration(numerator.number()?, denominator.number()?, None);
                if let (Some(pickup_duration), Ok(regular_duration)) = (checked, regular) {
                    match pickup_duration.checked_compare(regular_duration) {
                        Err(_) => self.add(Code::TimeArithmeticOverflow, &pickup, None)?,
                        Ok(Ordering::Greater) => {
                            self.add(Code::PickupExceedsMeasure, &pickup, None)?
                        }
                        _ => {}
                    }
                }
            }
        }
        Ok(())
    }

    fn check_part(&mut self, part: Node<'a>) -> Outcome<()> {
        self.register_id(&part.field("id"))?;
        insert(&mut self.part_ids, part.field("id").string()?)?;
        let transposition = part.field("instrument").field("writtenToSounding");
        let diatonic = transposition.field("diatonicSteps").number()?;
        let chromatic = transposition.field("chromaticSemitones").number()?;
        let transpose_valid = transposition.exact_fields(&["diatonicSteps", "chromaticSemitones"])
            && music_rules::safe_integer(diatonic)
            && music_rules::safe_integer(chromatic);
        if !transpose_valid {
            self.add(Code::TranspositionInvalid, &transposition, None)?;
        }
        let staves = part.field("staves");
        if staves.len()? == 0 {
            self.add(Code::StaffRequired, &staves, None)?;
        }
        let mut staff_ids = HashSet::new();
        for staff in staves.items()? {
            self.register_id(&staff.field("id"))?;
            insert(&mut staff_ids, staff.field("id").string()?)?;
            let lines = staff.field("lineCount");
            if !music_rules::safe_integer(lines.number()?) || lines.number()? <= 0.0 {
                self.add(Code::StaffLineCountInvalid, &lines, None)?;
            }
        }
        let contents = part.field("measureContents");
        let mut covered = HashSet::new();
        for content in contents.clone().items()? {
            let reference = content.field("measureId");
            let id = reference.string()?;
            let measure = self.measures.get(id).cloned();
            if measure.is_none() {
                self.add(Code::MeasureReferenceMissing, &reference, None)?;
            }
            if !insert(&mut covered, id)? {
                self.add(Code::MeasureCoverageDuplicate, &reference, None)?;
            }
            let voices = content.field("voices");
            if voices.len()? == 0 {
                self.add(Code::VoiceRequired, &voices, None)?;
            }
            for voice in voices.items()? {
                self.check_voice(
                    voice,
                    measure.as_ref(),
                    &staff_ids,
                    transpose_valid.then_some((diatonic, chromatic)),
                )?;
            }
        }
        for index in 0..self.measure_order.len() {
            let id = self.measure_order[index];
            if !covered.contains(id) {
                self.add(
                    Code::MeasureCoverageMissing,
                    &contents,
                    Some(("measureId", id)),
                )?;
            }
        }
        Ok(())
    }

    fn check_voice(
        &mut self,
        voice: Node<'a>,
        measure: Option<&Node<'a>>,
        staff_ids: &HashSet<&str>,
        transposition: Option<(f64, f64)>,
    ) -> Outcome<()> {
        self.register_id(&voice.field("id"))?;
        let staff = voice.field("defaultStaffId");
        if !staff_ids.contains(staff.string()?) {
            self.add(Code::StaffReferenceMissing, &staff, None)?;
        }
        let sequence = voice.field("sequence");
        let start = sequence.field("start");
        let mut current = self.check_fraction(&start, false)?;
        let duration = measure.map(effective_measure).transpose()?;
        if let Some(Err(reason)) = duration {
            self.add(
                Code::MeasureDurationInvalid,
                &start,
                Some(("reason", reason)),
            )?;
        }
        if let (Some(position), Some(Ok(end))) = (current, duration) {
            match position.checked_compare(end) {
                Err(_) => {
                    self.add(Code::TimeArithmeticOverflow, &start, None)?;
                    current = None;
                }
                Ok(Ordering::Greater) => self.add(Code::SequenceStartOutOfBounds, &start, None)?,
                _ => {}
            }
        }
        for event in sequence.field("events").items()? {
            let event_duration = self.check_event(&event, staff_ids, transposition)?;
            let (Some(position), Some(event_duration)) = (current, event_duration) else {
                continue;
            };
            match position.checked_add(event_duration) {
                Err(_) => {
                    self.add(Code::TimeArithmeticOverflow, &event.field("duration"), None)?;
                    current = None;
                }
                Ok(next) => {
                    current = Some(next);
                    if let Some(Ok(end)) = duration {
                        match next.checked_compare(end) {
                            Err(_) => {
                                self.add(
                                    Code::TimeArithmeticOverflow,
                                    &event.field("duration"),
                                    None,
                                )?;
                                current = None;
                            }
                            Ok(Ordering::Greater) => {
                                self.add(Code::SequenceExceedsMeasure, &event, None)?
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
        Ok(())
    }

    fn check_event(
        &mut self,
        event: &Node<'a>,
        staff_ids: &HashSet<&str>,
        transposition: Option<(f64, f64)>,
    ) -> Outcome<Option<ExactFraction>> {
        self.register_id(&event.field("id"))?;
        if let Some(staff) = event.optional("staffId")
            && !staff_ids.contains(staff.string()?)
        {
            self.add(Code::StaffReferenceMissing, &staff, None)?;
        }
        let content = event.field("content");
        if content.field("kind").string()? == "notes" {
            let notes = content.field("notes");
            if notes.len()? == 0 {
                self.add(Code::NotesRequired, &notes, None)?;
            }
            for note in notes.items()? {
                self.register_id(&note.field("id"))?;
                let pitch = note.field("writtenPitch");
                let step = pitch.field("step").string()?;
                let alter = pitch.field("alter").number()?;
                let octave = pitch.field("octave").number()?;
                if !pitch.exact_fields(&["step", "alter", "octave"])
                    || !music_rules::written_pitch(step, alter, octave)
                {
                    self.add(Code::WrittenPitchInvalid, &pitch, None)?;
                } else if let Some((diatonic, chromatic)) = transposition
                    && let Err(reason) =
                        music_rules::sounding_pitch(step, alter, octave, diatonic, chromatic)
                {
                    self.add(Code::SoundingPitchInvalid, &pitch, Some(("reason", reason)))?;
                }
            }
        }
        let duration = event.field("duration");
        match event_duration(&duration)? {
            Ok(value) => Ok(Some(value)),
            Err(reason) => {
                self.add(
                    if reason == "fraction-overflow" {
                        Code::TimeArithmeticOverflow
                    } else {
                        Code::NoteValueInvalid
                    },
                    &duration,
                    Some(("reason", reason)),
                )?;
                Ok(None)
            }
        }
    }

    fn check_extensions(&mut self, extensions: Node<'a>) -> Outcome<()> {
        let mut keys = HashSet::new();
        for extension in extensions.items()? {
            let namespace = extension.field("namespace");
            if !music_rules::extension_namespace(namespace.string()?) {
                self.add(Code::ExtensionNamespaceInvalid, &namespace, None)?;
            }
            let version = extension.field("schemaVersion");
            if !music_rules::safe_integer(version.number()?) || version.number()? <= 0.0 {
                self.add(Code::ExtensionSchemaVersionInvalid, &version, None)?;
            }
            let owner = extension.field("owner");
            let owner_key = if owner.field("kind").string()? == "score" {
                "score".to_owned()
            } else {
                let part = owner.field("partId");
                if !self.part_ids.contains(part.string()?) {
                    self.add(Code::ExtensionOwnerMissing, &part, None)?;
                }
                format!("part:{}", part.string()?)
            };
            keys.try_reserve(1)
                .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
            if !keys.insert(format!("{owner_key}|{}", namespace.string()?)) {
                self.add(Code::ExtensionDuplicate, &extension, None)?;
            }
            let payload = extension.field("payload");
            // Captured serde_json values are already finite JSON data. The
            // public direct semantic validator additionally rejects arrays;
            // object-only payload shape belongs to the document decoder.
            if payload.value.is_array() {
                self.add(Code::ExtensionPayloadInvalid, &payload, None)?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn corpus() -> Value {
        serde_json::from_str(include_str!(
            "../../../test/core-kernel/rust-migration/fixtures/semantic-assessment-oracle-v1.json"
        ))
        .expect("independent TypeScript oracle")
    }

    pub(super) fn patched_document(oracle: &Value, case: &Value) -> Value {
        let mut document = oracle["baseDocument"].clone();
        for patch in case["patches"].as_array().expect("patches") {
            let path = patch["path"].as_array().expect("path");
            let (last, ancestors) = path.split_last().expect("nonempty path");
            let mut parent = &mut document;
            for segment in ancestors {
                parent = if let Some(index) = segment.as_u64() {
                    &mut parent[index as usize]
                } else {
                    &mut parent[segment.as_str().expect("field")]
                };
            }
            if let Some(index) = last.as_u64() {
                parent[index as usize] = patch["value"].clone();
            } else {
                parent[last.as_str().expect("field")] = patch["value"].clone();
            }
        }
        document
    }

    #[test]
    fn full_semantics_match_every_independent_typescript_case_in_order() {
        let oracle = corpus();
        let cases = oracle["cases"].as_array().expect("cases");
        assert_eq!(cases.len(), 56);
        for case in cases {
            let document = patched_document(&oracle, case);
            let report = assess_score_semantics(&document).expect("structural candidate");
            assert_eq!(
                serde_json::to_value(report).expect("report"),
                case["expected"]["semantics"],
                "case {}",
                case["id"]
            );
        }
    }

    #[test]
    fn full_profile_matches_custom_and_default_typescript_assessment() {
        let oracle = corpus();
        for case in oracle["cases"].as_array().expect("cases") {
            let document = patched_document(&oracle, case);
            let profile = case
                .get("profile")
                .map(|value| serde_json::from_value(value.clone()).expect("profile"))
                .unwrap_or_else(crate::ScoreFeatureProfileV1::k1);
            let report = crate::assess_score_profile(&document, &profile).expect("assessment");
            assert_eq!(
                serde_json::to_value(report).expect("report"),
                case["expected"]["support"],
                "case {}",
                case["id"]
            );
        }
    }

    #[test]
    fn interacting_errors_and_pitch_boundaries_match_seeded_typescript_results() {
        let oracle: Value = serde_json::from_str(include_str!(
            "../../../test/core-kernel/rust-migration/fixtures/generated-assessment-oracle-v1.json"
        ))
        .expect("generated TypeScript oracle");
        let cases = oracle["cases"].as_array().expect("cases");
        assert_eq!(cases.len(), 576);
        let profile = crate::ScoreFeatureProfileV1::k1();
        for case in cases {
            let document = patched_document(&oracle, case);
            assert_eq!(
                serde_json::to_value(
                    assess_score_semantics(&document).expect("semantic assessment")
                )
                .expect("report"),
                case["expected"]["semantics"],
                "semantic case {}",
                case["id"]
            );
            assert_eq!(
                serde_json::to_value(
                    crate::assess_score_profile(&document, &profile).expect("profile assessment")
                )
                .expect("report"),
                case["expected"]["support"],
                "profile case {}",
                case["id"]
            );
        }
    }

    #[test]
    fn assessment_reports_exact_budget_then_fails_without_publishing_a_partial_report() {
        let mut document: Value =
            serde_json::from_str(crate::codec::SMOKE_DOCUMENT).expect("score");
        let limit = crate::diagnostics::CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1;
        let notes: Vec<_> = (0..limit)
            .map(|index| {
                serde_json::json!({
                    "id": format!("invalid-note-{index}"),
                    "writtenPitch": { "step": "C", "alter": 3, "octave": 4 },
                })
            })
            .collect();
        document["parts"][0]["measureContents"][0]["voices"][0]["sequence"]["events"][0]["content"] =
            serde_json::json!({ "kind": "notes", "notes": notes });
        let before = document.clone();
        let report = assess_score_semantics(&document).expect("inclusive diagnostic cap");
        assert!(!report.ok);
        assert_eq!(report.diagnostics.len(), limit);
        assert_eq!(document, before);
        document["parts"][0]["measureContents"][0]["voices"][0]["sequence"]["events"][0]["content"]["notes"].as_array_mut().expect("notes").push(serde_json::json!({ "id": "last-note", "writtenPitch": { "step": "C", "alter": 3, "octave": 4 } }));
        let before = document.clone();
        assert_eq!(
            assess_score_semantics(&document),
            Err(AssessmentFailureV1::DiagnosticLimit {
                limit,
                actual: limit + 1
            })
        );
        assert_eq!(
            crate::assess_score_profile(&document, &crate::ScoreFeatureProfileV1::k1()),
            Err(AssessmentFailureV1::DiagnosticLimit {
                limit,
                actual: limit + 1
            })
        );
        assert_eq!(document, before);
    }

    #[test]
    fn malformed_required_candidate_shape_is_separate_from_musical_diagnostics() {
        let mut document: Value =
            serde_json::from_str(crate::codec::SMOKE_DOCUMENT).expect("score");
        document["id"] = serde_json::json!(1);
        assert_eq!(
            assess_score_semantics(&document),
            Err(AssessmentFailureV1::InvalidCandidateShape {
                path: brilliant_core_types::StablePathV1::field("id")
            })
        );
        assert_eq!(
            assess_score_semantics(&Value::Null),
            Err(AssessmentFailureV1::InvalidCandidateShape {
                path: brilliant_core_types::StablePathV1::field("id")
            })
        );
    }

    #[test]
    fn valid_but_unsupported_scores_obey_the_same_inclusive_diagnostic_budget() {
        let limit = crate::CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1;
        for count in [limit, limit + 1] {
            let mut document: Value =
                serde_json::from_str(crate::codec::SMOKE_DOCUMENT).expect("score");
            document["measureDefinitions"][0]["meter"] =
                serde_json::json!({ "numerator": count, "denominator": 64 });
            document["parts"][0]["measureContents"][0]["voices"][0]["sequence"]["events"] = Value::Array((0..count).map(|index| serde_json::json!({ "id": format!("event-{index}"), "duration": { "base": 64, "dots": 0 }, "content": { "kind": "rest" } })).collect());
            assert!(assess_score_semantics(&document).expect("valid score").ok);
            let mut profile = crate::ScoreFeatureProfileV1::k1();
            profile.meters = serde_json::from_value(
                serde_json::json!([{ "numerator": count, "denominator": 64 }]),
            )
            .expect("custom meter");
            let result = crate::assess_score_profile(&document, &profile);
            if count == limit {
                let crate::ScoreSupportV1::Unsupported { diagnostics } =
                    result.expect("inclusive cap")
                else {
                    panic!("unsupported expected");
                };
                assert_eq!(diagnostics.len(), limit);
            } else {
                assert_eq!(
                    result,
                    Err(AssessmentFailureV1::DiagnosticLimit {
                        limit,
                        actual: count
                    })
                );
            }
        }
    }
}
