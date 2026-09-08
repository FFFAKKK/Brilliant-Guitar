use super::*;
use crate::candidate::adoption::FinalizationFailure;
use crate::candidate::journal::measure_commands::MeasurePreparationFailure as Preparation;
use brilliant_core_types::DocumentVersionV1;
use brilliant_kernel_contracts::{InsertMeasurePartContentV1, KernelStage3MetricsV1};
use brilliant_score_foundation::{AdmissionMeasureDefinitionV1, MusicSequenceV1, ScoreDocumentV1};

fn document() -> ScoreDocumentV1 {
    let mut value = fixture();
    let ids: Vec<_> = value
        .measure_definitions
        .iter()
        .map(|definition| definition.id.clone())
        .collect();
    value.parts[0]
        .measure_contents
        .sort_by_key(|content| ids.iter().position(|id| id == &content.measure_id).unwrap());
    let mut second = value.parts[0].clone();
    second.id = id("measure-command-part-b");
    second.staves.truncate(1);
    second.staves[0].id = id("measure-command-staff-b");
    for (index, content) in second.measure_contents.iter_mut().enumerate() {
        content.voices.truncate(1);
        content.voices[0].id = id(format!("measure-command-voice-b-{index}"));
        content.voices[0].default_staff_id = second.staves[0].id.clone();
        content.voices[0].sequence.events.clear();
    }
    value.parts.push(second);
    value
}

fn definition(document: &ScoreDocumentV1, raw: &str) -> AdmissionMeasureDefinitionV1 {
    AdmissionMeasureDefinitionV1 {
        id: raw.into(),
        meter: document.measure_definitions[0].meter.clone(),
        pickup_duration: None,
    }
}

fn contents(document: &ScoreDocumentV1, label: &str) -> Vec<InsertMeasurePartContentV1<JsString>> {
    document
        .parts
        .iter()
        .enumerate()
        .map(|(index, part)| InsertMeasurePartContentV1 {
            part_id: part.id.as_js_string().clone(),
            voices: vec![AdmissionVoiceV1 {
                id: format!("{label}-voice-{index}").into(),
                default_staff_id: part.staves[0].id.as_js_string().clone(),
                sequence: MusicSequenceV1 {
                    start: part.measure_contents[0].voices[0].sequence.start.clone(),
                    events: Vec::new(),
                },
            }],
        })
        .collect()
}

fn recorder<'a>(
    store: &'a crate::store::LiveScoreStore,
    document: &ScoreDocumentV1,
) -> Recorder<'a> {
    Recorder::new(Candidate::new(
        TransactionOverlayV1::new(store),
        document.id.clone(),
    ))
}

#[test]
fn insert_precedence_resolves_document_anchor_and_payload_parts_before_duplicate_definition() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    for case in 0..4 {
        let mut recorder = recorder(&store, &initial);
        let mut payload = contents(&initial, "precedence");
        payload[0].part_id = "missing-part".into();
        let document_id: JsString = if case == 0 {
            "missing-document".into()
        } else {
            initial.id.as_js_string().clone()
        };
        let anchor: Option<JsString> = if case <= 1 {
            Some("missing-anchor".into())
        } else {
            None
        };
        if case == 3 {
            payload = contents(&initial, "precedence");
            payload.pop();
        }
        let mut duplicate = definition(&initial, "unused");
        duplicate.id = initial.measure_definitions[0].id.as_js_string().clone();
        let result =
            recorder.insert_measure_command(&document_id, duplicate, payload, anchor.as_ref());
        let expected = match case {
            0 | 2 => Preparation::Command(Failure::TargetNotFound),
            1 => Preparation::Command(Failure::AnchorNotFound),
            _ => Preparation::DuplicateDefinition { insertion_index: 0 },
        };
        assert_eq!(result, Err(expected), "case {case}");
        assert!(recorder.steps.is_empty());
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert_eq!(store.export_document().unwrap(), initial);
    }
}

#[test]
fn duplicate_definition_reports_current_requested_insertion_index() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    for index in 0..=initial.measure_definitions.len() {
        let mut recorder = recorder(&store, &initial);
        let mut value = definition(&initial, "unused");
        value.id = initial.measure_definitions[0].id.as_js_string().clone();
        let after = index
            .checked_sub(1)
            .map(|index| initial.measure_definitions[index].id.as_js_string());
        assert_eq!(
            recorder.insert_measure_command(
                initial.id.as_js_string(),
                value,
                contents(&initial, "duplicate"),
                after
            ),
            Err(Preparation::DuplicateDefinition {
                insertion_index: index
            })
        );
        assert!(recorder.steps.is_empty());
    }
}

#[test]
fn inexact_insert_coverage_reaches_final_semantics_without_a_preparation_error() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    for duplicate in [false, true] {
        let mut recorder = recorder(&store, &initial);
        let mut payload = contents(&initial, "coverage");
        if duplicate {
            payload[1].part_id = payload[0].part_id.clone();
        } else {
            payload.pop();
        }
        recorder
            .insert_measure_command(
                initial.id.as_js_string(),
                definition(&initial, "coverage-measure"),
                payload,
                None,
            )
            .unwrap();
        assert!(!recorder.steps.is_empty());
        assert!(
            matches!(recorder.prepare_combined_commit(&store, DocumentVersionV1::initial()),
            Err(FinalizationFailure::Command(Failure::SemanticInvalid { diagnostics })) if !diagnostics.is_empty())
        );
        assert_eq!(store.export_document().unwrap(), initial);
    }
}

#[test]
fn exact_insert_canonicalizes_payload_and_part_orders_with_exact_history_restoration() {
    let mut initial = document();
    initial.parts[1].measure_contents.reverse();
    let mut store = build_live_score_store(&initial).unwrap();
    let mut recorder = recorder(&store, &initial);
    let mut payload = contents(&initial, "canonical");
    payload.reverse();
    recorder
        .insert_measure_command(
            initial.id.as_js_string(),
            definition(&initial, "canonical-measure"),
            payload,
            None,
        )
        .unwrap();
    let (plan, history) = recorder
        .prepare_combined_commit(&store, DocumentVersionV1::initial())
        .unwrap();
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    let committed = store.export_document().unwrap();
    let order: Vec<_> = committed
        .measure_definitions
        .iter()
        .map(|value| value.id.clone())
        .collect();
    for (index, part) in committed.parts.iter().enumerate() {
        assert_eq!(
            part.measure_contents
                .iter()
                .map(|content| content.measure_id.clone())
                .collect::<Vec<_>>(),
            order
        );
        assert_eq!(
            part.measure_contents[0].voices[0].id,
            id(format!("canonical-voice-{index}"))
        );
    }
    for inverse in [true, false] {
        history
            .prepare_replay(
                &store,
                version,
                if inverse {
                    Direction::Inverse
                } else {
                    Direction::Forward
                },
            )
            .unwrap()
            .unwrap()
            .commit(&mut store, &mut version, &mut metrics)
            .unwrap();
        assert_eq!(
            store.export_document().unwrap(),
            if inverse {
                initial.clone()
            } else {
                committed.clone()
            }
        );
        assert_eq!(metrics.full_semantic_validations, 1);
    }
    assert_eq!(version.get(), 3);
}

#[test]
fn global_noop_move_repairs_part_order_and_inverse_preserves_its_previous_order() {
    let mut initial = document();
    initial.parts[1].measure_contents.reverse();
    let mut store = build_live_score_store(&initial).unwrap();
    let mut recorder = recorder(&store, &initial);
    assert_eq!(
        recorder.move_measure_command(initial.measure_definitions[0].id.as_js_string(), None),
        Ok(true)
    );
    let (plan, history) = recorder
        .prepare_combined_commit(&store, DocumentVersionV1::initial())
        .unwrap();
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    let mut expected = initial.clone();
    expected.parts[1].measure_contents.reverse();
    assert_eq!(store.export_document().unwrap(), expected);
    history
        .prepare_replay(&store, version, Direction::Inverse)
        .unwrap()
        .unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    assert_eq!(store.export_document().unwrap(), initial);
}

#[test]
fn true_measure_noop_requires_no_reservation_for_prefix_and_added_targets() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    for added in [false, true] {
        let mut recorder = recorder(&store, &initial);
        let target = if added {
            recorder
                .insert_measure_command(
                    initial.id.as_js_string(),
                    definition(&initial, "noop-measure"),
                    contents(&initial, "noop"),
                    None,
                )
                .unwrap();
            JsString::from("noop-measure")
        } else {
            initial.measure_definitions[0].id.as_js_string().clone()
        };
        let steps = recorder.steps.len();
        recorder.candidate.reservation = Reservation::fail_at(1);
        assert_eq!(recorder.move_measure_command(&target, None), Ok(false));
        assert_eq!(recorder.candidate.reservation.attempts, 0);
        assert!(recorder.candidate.reservation.ensure_active().is_ok());
        assert_eq!(recorder.steps.len(), steps);
        assert_eq!(store.export_document().unwrap(), initial);
    }
}

#[test]
fn global_anchor_cannot_rescue_a_missing_part_local_anchor() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    for insert in [false, true] {
        let mut recorder = recorder(&store, &initial);
        let mut incomplete = contents(&initial, "missing-local");
        incomplete.pop();
        recorder
            .insert_measure_command(
                initial.id.as_js_string(),
                definition(&initial, "missing-local-anchor"),
                incomplete,
                None,
            )
            .unwrap();
        let anchor_id = JsString::from("missing-local-anchor");
        let anchor = &anchor_id;
        let steps = recorder.steps.len();
        if insert {
            assert_eq!(
                recorder.insert_measure_command(
                    initial.id.as_js_string(),
                    definition(&initial, "local-anchor"),
                    contents(&initial, "local-anchor"),
                    Some(anchor)
                ),
                Err(Preparation::Command(Failure::InternalError))
            );
        } else {
            assert_eq!(
                recorder.move_measure_command(
                    initial.measure_definitions[1].id.as_js_string(),
                    Some(anchor)
                ),
                Err(Failure::InternalError)
            );
        }
        assert_eq!(recorder.steps.len(), steps);
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert_eq!(store.export_document().unwrap(), initial);
    }
}

#[test]
fn start_does_not_preempt_final_semantics_for_an_unrelated_duplicate_measure() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    let mut recorder = recorder(&store, &initial);
    let mut duplicate = definition(&initial, "unused");
    duplicate.id = initial.measure_definitions[0].id.as_js_string().clone();
    let payload = contents(&initial, "existing-duplicate")
        .into_iter()
        .map(|entry| {
            (
                recorder
                    .candidate
                    .resolve(Kind::Part, &entry.part_id)
                    .unwrap(),
                entry.voices,
            )
        })
        .collect();
    recorder
        .insert_measure_bundle(duplicate, payload, None)
        .unwrap();
    recorder
        .insert_measure_command(
            initial.id.as_js_string(),
            definition(&initial, "fresh-start"),
            contents(&initial, "fresh-start"),
            None,
        )
        .unwrap();
    assert!(
        matches!(recorder.prepare_combined_commit(&store, DocumentVersionV1::initial()),
        Err(FinalizationFailure::Command(Failure::SemanticInvalid { diagnostics })) if !diagnostics.is_empty())
    );
    assert_eq!(store.export_document().unwrap(), initial);
}

#[test]
fn move_target_self_and_anchor_failure_priority_is_stable() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    let existing = initial.measure_definitions[0].id.as_js_string().clone();
    for (target, after, expected) in [
        (
            JsString::from("missing"),
            JsString::from("missing"),
            Failure::TargetNotFound,
        ),
        (
            existing.clone(),
            existing.clone(),
            Failure::AnchorSelfReference,
        ),
        (existing, JsString::from("missing"), Failure::AnchorNotFound),
    ] {
        let mut recorder = recorder(&store, &initial);
        assert_eq!(
            recorder.move_measure_command(&target, Some(&after)),
            Err(expected)
        );
        assert!(recorder.steps.is_empty());
        assert!(recorder.candidate.reservation.ensure_active().is_err());
    }
}
