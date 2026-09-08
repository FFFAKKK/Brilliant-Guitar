use super::*;
use crate::{
    candidate::tests::{id, raw_part},
    store::{build_live_score_store, tests::fixture},
};

#[test]
fn empty_measure_and_descendant_ids_are_transient_and_replay_without_strong_promotion() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let part = recorder
        .candidate
        .resolve(Kind::Part, &"part-z".into())
        .unwrap();
    let mut voice = raw_part("unused")
        .measure_contents
        .remove(0)
        .voices
        .remove(0);
    voice.id = "".into();
    voice.default_staff_id = "".into();
    voice.sequence.events.clear();
    let raw = JsString::from("");
    recorder
        .insert_measure_bundle(
            AdmissionMeasureDefinitionV1 {
                id: raw.clone(),
                meter: document.measure_definitions[0].meter.clone(),
                pickup_duration: None,
            },
            vec![(part, vec![voice])],
            None,
        )
        .unwrap();
    recorder.remove_measure_bundle(&raw).unwrap();
    let (mut candidate, journal) = recorder.finish().unwrap();
    assert_eq!(journal.steps.len(), 2);
    for _ in 0..2 {
        journal.replay(&mut candidate, Direction::Inverse).unwrap();
        assert_eq!(
            candidate.resolve(Kind::Measure, &raw),
            Err(Failure::TargetNotFound)
        );
        journal.replay(&mut candidate, Direction::Forward).unwrap();
        assert_eq!(
            candidate.resolve(Kind::Measure, &raw),
            Err(Failure::TargetNotFound)
        );
        assert_eq!(
            candidate.resolve(Kind::Voice, &raw),
            Err(Failure::TargetNotFound)
        );
    }
    candidate.validate_final().unwrap();
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn repeated_payload_owner_retains_reverse_splice_order_and_replays_after_parent_repair() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let part = recorder
        .candidate
        .resolve(Kind::Part, &"part-z".into())
        .unwrap();
    let mut first = raw_part("unused")
        .measure_contents
        .remove(0)
        .voices
        .remove(0);
    first.id = "duplicate-first".into();
    first.sequence.events.clear();
    let mut second = first.clone();
    second.id = "duplicate-second".into();
    recorder
        .insert_measure_bundle(
            AdmissionMeasureDefinitionV1 {
                id: "measure-new".into(),
                meter: document.measure_definitions[0].meter.clone(),
                pickup_duration: None,
            },
            vec![
                (part.clone(), vec![first.clone()]),
                (part.clone(), vec![second]),
            ],
            None,
        )
        .unwrap();
    let contents = collect_sources(
        &mut recorder.candidate,
        &CandidateOrder::new(&part, Children::Contents),
    )
    .unwrap();
    assert_ne!(contents[0], contents[1]);
    for (index, raw) in ["duplicate-second", "duplicate-first"].iter().enumerate() {
        let voices = collect_sources(
            &mut recorder.candidate,
            &CandidateOrder::new(&contents[index], Children::Voices),
        )
        .unwrap();
        assert_eq!(
            recorder.candidate.raw_id(&voices[0]),
            Some(&JsString::from(*raw))
        );
    }
    recorder.remove_part(&"part-z".into()).unwrap();
    let mut repaired = raw_part("part-repaired");
    first.id = "repaired-voice".into();
    repaired
        .measure_contents
        .push(brilliant_score_foundation::PartMeasureContentV1 {
            measure_id: "measure-new".into(),
            voices: vec![first],
        });
    recorder.insert_part(repaired, None).unwrap();
    let (mut candidate, journal) = recorder.finish().unwrap();
    for _ in 0..2 {
        journal.replay(&mut candidate, Direction::Inverse).unwrap();
        let part = candidate.resolve(Kind::Part, &"part-z".into()).unwrap();
        let contents = collect_sources(
            &mut candidate,
            &CandidateOrder::new(&part, Children::Contents),
        )
        .unwrap();
        assert_eq!(contents.len(), document.measure_definitions.len());
        assert_eq!(
            candidate.resolve(Kind::Measure, &"measure-new".into()),
            Err(Failure::TargetNotFound)
        );
        journal.replay(&mut candidate, Direction::Forward).unwrap();
        assert_eq!(
            candidate.resolve(Kind::Voice, &"duplicate-first".into()),
            Err(Failure::TargetNotFound)
        );
        assert_eq!(
            candidate.resolve(Kind::Voice, &"duplicate-second".into()),
            Err(Failure::TargetNotFound)
        );
        candidate
            .resolve(Kind::Voice, &"repaired-voice".into())
            .unwrap();
    }
    candidate.validate_final().unwrap();
    assert_eq!(store.export_document().unwrap(), document);
}

fn add(recorder: &mut Recorder<'_>) -> Result<Occurrence, Failure> {
    let part = recorder.candidate.resolve(Kind::Part, &"part-z".into())?;
    let definition = fixture().measure_definitions.remove(0);
    let mut voice = raw_part("unused")
        .measure_contents
        .remove(0)
        .voices
        .remove(0);
    voice.id = "measure-new-voice".into();
    voice.sequence.events.clear();
    recorder.insert_measure_bundle(
        AdmissionMeasureDefinitionV1 {
            id: "measure-new".into(),
            meter: definition.meter,
            pickup_duration: None,
        },
        vec![(part, vec![voice])],
        None,
    )
}

#[test]
fn measure_recording_and_both_replay_directions_fail_closed_at_each_reservation() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let make = || {
        Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ))
    };
    let mut baseline = make();
    add(&mut baseline).unwrap();
    baseline.remove_measure_bundle(&"measure-a".into()).unwrap();
    let attempts = baseline.candidate.reservation.attempts;
    let (_, journal) = baseline.finish().unwrap();
    for at in 1..=attempts {
        let mut recorder = make();
        recorder.candidate.reservation = Reservation::fail_at(at);
        let result =
            add(&mut recorder).and_then(|_| recorder.remove_measure_bundle(&"measure-a".into()));
        assert_eq!(result, Err(Failure::InternalError), "record at {at}");
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert_eq!(store.export_document().unwrap(), document);
    }
    for inverse in [false, true] {
        let create = || {
            let mut candidate =
                Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
            if inverse {
                journal.replay(&mut candidate, Direction::Forward).unwrap();
            }
            candidate.reservation = Reservation::default();
            candidate
        };
        let mut baseline = create();
        journal
            .replay(
                &mut baseline,
                if inverse {
                    Direction::Inverse
                } else {
                    Direction::Forward
                },
            )
            .unwrap();
        for at in 1..=baseline.reservation.attempts {
            let mut candidate = create();
            candidate.reservation = Reservation::fail_at(at);
            assert_eq!(
                journal.replay(
                    &mut candidate,
                    if inverse {
                        Direction::Inverse
                    } else {
                        Direction::Forward
                    }
                ),
                Err(Failure::InternalError),
                "inverse={inverse}, replay at {at}"
            );
            assert!(candidate.reservation.ensure_active().is_err());
            assert_eq!(store.export_document().unwrap(), document);
        }
    }
}

#[test]
fn measure_composite_rejects_missing_duplicate_foreign_and_wrong_anchor_tables() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for corruption in 0..5 {
        for inverse in [false, true] {
            let mut recorder = Recorder::new(Candidate::new(
                TransactionOverlayV1::new(&store),
                document.id.clone(),
            ));
            recorder.remove_measure_bundle(&"measure-a".into()).unwrap();
            let (current, mut journal) = recorder.finish().unwrap();
            let operation = if inverse {
                &mut journal.steps[0].inverse
            } else {
                &mut journal.steps[0].forward
            };
            let Operation::Measure { bundle, .. } = operation else {
                panic!("measure operation");
            };
            let bundle = Arc::make_mut(bundle);
            match corruption {
                0 => {
                    bundle.contents.pop();
                }
                1 => {
                    bundle.contents.push(bundle.contents[0].clone());
                }
                2 => {
                    bundle.contents[0].owner = bundle.document;
                }
                3 => {
                    bundle.contents[0].anchor = Some(bundle.definition.image.nodes[0].id);
                }
                4 => {
                    bundle.parts = Arc::new(Vec::new());
                }
                _ => unreachable!(),
            }
            let mut candidate = if inverse {
                current
            } else {
                Candidate::new(TransactionOverlayV1::new(&store), document.id.clone())
            };
            assert_eq!(
                journal.replay(
                    &mut candidate,
                    if inverse {
                        Direction::Inverse
                    } else {
                        Direction::Forward
                    }
                ),
                Err(Failure::InternalError),
                "corruption={corruption}, inverse={inverse}"
            );
            assert!(candidate.reservation.ensure_active().is_err());
            assert_eq!(store.export_document().unwrap(), document);
        }
    }
}

#[test]
fn measure_removal_rejects_unrecorded_definition_descendant_and_parent_order_changes() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for corruption in 0..3 {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        match corruption {
            0 => {
                let target = recorder
                    .candidate
                    .resolve(Kind::Measure, &"measure-a".into())
                    .unwrap();
                let Value::MeasureDefinition {
                    mut meter,
                    pickup_duration,
                } = recorder.candidate.read_value(&target).unwrap()
                else {
                    panic!("definition");
                };
                meter.numerator = brilliant_core_types::SafeInteger::new(7).unwrap();
                recorder
                    .candidate
                    .replace_value(
                        &target,
                        Value::MeasureDefinition {
                            meter,
                            pickup_duration,
                        },
                    )
                    .unwrap();
            }
            1 => {
                let target = recorder
                    .candidate
                    .resolve(Kind::Voice, &"voice-a".into())
                    .unwrap();
                recorder
                    .candidate
                    .replace_staff_reference(&target, Some("unrecorded-staff".into()))
                    .unwrap();
            }
            2 => {
                let part = recorder
                    .candidate
                    .resolve(Kind::Part, &"part-z".into())
                    .unwrap();
                let content =
                    unique_content(&mut recorder.candidate, &part, &"measure-a".into()).unwrap();
                recorder
                    .candidate
                    .move_occurrence(&CandidateOrder::new(&part, Children::Contents), content, 1)
                    .unwrap();
            }
            _ => unreachable!(),
        }
        assert_eq!(
            recorder.remove_measure_bundle(&"measure-a".into()),
            Err(Failure::InternalError),
            "corruption={corruption}"
        );
        assert!(recorder.steps.is_empty());
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn measure_history_can_cycle_repeatedly_in_one_candidate_and_keeps_occurrence_lifetimes() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let inserted = add(&mut recorder).unwrap();
    recorder.remove_measure_bundle(&"measure-a".into()).unwrap();
    let (mut candidate, journal) = recorder.finish().unwrap();
    let mut previous = inserted;
    for _ in 0..3 {
        journal.replay(&mut candidate, Direction::Inverse).unwrap();
        assert_eq!(
            candidate.resolve(Kind::Measure, &"measure-new".into()),
            Err(Failure::TargetNotFound)
        );
        candidate
            .resolve(Kind::Measure, &"measure-a".into())
            .unwrap();
        journal.replay(&mut candidate, Direction::Forward).unwrap();
        let current = candidate
            .resolve(Kind::Measure, &"measure-new".into())
            .unwrap();
        assert_ne!(current, previous);
        assert!(!candidate.visible(&previous));
        previous = current;
    }
    assert_eq!(
        candidate.resolve(Kind::Measure, id("measure-a").as_js_string()),
        Err(Failure::TargetNotFound)
    );
    assert_eq!(store.export_document().unwrap(), document);
}
