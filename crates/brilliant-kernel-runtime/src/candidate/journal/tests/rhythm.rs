use super::*;
use crate::{
    indices::{normalized_index_projection, rebuild_indices_from_store},
    store::LiveScoreStore,
};
use brilliant_core_types::DocumentVersionV1;
use brilliant_kernel_contracts::KernelStage3MetricsV1;
use brilliant_score_foundation::ScoreDocumentV1;

fn start<'a>(
    store: &'a LiveScoreStore,
    document: &ScoreDocumentV1,
    expected: &mut ScoreDocumentV1,
) -> Recorder<'a> {
    let mut prefix = TransactionOverlayV1::new(store);
    expected.parts[0].name = "typed prefix before rhythm suffix".into();
    prefix
        .replace_scalar(
            Scalar::PartName {
                part_id: document.parts[0].id.clone(),
            },
            Value::PartName(expected.parts[0].name.clone()),
        )
        .unwrap();
    Recorder::new(Candidate::new(prefix, document.id.clone()))
}

fn content(candidate: &mut Candidate<'_>, part: &Occurrence, measure: &JsString) -> Occurrence {
    let mut result = None;
    candidate
        .visit_order(
            &CandidateOrder::new(part, Children::Contents),
            &mut |source, raw| {
                if raw == measure {
                    assert!(result.is_none());
                    result = Some(source.clone());
                }
                true
            },
        )
        .unwrap();
    result.unwrap()
}

fn raw_voice(name: &str) -> AdmissionVoiceV1 {
    let mut voice = raw_part("unused")
        .measure_contents
        .remove(0)
        .voices
        .remove(0);
    voice.id = name.into();
    voice
}

fn raw_event(name: &str) -> RhythmicEventV1<JsString> {
    let mut event = raw_voice("unused").sequence.events.remove(0);
    event.id = name.into();
    if let RhythmicContentV1::Notes { notes } = &mut event.content {
        for (index, note) in notes.iter_mut().enumerate() {
            note.id = format!("{name}-note-{index}").into();
        }
    }
    event
}

// The plan must be detached before mutably borrowing its source Store. Every
// case exercises submit, a fresh inverse transaction, and a fresh redo.
macro_rules! roundtrip {
    ($recorder:ident, $store:ident, $document:ident, $expected:ident) => {{
        let (plan, history) = $recorder
            .prepare_combined_commit(&$store, DocumentVersionV1::initial())
            .unwrap();
        assert_eq!($store.export_document().unwrap(), $document);
        let mut version = DocumentVersionV1::initial();
        let mut metrics = KernelStage3MetricsV1::default();
        plan.unwrap()
            .commit(&mut $store, &mut version, &mut metrics)
            .unwrap();
        for stage in 0..3 {
            if stage != 0 {
                history
                    .prepare_replay(
                        &$store,
                        version,
                        if stage == 1 {
                            Direction::Inverse
                        } else {
                            Direction::Forward
                        },
                    )
                    .unwrap()
                    .unwrap()
                    .commit(&mut $store, &mut version, &mut metrics)
                    .unwrap();
            }
            assert_eq!(
                $store.export_document().unwrap(),
                if stage == 1 {
                    $document.clone()
                } else {
                    $expected.clone()
                }
            );
            assert_eq!(version.get(), stage + 1);
            assert_eq!(metrics.full_semantic_validations, 1);
            assert!(metrics.change_ops > 1);
            let (rebuilt, _) = rebuild_indices_from_store(&$store).unwrap();
            assert_eq!(
                normalized_index_projection(&$store, &$store.indices).unwrap(),
                normalized_index_projection(&$store, &rebuilt).unwrap()
            );
        }
    }};
}

#[test]
fn prefix_event_field_edit_then_delete_commits_a_valid_empty_event_list() {
    let document = fixture();
    let mut expected = document.clone();
    let mut store = build_live_score_store(&document).unwrap();
    let mut recorder = start(&store, &document, &mut expected);
    let event = recorder
        .candidate
        .resolve(Kind::Event, &"event-a".into())
        .unwrap();
    let mut duration = document.parts[0].measure_contents[0].voices[0]
        .sequence
        .events[0]
        .duration
        .clone();
    duration.dots = SafeInteger::new(1).unwrap();
    recorder
        .replace_scalar(&event, Value::EventNoteValue(duration))
        .unwrap();
    recorder
        .replace_reference(&event, Some("staff-z".into()))
        .unwrap();
    recorder.remove_event(&"event-a".into()).unwrap();
    expected.parts[0].measure_contents[0].voices[0]
        .sequence
        .events
        .clear();
    roundtrip!(recorder, store, document, expected);
}

#[test]
fn last_prefix_voice_can_be_removed_then_reborn_before_final_assessment() {
    let document = fixture();
    let mut expected = document.clone();
    let mut store = build_live_score_store(&document).unwrap();
    let mut recorder = start(&store, &document, &mut expected);
    let voice = recorder
        .candidate
        .resolve(Kind::Voice, &"voice-a".into())
        .unwrap();
    let owner = recorder.candidate.owner(&voice).unwrap();
    let part = recorder.candidate.owner(&owner).unwrap();
    recorder.remove_voice(&"voice-a".into()).unwrap();
    let mut visible = 0;
    recorder
        .candidate
        .visit_order(
            &CandidateOrder::new(&owner, Children::Voices),
            &mut |_, _| {
                visible += 1;
                true
            },
        )
        .unwrap();
    assert_eq!(visible, 0);
    let mut replacement = raw_voice("voice-a");
    replacement.default_staff_id = "staff-z".into();
    recorder
        .insert_voice(&part, &owner, replacement, None)
        .unwrap();
    expected.parts[0].measure_contents[0].voices[0].default_staff_id = id("staff-z");
    roundtrip!(recorder, store, document, expected);
}

#[test]
fn added_voice_event_edits_death_rebirth_and_parent_death_roundtrip_net_zero() {
    let document = fixture();
    let mut expected = document.clone();
    let mut store = build_live_score_store(&document).unwrap();
    let mut recorder = start(&store, &document, &mut expected);
    let part = recorder
        .candidate
        .resolve(Kind::Part, &"part-z".into())
        .unwrap();
    let owner = content(
        &mut recorder.candidate,
        &part,
        document.parts[0].measure_contents[0]
            .measure_id
            .as_js_string(),
    );
    let mut payload = raw_voice("added-voice");
    payload.sequence.events = vec![raw_event("added-event")];
    let voice = recorder.insert_voice(&part, &owner, payload, None).unwrap();
    let event = recorder
        .candidate
        .resolve(Kind::Event, &"added-event".into())
        .unwrap();
    let mut duration = raw_event("ignored").duration;
    duration.dots = SafeInteger::new(2).unwrap();
    recorder
        .replace_scalar(&event, Value::EventNoteValue(duration))
        .unwrap();
    recorder
        .replace_reference(&event, Some("staff-z".into()))
        .unwrap();
    recorder.remove_event(&"added-event".into()).unwrap();
    recorder
        .insert_event(&voice, raw_event("added-event"), None)
        .unwrap();
    recorder.remove_voice(&"added-voice".into()).unwrap();
    assert_eq!(
        recorder
            .candidate
            .resolve(Kind::Event, &"added-event".into()),
        Err(Failure::TargetNotFound)
    );
    roundtrip!(recorder, store, document, expected);
}

#[test]
fn active_part_can_lose_an_edited_added_event_then_its_voice_then_the_part() {
    let document = fixture();
    let mut expected = document.clone();
    let mut store = build_live_score_store(&document).unwrap();
    let mut recorder = start(&store, &document, &mut expected);
    let mut payload = raw_part("transient-part");
    for (index, staff) in payload.staves.iter_mut().enumerate() {
        staff.id = format!("transient-staff-{index}").into();
    }
    for (index, content) in payload.measure_contents.iter_mut().enumerate() {
        for (voice_index, voice) in content.voices.iter_mut().enumerate() {
            voice.id = format!("transient-voice-{index}-{voice_index}").into();
            voice.default_staff_id = "transient-staff-0".into();
            voice.sequence.events.clear();
        }
    }
    recorder.insert_part(payload, None).unwrap();
    let voice = recorder
        .candidate
        .resolve(Kind::Voice, &"transient-voice-0-0".into())
        .unwrap();
    let event = recorder
        .insert_event(&voice, raw_event("transient-event"), None)
        .unwrap();
    recorder
        .replace_reference(&event, Some("transient-staff-1".into()))
        .unwrap();
    recorder.remove_event(&"transient-event".into()).unwrap();
    recorder
        .remove_voice(&"transient-voice-0-0".into())
        .unwrap();
    recorder.remove_part(&"transient-part".into()).unwrap();
    roundtrip!(recorder, store, document, expected);
}

#[test]
fn prefix_event_same_id_rebirth_preserves_the_new_note_payload() {
    let document = fixture();
    let mut expected = document.clone();
    let mut store = build_live_score_store(&document).unwrap();
    let mut recorder = start(&store, &document, &mut expected);
    let voice = recorder
        .candidate
        .resolve(Kind::Voice, &"voice-a".into())
        .unwrap();
    recorder.remove_event(&"event-a".into()).unwrap();
    let mut replacement = raw_voice("unused").sequence.events.remove(0);
    let RhythmicContentV1::Notes { notes } = &mut replacement.content else {
        panic!("fixture chord");
    };
    notes[0].written_pitch.octave = SafeInteger::new(5).unwrap();
    recorder.insert_event(&voice, replacement, None).unwrap();
    let RhythmicContentV1::Notes { notes } = &mut expected.parts[0].measure_contents[0].voices[0]
        .sequence
        .events[0]
        .content
    else {
        panic!("fixture chord");
    };
    notes[0].written_pitch.octave = SafeInteger::new(5).unwrap();
    roundtrip!(recorder, store, document, expected);
}

#[test]
fn voice_removal_rejects_ambiguous_owner_routes_even_when_voice_id_is_unique() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for duplicate_part in [true, false] {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        let mut payload = raw_part(if duplicate_part {
            "part-z"
        } else {
            "ambiguous-content-part"
        });
        payload.staves.clear();
        if duplicate_part {
            payload.measure_contents.clear();
        } else {
            payload.measure_contents.truncate(1);
            payload.measure_contents[0].voices[0].id = "unique-ambiguous-voice".into();
            payload.measure_contents[0].voices[0]
                .sequence
                .events
                .clear();
            let mut duplicate = payload.measure_contents[0].clone();
            duplicate.voices.clear();
            payload.measure_contents.push(duplicate);
        }
        candidate.insert_part(payload, None).unwrap();
        let mut recorder = Recorder::new(candidate);
        let target: JsString = if duplicate_part {
            "voice-a"
        } else {
            "unique-ambiguous-voice"
        }
        .into();
        assert!(recorder.candidate.resolve(Kind::Voice, &target).is_ok());
        assert_eq!(recorder.remove_voice(&target), Err(Failure::InternalError));
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn added_rest_event_then_removed_prefix_notes_event_roundtrips_actual_content_kind() {
    let document = fixture();
    let mut expected = document.clone();
    let mut store = build_live_score_store(&document).unwrap();
    let mut recorder = start(&store, &document, &mut expected);
    let voice = recorder
        .candidate
        .resolve(Kind::Voice, &"voice-a".into())
        .unwrap();
    let mut event = raw_event("replacement-rest");
    event.content = RhythmicContentV1::Rest;
    event.staff_id = None;
    recorder
        .insert_event(&voice, event, Some(&"event-a".into()))
        .unwrap();
    recorder.remove_event(&"event-a".into()).unwrap();
    let final_event = &mut expected.parts[0].measure_contents[0].voices[0]
        .sequence
        .events[0];
    final_event.id = id("replacement-rest");
    final_event.content = RhythmicContentV1::Rest;
    final_event.staff_id = None;
    roundtrip!(recorder, store, document, expected);
}

fn isolated_event(recorder: &mut Recorder<'_>, added: bool) -> Occurrence {
    if added {
        let voice = recorder
            .candidate
            .resolve(Kind::Voice, &"voice-a".into())
            .unwrap();
        recorder
            .insert_event(&voice, raw_event("isolated-event"), None)
            .unwrap()
    } else {
        recorder
            .candidate
            .resolve(Kind::Event, &"event-a".into())
            .unwrap()
    }
}

#[test]
fn unrecorded_event_mutation_cannot_be_laundered_by_requesting_the_same_value() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for added in [false, true] {
        for previously_recorded in [false, true] {
            let mut recorder = Recorder::new(Candidate::new(
                TransactionOverlayV1::new(&store),
                document.id.clone(),
            ));
            let event = isolated_event(&mut recorder, added);
            let mut duration = raw_event("unused").duration;
            if previously_recorded {
                duration.dots = SafeInteger::new(1).unwrap();
                recorder
                    .replace_scalar(&event, Value::EventNoteValue(duration.clone()))
                    .unwrap();
            }
            duration.dots = SafeInteger::new(2).unwrap();
            let tampered = Value::EventNoteValue(duration);
            recorder
                .candidate
                .replace_value(&event, tampered.clone())
                .unwrap();
            let steps = recorder.steps.len();
            assert_eq!(
                recorder.replace_scalar(&event, tampered.clone()),
                Err(Failure::InternalError),
                "added={added}, recorded={previously_recorded}"
            );
            assert_eq!(recorder.steps.len(), steps);
            assert_eq!(recorder.candidate.read_value(&event), Some(tampered));
            assert!(recorder.candidate.reservation.ensure_active().is_err());
            assert!(recorder.finish().is_err());
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn valid_prefix_and_added_event_field_reference_and_move_noops_reserve_nothing() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for added in [false, true] {
        for action in 0..3 {
            let mut recorder = Recorder::new(Candidate::new(
                TransactionOverlayV1::new(&store),
                document.id.clone(),
            ));
            let event = isolated_event(&mut recorder, added);
            let owner = recorder.candidate.owner(&event).unwrap();
            let raw = recorder.candidate.raw_id(&event).unwrap().clone();
            let value = recorder.candidate.read_value(&event).unwrap();
            let reference = recorder.candidate.read_staff_reference(&event).unwrap();
            let steps = recorder.steps.len();
            recorder.candidate.reservation = Reservation::fail_at(1);
            let result = match action {
                0 => recorder.replace_scalar(&event, value),
                1 => recorder.replace_reference(&event, reference),
                2 => {
                    recorder.move_child(&CandidateOrder::new(&owner, Children::Events), &raw, None)
                }
                _ => unreachable!(),
            };
            assert_eq!(result, Ok(false), "added={added}, action={action}");
            assert_eq!(recorder.candidate.reservation.attempts, 0);
            assert!(recorder.candidate.reservation.ensure_active().is_ok());
            assert_eq!(recorder.steps.len(), steps);
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
}

fn nested_lifecycle(recorder: &mut Recorder<'_>, case: usize) -> Result<(), Failure> {
    if case == 0 {
        let voice = recorder.candidate.resolve(Kind::Voice, &"voice-a".into())?;
        let event = recorder.insert_event(&voice, raw_event("fault-event"), None)?;
        let mut value = raw_event("unused").duration;
        value.dots = SafeInteger::new(1).unwrap();
        recorder.replace_scalar(&event, Value::EventNoteValue(value))?;
        recorder.remove_event(&"fault-event".into())
    } else if case == 1 {
        let old = recorder.candidate.resolve(Kind::Voice, &"voice-a".into())?;
        let owner = recorder
            .candidate
            .owner(&old)
            .ok_or(Failure::InternalError)?;
        let part = recorder
            .candidate
            .owner(&owner)
            .ok_or(Failure::InternalError)?;
        let mut payload = raw_voice("fault-voice");
        payload.sequence.events = vec![raw_event("fault-original-event")];
        let voice = recorder.insert_voice(&part, &owner, payload, None)?;
        let event = recorder.insert_event(&voice, raw_event("fault-extra-event"), None)?;
        recorder.replace_reference(&event, Some("staff-z".into()))?;
        recorder.remove_event(&"fault-original-event".into())?;
        recorder.remove_voice(&"fault-voice".into())
    } else {
        let voice = recorder.candidate.resolve(Kind::Voice, &"voice-a".into())?;
        let owner = recorder
            .candidate
            .owner(&voice)
            .ok_or(Failure::InternalError)?;
        let part = recorder
            .candidate
            .owner(&owner)
            .ok_or(Failure::InternalError)?;
        recorder.remove_event(&"event-a".into())?;
        recorder.remove_voice(&"voice-a".into())?;
        recorder.insert_voice(&part, &owner, raw_voice("voice-a"), None)?;
        Ok(())
    }
}

#[test]
fn every_rhythm_record_and_forward_inverse_reservation_failure_is_terminal() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let prefix = || {
        let mut value = TransactionOverlayV1::new(&store);
        value
            .replace_scalar(
                Scalar::PartName {
                    part_id: id("part-z"),
                },
                Value::PartName("frozen rhythm prefix".into()),
            )
            .unwrap();
        value
    };
    let expected_prefix = prefix().finish().unwrap();
    for case in 0..3 {
        let mut baseline = Recorder::new(Candidate::new(prefix(), document.id.clone()));
        nested_lifecycle(&mut baseline, case).unwrap();
        let attempts = baseline.candidate.reservation.attempts;
        assert!(attempts > 0);
        for at in 1..=attempts {
            let mut recorder = Recorder::new(Candidate::new(prefix(), document.id.clone()));
            recorder.candidate.reservation = Reservation::fail_at(at);
            assert_eq!(
                nested_lifecycle(&mut recorder, case),
                Err(Failure::InternalError),
                "case={case}, record={at}"
            );
            assert_eq!(recorder.candidate.reservation.attempts, at);
            assert_eq!(
                recorder.remove_event(&"event-a".into()),
                Err(Failure::InternalError)
            );
            assert!(
                std::mem::take(&mut recorder.identities)
                    .finish(&mut recorder.candidate)
                    .is_err()
            );
            assert_eq!(recorder.candidate.prefix.finish().unwrap(), expected_prefix);
            assert_eq!(store.export_document().unwrap(), document);
        }
        let (_, journal) = baseline.finish().unwrap();
        for inverse in [false, true] {
            let direction = || {
                if inverse {
                    Direction::Inverse
                } else {
                    Direction::Forward
                }
            };
            let mut baseline = Candidate::new(prefix(), document.id.clone());
            journal.replay(&mut baseline, direction()).unwrap();
            let attempts = baseline.reservation.attempts;
            assert!(attempts > 0);
            for at in 1..=attempts {
                let mut candidate = Candidate::new(prefix(), document.id.clone());
                candidate.reservation = Reservation::fail_at(at);
                assert_eq!(
                    journal.replay(&mut candidate, direction()),
                    Err(Failure::InternalError),
                    "case={case}, inverse={inverse}, reservation={at}"
                );
                assert_eq!(candidate.reservation.attempts, at);
                assert_eq!(
                    journal.replay(&mut candidate, direction()),
                    Err(Failure::InternalError)
                );
                assert_eq!(candidate.reservation.attempts, at);
                assert!(IdentityRecorder::default().finish(&mut candidate).is_err());
                assert_eq!(candidate.prefix.finish().unwrap(), expected_prefix);
                assert_eq!(store.export_document().unwrap(), document);
            }
        }
    }
}

#[test]
fn voice_death_unbinds_deep_event_and_note_ids_before_any_stale_field_replay() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let old = recorder
        .candidate
        .resolve(Kind::Voice, &"voice-a".into())
        .unwrap();
    let owner = recorder.candidate.owner(&old).unwrap();
    let part = recorder.candidate.owner(&owner).unwrap();
    let mut payload = raw_voice("binding-voice");
    payload.sequence.events = vec![raw_event("binding-event")];
    recorder.insert_voice(&part, &owner, payload, None).unwrap();
    recorder.remove_voice(&"binding-voice".into()).unwrap();
    let (_, journal) = recorder.finish().unwrap();
    let Operation::InsertEntity {
        bundle: StoredEntityBundle::Voice(bundle),
        ..
    } = &journal.steps[0].forward
    else {
        panic!("Voice insertion");
    };
    let note = bundle
        .nodes
        .iter()
        .find(|node| node.image.kind == Kind::Note)
        .unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let mut bindings = ReplayBindings::at(
        &journal.identities,
        BoundarySide::SuffixStart,
        &mut candidate,
    )
    .unwrap();
    journal.steps[0]
        .forward
        .apply(&mut candidate, &mut bindings)
        .unwrap();
    let old_sources: Vec<_> = bundle
        .nodes
        .iter()
        .map(|node| bindings.resolve(node.id, &candidate).unwrap())
        .collect();
    journal.steps[1]
        .forward
        .apply(&mut candidate, &mut bindings)
        .unwrap();
    for (node, source) in bundle.nodes.iter().zip(&old_sources) {
        assert!(!candidate.visible(source));
        assert_eq!(
            bindings.resolve(node.id, &candidate),
            Err(Failure::InternalError)
        );
    }
    let expected = note.image.value.clone().unwrap();
    let mut replacement = expected.clone();
    let Value::NoteWrittenPitch(pitch) = &mut replacement else {
        panic!("note pitch");
    };
    pitch.octave = SafeInteger::new(6).unwrap();
    let stale = Operation::ReplaceScalar {
        target: note.id,
        expected: Arc::new(expected),
        value: Arc::new(replacement),
    };
    assert_eq!(
        stale.apply(&mut candidate, &mut bindings),
        Err(Failure::InternalError)
    );
    assert_eq!(
        candidate.resolve(Kind::Note, &note.image.raw_id),
        Err(Failure::TargetNotFound)
    );
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn valid_prefix_and_added_voice_field_reference_and_move_noops_reserve_nothing() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for added in [false, true] {
        for action in 0..3 {
            let mut recorder = Recorder::new(Candidate::new(
                TransactionOverlayV1::new(&store),
                document.id.clone(),
            ));
            let mut voice = recorder
                .candidate
                .resolve(Kind::Voice, &"voice-a".into())
                .unwrap();
            let owner = recorder.candidate.owner(&voice).unwrap();
            if added {
                let part = recorder.candidate.owner(&owner).unwrap();
                let mut payload = raw_voice("noop-voice");
                payload.sequence.events.clear();
                voice = recorder.insert_voice(&part, &owner, payload, None).unwrap();
            }
            let raw = recorder.candidate.raw_id(&voice).unwrap().clone();
            let value = recorder.candidate.read_value(&voice).unwrap();
            let reference = recorder.candidate.read_staff_reference(&voice).unwrap();
            let steps = recorder.steps.len();
            recorder.candidate.reservation = Reservation::fail_at(1);
            let result = match action {
                0 => recorder.replace_scalar(&voice, value),
                1 => recorder.replace_reference(&voice, reference),
                2 => {
                    recorder.move_child(&CandidateOrder::new(&owner, Children::Voices), &raw, None)
                }
                _ => unreachable!(),
            };
            assert_eq!(result, Ok(false), "added={added}, action={action}");
            assert_eq!(recorder.candidate.reservation.attempts, 0);
            assert!(recorder.candidate.reservation.ensure_active().is_ok());
            assert_eq!(recorder.steps.len(), steps);
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
}
