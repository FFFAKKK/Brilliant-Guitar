use super::*;
use crate::candidate::journal::dispatch::AdmissionCommandFailure;
use crate::candidate::journal::range::RangePreparationFailure;
use crate::change_set::MAX_PREPARED_EFFECTS_V1 as LIMIT;
use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1 as Command, KernelStage3ResourceLimitKindV1,
    ScoreEntityTargetV1 as Target, ScoreRangeV1, StaffAnchorV1, VoiceEventPointKindV1,
    VoiceEventPointV1,
};
use brilliant_score_foundation::TranspositionV1;

fn cap(count: u64) -> Failure {
    Failure::ResourceLimitExceeded {
        limit_kind: KernelStage3ResourceLimitKindV1::Effects,
        limit: LIMIT,
        actual: LIMIT + count,
    }
}

#[test]
fn staff_effect_owner_ambiguity_follows_budget_but_noop_and_reference_conflict_precede_it() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let staff = &document.parts[0].staves[0];
    for mode in 0..4 {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        let mut duplicate = raw_part(document.parts[0].id.as_js_string());
        duplicate.staves.clear();
        duplicate.measure_contents.clear();
        recorder.insert_part(duplicate, None).unwrap();
        let before = recorder.steps.len();
        if mode != 1 {
            recorder.set_effect_budget(LIMIT);
        }
        let command = if mode == 3 {
            Command::StaffRemove {
                target: Target::Staff {
                    staff_id: staff.id.clone(),
                },
            }
        } else {
            Command::StaffSetDefinition {
                target: Target::Staff {
                    staff_id: staff.id.clone(),
                },
                line_count: if mode == 2 {
                    staff.line_count
                } else {
                    SafeInteger::new(7).unwrap()
                },
                default_clef: staff.default_clef.clone(),
            }
        };
        let result = recorder.dispatch_leaf(command);
        if mode == 2 {
            assert!(!result.unwrap().changed);
        } else {
            assert_eq!(
                result.err(),
                Some(AdmissionCommandFailure::Leaf(match mode {
                    0 => cap(1),
                    1 => Failure::InternalError,
                    _ => Failure::ReferenceConflict,
                }))
            );
            assert!(recorder.candidate.reservation.ensure_active().is_err());
        }
        assert_eq!(recorder.steps.len(), before);
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn staff_move_anchor_error_precedes_budget_and_duplicate_owner_effect() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let staff = &document.parts[0].staves[0];
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    recorder.set_effect_budget(LIMIT);
    let error = recorder
        .dispatch_leaf(Command::StaffMove {
            target: Target::Staff {
                staff_id: staff.id.clone(),
            },
            anchor: StaffAnchorV1::AfterStaff {
                staff_id: staff.id.as_js_string().clone(),
            },
        })
        .err();
    assert_eq!(
        error,
        Some(AdmissionCommandFailure::Leaf(Failure::AnchorSelfReference))
    );
}

#[test]
fn all_pitches_prepare_before_budget_and_budget_precedes_effect_writes() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let voice = &document.parts[0].measure_contents[0].voices[0];
    let event = &voice.sequence.events[0];
    let point = VoiceEventPointV1 {
        kind: VoiceEventPointKindV1::VoiceEvent,
        voice_id: voice.id.clone(),
        event_id: event.id.clone(),
    };
    let range = ScoreRangeV1::VoiceEventRange {
        start: point.clone(),
        end: point,
    };
    for (steps, semitones, noop) in [(0, 0, true), (1, 2, false), (i64::from(i32::MAX), 2, false)] {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        recorder.set_effect_budget(LIMIT);
        let result = recorder.transpose_range_command(
            document.id.as_js_string(),
            &range,
            &TranspositionV1 {
                diatonic_steps: SafeInteger::new(steps).unwrap(),
                chromatic_semitones: SafeInteger::new(semitones).unwrap(),
            },
        );
        if noop {
            assert_eq!(result, Ok(false));
        } else if steps == 1 {
            assert!(matches!(
                result,
                Err(RangePreparationFailure::Command(
                    Failure::ResourceLimitExceeded {
                        limit_kind: KernelStage3ResourceLimitKindV1::Effects,
                        ..
                    }
                ))
            ));
        } else {
            assert!(matches!(
                result,
                Err(RangePreparationFailure::Transform { .. })
            ));
        }
        assert!(recorder.steps.is_empty());
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn measure_local_anchor_failure_is_after_prepared_two_effect_budget() {
    let document = fixture();
    let missing = document.parts[0].measure_contents[0].measure_id.clone();
    let store = build_live_score_store(&document).unwrap();
    for budget in [None, Some(LIMIT - 1)] {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        recorder
            .remove_part(document.parts[0].id.as_js_string())
            .unwrap();
        let mut incomplete = raw_part(document.parts[0].id.as_js_string());
        incomplete.measure_contents.remove(0);
        recorder.insert_part(incomplete, None).unwrap();
        let before = recorder.steps.len();
        if let Some(prior) = budget {
            recorder.set_effect_budget(prior);
        }
        let result = recorder.insert_measure_command(
            document.id.as_js_string(),
            AdmissionMeasureDefinitionV1 {
                id: "budget-measure".into(),
                meter: document.measure_definitions[0].meter.clone(),
                pickup_duration: None,
            },
            vec![brilliant_kernel_contracts::InsertMeasurePartContentV1 {
                part_id: document.parts[0].id.as_js_string().clone(),
                voices: Vec::new(),
            }],
            Some(missing.as_js_string()),
        );
        let expected = if budget.is_some() {
            cap(1)
        } else {
            Failure::InternalError
        };
        assert_eq!(
            result.err(),
            Some(super::super::measure_commands::MeasurePreparationFailure::Command(expected))
        );
        assert_eq!(recorder.steps.len(), before);
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn range_effect_duplicate_note_is_rejected_after_the_whole_prepared_budget() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let voice = &document.parts[0].measure_contents[0].voices[0];
    let event = &voice.sequence.events[0];
    let point = VoiceEventPointV1 {
        kind: VoiceEventPointKindV1::VoiceEvent,
        voice_id: voice.id.clone(),
        event_id: event.id.clone(),
    };
    let range = ScoreRangeV1::VoiceEventRange {
        start: point.clone(),
        end: point,
    };
    for budget in [false, true] {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        let mut duplicate = raw_part("duplicate-note-part");
        for (index, staff) in duplicate.staves.iter_mut().enumerate() {
            staff.id = format!("duplicate-note-staff-{index}").into();
        }
        for (content_index, content) in duplicate.measure_contents.iter_mut().enumerate() {
            for (voice_index, voice) in content.voices.iter_mut().enumerate() {
                voice.id = format!("duplicate-note-voice-{content_index}-{voice_index}").into();
                for (event_index, event) in voice.sequence.events.iter_mut().enumerate() {
                    event.id =
                        format!("duplicate-note-event-{content_index}-{voice_index}-{event_index}")
                            .into();
                }
            }
        }
        recorder.insert_part(duplicate, None).unwrap();
        let before = recorder.steps.len();
        if budget {
            recorder.set_effect_budget(LIMIT);
        }
        let result = recorder.transpose_range_command(
            document.id.as_js_string(),
            &range,
            &TranspositionV1 {
                diatonic_steps: SafeInteger::new(1).unwrap(),
                chromatic_semitones: SafeInteger::new(2).unwrap(),
            },
        );
        if budget {
            assert!(matches!(
                result,
                Err(RangePreparationFailure::Command(
                    Failure::ResourceLimitExceeded {
                        limit_kind: KernelStage3ResourceLimitKindV1::Effects,
                        ..
                    }
                ))
            ));
        } else {
            assert_eq!(
                result,
                Err(RangePreparationFailure::Command(Failure::InternalError))
            );
        }
        assert_eq!(recorder.steps.len(), before);
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn voice_move_true_noop_precedes_ambiguous_owner_effect_and_budget() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let voice = &document.parts[0].measure_contents[0].voices[0];
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let mut duplicate = raw_part(document.parts[0].id.as_js_string());
    duplicate.staves.clear();
    duplicate.measure_contents.clear();
    recorder.insert_part(duplicate, None).unwrap();
    let before = recorder.steps.len();
    recorder.set_effect_budget(LIMIT);
    recorder.candidate.reservation = Reservation::fail_at(1);
    let facts = recorder
        .dispatch_leaf(Command::VoiceMove {
            target: Target::Voice {
                voice_id: voice.id.clone(),
            },
            anchor: brilliant_kernel_contracts::VoiceAnchorV1::Start,
        })
        .unwrap();
    assert!(!facts.changed);
    assert_eq!(recorder.steps.len(), before);
    assert_eq!(recorder.candidate.reservation.attempts, 0);
    assert_eq!(store.export_document().unwrap(), document);
}
