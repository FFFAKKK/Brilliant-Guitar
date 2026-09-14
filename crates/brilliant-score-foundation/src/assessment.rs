use brilliant_core_types::{JsString, LosslessJsonValue as Value};
use std::{
    cmp::Ordering,
    collections::{HashMap, HashSet},
};

use crate::{
    AssessmentFailureV1, AssessmentNodeV1, CoreDiagnosticCodeV1 as Code, CoreDiagnosticV1,
    ExactFraction, SemanticReportV1, candidate::CandidateNode as Node, music_rules,
};

type Outcome<T> = Result<T, AssessmentFailureV1>;

/// Assess a captured JSON candidate without first constructing strong store
/// IDs or integers. The caller owns decode/shape diagnostics and capture caps;
/// this API accumulates musical diagnostics on the structurally decoded input.
pub fn assess_score_semantics(candidate: &Value) -> Outcome<SemanticReportV1> {
    assess_score_semantics_node(Node::root(candidate))
}

/// Apply the same ordered musical checks to a borrowed or virtual candidate.
pub fn assess_score_semantics_node<N: AssessmentNodeV1>(candidate: N) -> Outcome<SemanticReportV1> {
    assess_score_semantics_node_observed(candidate, &std::cell::Cell::default())
}

/// Accumulates reached work into the caller's cell even when assessment fails.
pub fn assess_score_semantics_node_observed<N: AssessmentNodeV1>(
    candidate: N,
    work: &std::cell::Cell<crate::candidate::AssessmentWorkV1>,
) -> Outcome<SemanticReportV1> {
    Validator {
        work,
        diagnostics: Vec::new(),
        ids: HashSet::new(),
        measures: HashMap::new(),
        measure_order: Vec::new(),
        part_ids: HashSet::new(),
    }
    .run(crate::candidate::ObservedNode {
        node: candidate,
        work,
    })
}

struct Validator<'a, N> {
    work: &'a std::cell::Cell<crate::candidate::AssessmentWorkV1>,
    diagnostics: Vec<CoreDiagnosticV1>,
    ids: HashSet<JsString>,
    measures: HashMap<JsString, N>,
    measure_order: Vec<JsString>,
    part_ids: HashSet<JsString>,
}

pub(crate) fn fraction<N: AssessmentNodeV1>(node: &N) -> Outcome<(f64, f64)> {
    Ok((
        node.field("numerator").number()?,
        node.field("denominator").number()?,
    ))
}

pub(crate) fn effective_measure<N: AssessmentNodeV1>(
    node: &N,
) -> Outcome<Result<ExactFraction, &'static str>> {
    let meter = node.field("meter");
    let pickup = node
        .optional("pickupDuration")?
        .map(|node| fraction(&node))
        .transpose()?;
    Ok(music_rules::measure_duration(
        meter.field("numerator").number()?,
        meter.field("denominator").number()?,
        pickup,
    ))
}

pub(crate) fn event_duration<N: AssessmentNodeV1>(
    node: &N,
) -> Outcome<Result<ExactFraction, &'static str>> {
    let modification = node
        .optional("timeModification")?
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

fn insert(set: &mut HashSet<JsString>, value: JsString) -> Outcome<bool> {
    set.try_reserve(1)
        .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
    Ok(set.insert(value))
}

impl<N: AssessmentNodeV1> Validator<'_, N> {
    fn rule(&self) {
        let mut work = self.work.get();
        work.rules_evaluated = work.rules_evaluated.saturating_add(1);
        self.work.set(work);
    }
    fn add(&mut self, code: Code, node: &N, detail: Option<(&str, &JsString)>) -> Outcome<()> {
        crate::diagnostics::append_diagnostic(&mut self.diagnostics, code, node.path(), detail)
    }

    fn register_id(&mut self, node: &N) -> Outcome<()> {
        self.rule();
        let id = node.string()?;
        if id.is_empty() {
            self.add(Code::IdEmpty, node, None)?;
        } else if !insert(&mut self.ids, id.clone())? {
            self.add(Code::IdDuplicate, node, Some(("id", &id)))?;
        }
        Ok(())
    }

    fn check_fraction(&mut self, node: &N, positive: bool) -> Outcome<Option<ExactFraction>> {
        self.rule();
        let (numerator, denominator) = fraction(node)?;
        let Some(value) = music_rules::canonical_fraction(numerator, denominator) else {
            self.add(Code::FractionNonCanonical, node, None)?;
            return Ok(None);
        };
        self.rule();
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

    fn run(mut self, document: N) -> Outcome<SemanticReportV1> {
        self.register_id(&document.field("id"))?;
        let tempo = document.field("metadata").field("tempo").field("bpm");
        self.rule();
        if !music_rules::tempo_is_valid(tempo.number()?) {
            self.add(Code::TempoInvalid, &tempo, None)?;
        }
        self.check_measures(document.field("measureDefinitions"))?;
        let parts = document.field("parts");
        self.rule();
        if parts.len()? == 0 {
            self.add(Code::PartRequired, &parts, None)?;
        }
        for part in parts.items()? {
            let part = part?;
            self.check_part(part)?;
        }
        self.check_extensions(document.field("extensions"))?;
        Ok(SemanticReportV1 {
            ok: self.diagnostics.is_empty(),
            diagnostics: self.diagnostics,
        })
    }

    fn check_measures(&mut self, measures: N) -> Outcome<()> {
        self.rule();
        if measures.len()? == 0 {
            self.add(Code::MeasureRequired, &measures, None)?;
        }
        for measure in measures.items()? {
            let measure = measure?;
            let id = measure.field("id");
            self.register_id(&id)?;
            let id = id.string()?;
            if !self.measures.contains_key(&id) {
                self.measures
                    .try_reserve(1)
                    .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
                self.measure_order
                    .try_reserve(1)
                    .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
                self.measures.insert(id.clone(), measure.clone());
                self.measure_order.push(id);
            }
            let meter = measure.field("meter");
            let numerator = meter.field("numerator");
            let denominator = meter.field("denominator");
            self.rule();
            if !music_rules::safe_integer(numerator.number()?) || numerator.number()? <= 0.0 {
                self.add(Code::MeterNumeratorInvalid, &numerator, None)?;
            }
            self.rule();
            if !music_rules::note_base(denominator.number()?) {
                self.add(Code::MeterDenominatorInvalid, &denominator, None)?;
            }
            if let Some(pickup) = measure.optional("pickupDuration")? {
                let checked = self.check_fraction(&pickup, true)?;
                let regular =
                    music_rules::measure_duration(numerator.number()?, denominator.number()?, None);
                if let (Some(pickup_duration), Ok(regular_duration)) = (checked, regular) {
                    self.rule();
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

    fn check_part(&mut self, part: N) -> Outcome<()> {
        self.register_id(&part.field("id"))?;
        insert(&mut self.part_ids, part.field("id").string()?)?;
        let transposition = part.field("instrument").field("writtenToSounding");
        let diatonic = transposition.field("diatonicSteps").number()?;
        let chromatic = transposition.field("chromaticSemitones").number()?;
        self.rule();
        let transpose_valid = transposition
            .exact_fields(&["diatonicSteps", "chromaticSemitones"])?
            && music_rules::safe_integer(diatonic)
            && music_rules::safe_integer(chromatic);
        if !transpose_valid {
            self.add(Code::TranspositionInvalid, &transposition, None)?;
        }
        let staves = part.field("staves");
        self.rule();
        if staves.len()? == 0 {
            self.add(Code::StaffRequired, &staves, None)?;
        }
        let mut staff_ids = HashSet::new();
        for staff in staves.items()? {
            let staff = staff?;
            self.register_id(&staff.field("id"))?;
            insert(&mut staff_ids, staff.field("id").string()?)?;
            let lines = staff.field("lineCount");
            self.rule();
            if !music_rules::safe_integer(lines.number()?) || lines.number()? <= 0.0 {
                self.add(Code::StaffLineCountInvalid, &lines, None)?;
            }
        }
        let contents = part.field("measureContents");
        let mut covered = HashSet::new();
        for content in contents.clone().items()? {
            let content = content?;
            let reference = content.field("measureId");
            let id = reference.string()?;
            let measure = self.measures.get(&id).cloned();
            self.rule();
            if measure.is_none() {
                self.add(Code::MeasureReferenceMissing, &reference, None)?;
            }
            self.rule();
            if !insert(&mut covered, id)? {
                self.add(Code::MeasureCoverageDuplicate, &reference, None)?;
            }
            let voices = content.field("voices");
            self.rule();
            if voices.len()? == 0 {
                self.add(Code::VoiceRequired, &voices, None)?;
            }
            for voice in voices.items()? {
                let voice = voice?;
                self.check_voice(
                    voice,
                    measure.as_ref(),
                    &staff_ids,
                    transpose_valid.then_some((diatonic, chromatic)),
                )?;
            }
        }
        for index in 0..self.measure_order.len() {
            let id = self.measure_order[index].clone();
            self.rule();
            if !covered.contains(&id) {
                self.add(
                    Code::MeasureCoverageMissing,
                    &contents,
                    Some(("measureId", &id)),
                )?;
            }
        }
        Ok(())
    }

    fn check_voice(
        &mut self,
        voice: N,
        measure: Option<&N>,
        staff_ids: &HashSet<JsString>,
        transposition: Option<(f64, f64)>,
    ) -> Outcome<()> {
        self.register_id(&voice.field("id"))?;
        let staff = voice.field("defaultStaffId");
        self.rule();
        if !staff_ids.contains(&staff.string()?) {
            self.add(Code::StaffReferenceMissing, &staff, None)?;
        }
        let sequence = voice.field("sequence");
        let start = sequence.field("start");
        let mut current = self.check_fraction(&start, false)?;
        if measure.is_some() {
            self.rule();
        }
        let duration = measure.map(effective_measure).transpose()?;
        if let Some(Err(reason)) = duration {
            self.add(
                Code::MeasureDurationInvalid,
                &start,
                Some(("reason", &JsString::from(reason))),
            )?;
        }
        if let (Some(position), Some(Ok(end))) = (current, duration) {
            self.rule();
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
            let event = event?;
            let event_duration = self.check_event(&event, staff_ids, transposition)?;
            let (Some(position), Some(event_duration)) = (current, event_duration) else {
                continue;
            };
            self.rule();
            match position.checked_add(event_duration) {
                Err(_) => {
                    self.add(Code::TimeArithmeticOverflow, &event.field("duration"), None)?;
                    current = None;
                }
                Ok(next) => {
                    current = Some(next);
                    if let Some(Ok(end)) = duration {
                        self.rule();
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
        event: &N,
        staff_ids: &HashSet<JsString>,
        transposition: Option<(f64, f64)>,
    ) -> Outcome<Option<ExactFraction>> {
        self.register_id(&event.field("id"))?;
        self.rule();
        if let Some(staff) = event.optional("staffId")?
            && !staff_ids.contains(&staff.string()?)
        {
            self.add(Code::StaffReferenceMissing, &staff, None)?;
        }
        let content = event.field("content");
        if content.field("kind").string()?.eq_ascii("notes") {
            let notes = content.field("notes");
            self.rule();
            if notes.len()? == 0 {
                self.add(Code::NotesRequired, &notes, None)?;
            }
            for note in notes.items()? {
                let note = note?;
                self.register_id(&note.field("id"))?;
                let pitch = note.field("writtenPitch");
                let step = pitch.field("step").string()?;
                let alter = pitch.field("alter").number()?;
                let octave = pitch.field("octave").number()?;
                self.rule();
                if !pitch.exact_fields(&["step", "alter", "octave"])?
                    || !music_rules::written_pitch(step.code_units(), alter, octave)
                {
                    self.add(Code::WrittenPitchInvalid, &pitch, None)?;
                } else if let Some((diatonic, chromatic)) = transposition {
                    self.rule();
                    if let Err(reason) = music_rules::sounding_pitch(
                        step.code_units(),
                        alter,
                        octave,
                        diatonic,
                        chromatic,
                    ) {
                        self.add(
                            Code::SoundingPitchInvalid,
                            &pitch,
                            Some(("reason", &JsString::from(reason))),
                        )?;
                    }
                }
            }
        }
        let duration = event.field("duration");
        self.rule();
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
                    Some(("reason", &JsString::from(reason))),
                )?;
                Ok(None)
            }
        }
    }

    fn check_extensions(&mut self, extensions: N) -> Outcome<()> {
        let mut keys = HashSet::new();
        for extension in extensions.items()? {
            let extension = extension?;
            let namespace = extension.field("namespace");
            self.rule();
            if !music_rules::extension_namespace(&namespace.string()?) {
                self.add(Code::ExtensionNamespaceInvalid, &namespace, None)?;
            }
            let version = extension.field("schemaVersion");
            self.rule();
            if !music_rules::safe_integer(version.number()?) || version.number()? <= 0.0 {
                self.add(Code::ExtensionSchemaVersionInvalid, &version, None)?;
            }
            let owner = extension.field("owner");
            let owner_key = if owner.field("kind").string()?.eq_ascii("score") {
                None
            } else {
                let part = owner.field("partId");
                self.rule();
                if !self.part_ids.contains(&part.string()?) {
                    self.add(Code::ExtensionOwnerMissing, &part, None)?;
                }
                Some(part.string()?)
            };
            keys.try_reserve(1)
                .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
            self.rule();
            if !keys.insert((owner_key, namespace.string()?)) {
                self.add(Code::ExtensionDuplicate, &extension, None)?;
            }
            let payload = extension.field("payload");
            // Captured lossless JSON values are already finite JSON data. The
            // public direct semantic validator additionally rejects arrays;
            // object-only payload shape belongs to the document decoder.
            self.rule();
            if payload.is_array()? {
                self.add(Code::ExtensionPayloadInvalid, &payload, None)?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn observed_work_preserves_reports_and_survives_shape_failure() {
        let document = crate::decode_lossless_json(crate::codec::SMOKE_DOCUMENT).unwrap();
        let work = std::cell::Cell::default();
        let observed = assess_score_semantics_node_observed(Node::root(&document), &work).unwrap();
        assert_eq!(
            report_value(observed).unwrap(),
            report_value(assess_score_semantics(&document).unwrap()).unwrap()
        );
        assert!(work.get().rules_evaluated > 0);
        assert!(work.get().dependency_reads > work.get().rules_evaluated);
        let malformed = captured(&serde_json::json!({ "id": "score" }));
        let failed = std::cell::Cell::default();
        assert!(assess_score_semantics_node_observed(Node::root(&malformed), &failed).is_err());
        // ID registration and tempo validation are reached; later checks are not.
        assert_eq!(failed.get().rules_evaluated, 2);
        assert!(failed.get().dependency_reads > 0);
    }

    fn captured(value: &Value) -> brilliant_core_types::LosslessJsonValue {
        crate::decode_lossless_json(&value.to_string()).expect("lossless fixture")
    }

    fn report_value(report: impl crate::LosslessEncode) -> Result<Value, serde_json::Error> {
        let mut output = Vec::new();
        report
            .write_lossless(&mut output)
            .expect("explicit report codec");
        serde_json::from_slice(&output)
    }

    #[test]
    fn unpaired_ids_remain_distinct_and_duplicate_details_round_trip() {
        use crate::LosslessEncode;

        let input = crate::codec::SMOKE_DOCUMENT
            .replace("score-rkp1", r"\ud800")
            .replace("measure-1", r"\udc00")
            .replace("part-1", r"\ufffd")
            .replace("staff-1", r"\ud800\udc00");
        let candidate = crate::decode_lossless_json(&input).expect("lossless input");
        assert!(assess_score_semantics(&candidate).expect("assessment").ok);
        assert!(!matches!(
            crate::assess_score_profile(&candidate, &crate::ScoreFeatureProfileV1::k1())
                .expect("profile"),
            crate::ScoreSupportV1::Invalid { .. }
        ));

        let duplicate = crate::decode_lossless_json(&input.replace(r"\udc00", r"\ud800"))
            .expect("duplicate input");
        let report = assess_score_semantics(&duplicate).expect("duplicate assessment");
        assert_eq!(report.diagnostics.len(), 1);
        assert_eq!(report.diagnostics[0].code, Code::IdDuplicate);
        assert_eq!(
            report.diagnostics[0].details.as_ref().unwrap()["id"],
            brilliant_core_types::LosslessJsonValue::String(JsString::from_utf16(vec![0xd800]))
        );
        let mut bytes = Vec::new();
        report.write_lossless(&mut bytes).expect("lossless report");
        let text = std::str::from_utf8(&bytes).expect("JSON bytes");
        let encoded = crate::decode_lossless_json(text).expect("encoded report");
        let diagnostic = Node::root(&encoded)
            .field("diagnostics")
            .items()
            .unwrap()
            .next()
            .unwrap()
            .unwrap();
        assert_eq!(
            diagnostic
                .field("details")
                .field("id")
                .string()
                .unwrap()
                .code_units(),
            &[0xd800]
        );
    }

    #[test]
    fn missing_measure_coverage_echoes_exact_unpaired_reference() {
        let mut fixture: Value = serde_json::from_str(crate::codec::SMOKE_DOCUMENT).unwrap();
        fixture["parts"][0]["measureContents"] = serde_json::json!([]);
        let candidate =
            crate::decode_lossless_json(&fixture.to_string().replace("measure-1", r"\udfff"))
                .expect("candidate");
        let report = assess_score_semantics(&candidate).expect("assessment");
        assert_eq!(report.diagnostics.len(), 1);
        assert_eq!(report.diagnostics[0].code, Code::MeasureCoverageMissing);
        assert_eq!(
            report.diagnostics[0].details.as_ref().unwrap()["measureId"],
            brilliant_core_types::LosslessJsonValue::String(JsString::from_utf16(vec![0xdfff]))
        );
    }

    #[test]
    fn namespace_rejection_uses_original_code_units_and_keeps_diagnostic_order() {
        for namespace in [r"a.\ud800", r"a.\udc00", r"a.\ufffd", "a.é", "a..b", "a.1b"] {
            let input = crate::codec::SMOKE_DOCUMENT.replace("example.rkp1", namespace);
            let candidate = crate::decode_lossless_json(&input).unwrap();
            let report = assess_score_semantics(&candidate).expect("assessment");
            assert_eq!(report.diagnostics.len(), 1, "{namespace}");
            assert_eq!(report.diagnostics[0].code, Code::ExtensionNamespaceInvalid);
            assert_eq!(
                report.diagnostics[0].path,
                Node::root(&candidate)
                    .field("extensions")
                    .items()
                    .unwrap()
                    .next()
                    .unwrap()
                    .unwrap()
                    .field("namespace")
                    .path()
            );
        }
        for namespace in ["a.b", "a0.b-c.d9"] {
            let input = crate::codec::SMOKE_DOCUMENT.replace("example.rkp1", namespace);
            assert!(
                assess_score_semantics(&crate::decode_lossless_json(&input).unwrap())
                    .unwrap()
                    .ok
            );
        }
    }

    #[test]
    fn extension_identity_does_not_concatenate_owner_and_namespace() {
        let mut fixture: Value = serde_json::from_str(crate::codec::SMOKE_DOCUMENT).unwrap();
        fixture["extensions"] = serde_json::json!([
            {"namespace":"c.d", "schemaVersion":1, "owner":{"kind":"part", "partId":"x|a.b"}, "payload":{}},
            {"namespace":"a.b|c.d", "schemaVersion":1, "owner":{"kind":"part", "partId":"x"}, "payload":{}}
        ]);
        let report = assess_score_semantics(&captured(&fixture)).expect("assessment");
        assert_eq!(
            report
                .diagnostics
                .iter()
                .map(|item| item.code)
                .collect::<Vec<_>>(),
            vec![
                Code::ExtensionOwnerMissing,
                Code::ExtensionNamespaceInvalid,
                Code::ExtensionOwnerMissing,
            ]
        );
    }

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
    fn borrowed_typed_assessment_matches_representable_frozen_and_generated_oracles() {
        use crate::{DocumentAssessmentNodeV1, LosslessDecode, ScoreDocumentV1};
        let generated: Value = serde_json::from_str(include_str!(
            "../../../test/core-kernel/rust-migration/fixtures/generated-assessment-oracle-v1.json"
        ))
        .unwrap();
        let mut checked = 0;
        for oracle in [corpus(), generated] {
            for case in oracle["cases"].as_array().unwrap() {
                let candidate = captured(&patched_document(&oracle, case));
                // Admission rejects raw shapes/IDs not representable by typed DTOs.
                let Ok(document) = ScoreDocumentV1::from_lossless_value(candidate.clone()) else {
                    continue;
                };
                let profile = case
                    .get("profile")
                    .map(|value| serde_json::from_value(value.clone()).unwrap())
                    .unwrap_or_else(crate::ScoreFeatureProfileV1::k1);
                let borrowed = DocumentAssessmentNodeV1::new(&document);
                assert_eq!(
                    report_value(assess_score_semantics_node(borrowed.clone()).unwrap()).unwrap(),
                    case["expected"]["semantics"],
                    "{}",
                    case["id"]
                );
                assert_eq!(
                    report_value(crate::assess_score_profile_node(borrowed, &profile).unwrap())
                        .unwrap(),
                    case["expected"]["support"],
                    "{}",
                    case["id"]
                );
                checked += 1;
            }
        }
        assert_eq!(
            checked, 443,
            "typed subset of the unchanged 632-case corpus"
        );
    }

    #[test]
    fn full_semantics_match_every_independent_typescript_case_in_order() {
        let oracle = corpus();
        let cases = oracle["cases"].as_array().expect("cases");
        assert_eq!(cases.len(), 56);
        for case in cases {
            let document = patched_document(&oracle, case);
            let report =
                assess_score_semantics(&captured(&document)).expect("structural candidate");
            assert_eq!(
                report_value(report).expect("report"),
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
            let report =
                crate::assess_score_profile(&captured(&document), &profile).expect("assessment");
            assert_eq!(
                report_value(report).expect("report"),
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
                report_value(
                    assess_score_semantics(&captured(&document)).expect("semantic assessment")
                )
                .expect("report"),
                case["expected"]["semantics"],
                "semantic case {}",
                case["id"]
            );
            assert_eq!(
                report_value(
                    crate::assess_score_profile(&captured(&document), &profile)
                        .expect("profile assessment")
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
        let report =
            assess_score_semantics(&captured(&document)).expect("inclusive diagnostic cap");
        assert!(!report.ok);
        assert_eq!(report.diagnostics.len(), limit);
        assert_eq!(document, before);
        document["parts"][0]["measureContents"][0]["voices"][0]["sequence"]["events"][0]["content"]["notes"].as_array_mut().expect("notes").push(serde_json::json!({ "id": "last-note", "writtenPitch": { "step": "C", "alter": 3, "octave": 4 } }));
        let before = document.clone();
        assert_eq!(
            assess_score_semantics(&captured(&document)),
            Err(AssessmentFailureV1::DiagnosticLimit {
                limit,
                actual: limit + 1
            })
        );
        assert_eq!(
            crate::assess_score_profile(&captured(&document), &crate::ScoreFeatureProfileV1::k1()),
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
            assess_score_semantics(&captured(&document)),
            Err(AssessmentFailureV1::InvalidCandidateShape {
                path: brilliant_core_types::StablePathV1::field("id")
            })
        );
        assert_eq!(
            assess_score_semantics(&brilliant_core_types::LosslessJsonValue::Null),
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
            assert!(
                assess_score_semantics(&captured(&document))
                    .expect("valid score")
                    .ok
            );
            let mut profile = crate::ScoreFeatureProfileV1::k1();
            profile.meters = serde_json::from_value(
                serde_json::json!([{ "numerator": count, "denominator": 64 }]),
            )
            .expect("custom meter");
            let result = crate::assess_score_profile(&captured(&document), &profile);
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
