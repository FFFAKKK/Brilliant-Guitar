use super::*;

fn moving_part() -> AdmissionPartV1 {
    let mut part = raw_part("temporary");
    part.staves[0].id = "move-staff-a".into();
    part.staves[1].id = "move-staff-b".into();
    let mut empty = part.staves[0].clone();
    empty.id = JsString::from("");
    part.staves.insert(1, empty);
    let extra_voice = part.measure_contents[0].voices[0].clone();
    part.measure_contents[0].voices.push(extra_voice);
    for (content_index, content) in part.measure_contents.iter_mut().enumerate() {
        for (voice_index, voice) in content.voices.iter_mut().enumerate() {
            voice.id = format!("move-voice-{content_index}-{voice_index}").into();
            voice.sequence.events.push(voice.sequence.events[0].clone());
            for (event_index, event) in voice.sequence.events.iter_mut().enumerate() {
                event.id = format!("move-event-{content_index}-{voice_index}-{event_index}").into();
                if let RhythmicContentV1::Notes { notes } = &mut event.content {
                    notes.push(notes[0].clone());
                    for (note_index, note) in notes.iter_mut().enumerate() {
                        note.id = format!(
                            "move-note-{content_index}-{voice_index}-{event_index}-{note_index}"
                        )
                        .into();
                    }
                }
            }
        }
    }
    part
}

fn sources(candidate: &mut Candidate<'_>, order: &CandidateOrder) -> Vec<Occurrence> {
    let mut values = Vec::new();
    candidate
        .visit_order(order, &mut |source, _| {
            values.push(source.clone());
            true
        })
        .unwrap();
    values
}

fn ids(candidate: &mut Candidate<'_>, order: &CandidateOrder) -> Vec<JsString> {
    let mut values = Vec::new();
    candidate
        .visit_order(order, &mut |_, raw| {
            values.push(raw.to_owned());
            true
        })
        .unwrap();
    values
}

fn move_staff_and_voice(recorder: &mut Recorder<'_>) -> Result<(), Failure> {
    let root = recorder
        .candidate
        .resolve(Kind::Part, &JsString::from("temporary"))?;
    recorder.move_child(
        &CandidateOrder::new(&root, Children::Staffs),
        &JsString::from("move-staff-b"),
        Some(&JsString::from("move-staff-a")),
    )?;
    let voice = recorder
        .candidate
        .resolve(Kind::Voice, &JsString::from("move-voice-0-1"))?;
    let content = recorder.candidate.owner(&voice).unwrap();
    recorder.move_child(
        &CandidateOrder::new(&content, Children::Voices),
        &JsString::from("move-voice-0-1"),
        None,
    )?;
    Ok(())
}

#[test]
fn descendant_and_part_moves_compose_with_field_changes_removal_and_inverse_replay() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let root = recorder.insert_part(moving_part(), None).unwrap();
    let original = recorder.active[&root].bundle.clone();
    move_staff_and_voice(&mut recorder).unwrap();
    let staff_order = CandidateOrder::new(&root, Children::Staffs);
    recorder
        .move_child(
            &staff_order,
            &JsString::from("move-staff-a"),
            Some(&JsString::from("")),
        )
        .unwrap();
    assert_eq!(
        ids(&mut recorder.candidate, &staff_order),
        ["move-staff-b", "", "move-staff-a"]
    );
    let voice = recorder
        .candidate
        .resolve(Kind::Voice, &JsString::from("move-voice-0-0"))
        .unwrap();
    recorder
        .move_child(
            &CandidateOrder::new(&voice, Children::Events),
            &JsString::from("move-event-0-0-1"),
            None,
        )
        .unwrap();
    let event = recorder
        .candidate
        .resolve(Kind::Event, &JsString::from("move-event-0-0-0"))
        .unwrap();
    recorder
        .move_child(
            &CandidateOrder::new(&event, Children::Notes),
            &JsString::from("move-note-0-0-0-1"),
            None,
        )
        .unwrap();
    let part_order = CandidateOrder::new(&recorder.candidate.document.clone(), Children::Parts);
    recorder
        .move_child(
            &part_order,
            &JsString::from("temporary"),
            Some(&JsString::from("part-z")),
        )
        .unwrap();
    recorder
        .replace_scalar(&root, Value::PartName("moved Part".into()))
        .unwrap();
    recorder.remove_part(&JsString::from("temporary")).unwrap();
    assert_eq!(recorder.order_changes.len(), 1);
    assert!(recorder.order_changes.contains_key(&part_order));
    recorder.verify_recorded_order(&part_order).unwrap();
    let Operation::RemoveEntity {
        expected: StoredEntityBundle::Part(expected),
        ..
    } = &recorder.steps.last().unwrap().forward
    else {
        panic!("remove");
    };
    assert_eq!(
        expected.nodes[0].image.value,
        Some(Value::PartName("moved Part".into()))
    );
    // Rebuilding a subtree in its final traversal order can share numerically
    // identical index arrays. The child identities must still express the move.
    let root_children = |bundle: &PartBundle| {
        bundle.nodes[0]
            .orders
            .iter()
            .flat_map(|(_, indices)| indices.iter().map(|index| bundle.nodes[*index].id))
            .collect::<Vec<_>>()
    };
    assert_ne!(root_children(expected), root_children(&original));
    let staff_ids = |bundle: &PartBundle| {
        bundle.nodes[0].orders[0]
            .1
            .iter()
            .map(|index| bundle.nodes[*index].id)
            .collect::<Vec<_>>()
    };
    assert_ne!(staff_ids(expected), staff_ids(&original));
    assert!(
        Arc::ptr_eq(
            &expected.nodes[0].orders[1].1,
            &original.nodes[0].orders[1].1
        ),
        "untouched content membership is shared even though Staff order changed"
    );
    let (_, journal) = recorder.finish().unwrap();
    assert_eq!(journal.steps.len(), 9);
    for direction in [Direction::Forward, Direction::Inverse] {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        journal.replay(&mut candidate, direction).unwrap();
        assert_eq!(part_ids(&mut candidate), ["part-z"]);
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn repeated_empty_predecessors_keep_occurrence_identity_through_move_and_inverse() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut part = moving_part();
    let mut duplicate = part.staves[1].clone();
    duplicate.line_count = SafeInteger::new(6).unwrap();
    part.staves.insert(2, duplicate);
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let root = recorder.insert_part(part, None).unwrap();
    recorder
        .move_child(
            &CandidateOrder::new(&root, Children::Staffs),
            &JsString::from("move-staff-b"),
            Some(&JsString::from("move-staff-a")),
        )
        .unwrap();
    recorder.remove_part(&JsString::from("temporary")).unwrap();
    let (_, journal) = recorder.finish().unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
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
    let root = bindings
        .resolve(inserted_bundle(&journal).nodes[0].id, &candidate)
        .unwrap();
    let order = CandidateOrder::new(&root, Children::Staffs);
    let before = sources(&mut candidate, &order);
    assert_eq!(candidate.raw_id(&before[1]), Some(&JsString::from("")));
    assert_eq!(candidate.raw_id(&before[2]), Some(&JsString::from("")));
    assert_ne!(before[1], before[2]);
    journal.steps[1]
        .forward
        .apply(&mut candidate, &mut bindings)
        .unwrap();
    assert_eq!(
        sources(&mut candidate, &order),
        [
            before[0].clone(),
            before[3].clone(),
            before[1].clone(),
            before[2].clone()
        ]
    );
    journal.steps[1]
        .inverse
        .apply(&mut candidate, &mut bindings)
        .unwrap();
    assert_eq!(sources(&mut candidate, &order), before);
    journal.steps[1]
        .forward
        .apply(&mut candidate, &mut bindings)
        .unwrap();
    journal.steps[2]
        .forward
        .apply(&mut candidate, &mut bindings)
        .unwrap();
    assert_eq!(part_ids(&mut candidate), ["part-z"]);
}

#[test]
fn prefix_measure_and_staff_moves_keep_frozen_prefix_and_replay_from_a_strong_end_store() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let prepare = || {
        let mut prefix = TransactionOverlayV1::new(&store);
        prefix
            .replace_scalar(
                Scalar::PartName {
                    part_id: id("part-z"),
                },
                Value::PartName("typed prefix".into()),
            )
            .unwrap();
        prefix
    };
    let expected = prepare().finish().unwrap();
    let mut recorder = Recorder::new(Candidate::new(prepare(), document.id.clone()));
    let measures = CandidateOrder::new(&recorder.candidate.document.clone(), Children::Measures);
    let part = recorder
        .candidate
        .resolve(Kind::Part, &JsString::from("part-z"))
        .unwrap();
    recorder
        .move_child(&measures, &JsString::from("measure-a"), None)
        .unwrap();
    recorder
        .move_child(
            &CandidateOrder::new(&part, Children::Staffs),
            &JsString::from("staff-a"),
            None,
        )
        .unwrap();
    assert_eq!(
        recorder.order_changes.len(),
        2,
        "prefix changes retain expected identity order for later subtree removal"
    );
    recorder.verify_recorded_order(&measures).unwrap();
    recorder
        .verify_recorded_order(&CandidateOrder::new(&part, Children::Staffs))
        .unwrap();
    let (recorded, journal) = recorder.finish().unwrap();
    assert_eq!(recorded.prefix.finish().unwrap(), expected);
    let mut forward = Candidate::new(prepare(), document.id.clone());
    journal.replay(&mut forward, Direction::Forward).unwrap();
    assert_eq!(ids(&mut forward, &measures), ["measure-a", "measure-z"]);
    assert_eq!(
        ids(&mut forward, &CandidateOrder::new(&part, Children::Staffs)),
        ["staff-a", "staff-z"]
    );
    assert_eq!(forward.prefix.finish().unwrap(), expected);
    let mut end = document.clone();
    end.parts[0].name = "typed prefix".into();
    end.measure_definitions.reverse();
    end.parts[0].staves.reverse();
    let end_store = build_live_score_store(&end).unwrap();
    let mut inverse = Candidate::new(TransactionOverlayV1::new(&end_store), document.id.clone());
    journal.replay(&mut inverse, Direction::Inverse).unwrap();
    assert_eq!(ids(&mut inverse, &measures), ["measure-z", "measure-a"]);
    assert_eq!(
        ids(&mut inverse, &CandidateOrder::new(&part, Children::Staffs)),
        ["staff-z", "staff-a"]
    );
    assert_eq!(
        inverse.read_value(&part),
        Some(Value::PartName("typed prefix".into()))
    );
    assert_eq!(store.export_document().unwrap(), document);
    assert_eq!(end_store.export_document().unwrap(), end);
}

#[test]
fn unchanged_positions_do_not_record_or_reserve_and_move_failures_preserve_precedence() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let root = recorder.insert_part(moving_part(), None).unwrap();
    let order = CandidateOrder::new(&root, Children::Staffs);
    let steps = recorder.steps.len();
    let order_changes = recorder.order_changes.clone();
    recorder.candidate.reservation = Reservation::fail_at(1);
    assert_eq!(
        recorder.move_child(&order, &JsString::from("move-staff-a"), None),
        Ok(false)
    );
    assert_eq!(
        recorder.move_child(
            &order,
            &JsString::from("move-staff-b"),
            Some(&JsString::from(""))
        ),
        Ok(false)
    );
    assert_eq!(recorder.candidate.reservation.attempts, 0);
    assert_eq!(recorder.steps.len(), steps);
    assert_eq!(
        recorder.order_changes, order_changes,
        "a no-op retains no additional order metadata"
    );
    for (target, anchor, failure) in [
        (
            "missing",
            Some(&JsString::from("missing")),
            Failure::TargetNotFound,
        ),
        (
            "staff-z",
            Some(&JsString::from("staff-z")),
            Failure::TargetNotFound,
        ),
        (
            "move-staff-b",
            Some(&JsString::from("move-staff-b")),
            Failure::AnchorSelfReference,
        ),
        (
            "move-staff-b",
            Some(&JsString::from("absent")),
            Failure::AnchorNotFound,
        ),
        (
            "move-staff-b",
            Some(&JsString::from("staff-a")),
            Failure::AnchorWrongOwner,
        ),
    ] {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        let root = recorder.insert_part(moving_part(), None).unwrap();
        let order = CandidateOrder::new(&root, Children::Staffs);
        let before = sources(&mut recorder.candidate, &order);
        recorder.candidate.reservation = Reservation::fail_at(1);
        assert_eq!(
            recorder.move_child(&order, &JsString::from(target), anchor),
            Err(failure)
        );
        assert_eq!(recorder.candidate.reservation.attempts, 0);
        assert_eq!(sources(&mut recorder.candidate, &order), before);
        assert!(recorder.finish().is_err());
    }
}

#[test]
fn hidden_siblings_do_not_shift_recorded_moves_and_hidden_targets_remain_missing() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let part = candidate
        .resolve(Kind::Part, &JsString::from("part-z"))
        .unwrap();
    let mut extra = raw_part("template").staves.remove(0);
    extra.id = "padding-staff".into();
    let padding = candidate.insert_staff(&part, extra, None).unwrap();
    candidate.hide(&padding).unwrap();
    let mut recorder = Recorder::new(candidate);
    let order = CandidateOrder::new(&part, Children::Staffs);
    assert_eq!(
        recorder.move_child(&order, &JsString::from("staff-a"), None),
        Ok(true)
    );
    assert_eq!(ids(&mut recorder.candidate, &order), ["staff-a", "staff-z"]);
    let (_, journal) = recorder.finish().unwrap();
    let mut replay = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    journal.replay(&mut replay, Direction::Forward).unwrap();
    assert_eq!(ids(&mut replay, &order), ["staff-a", "staff-z"]);
    let mut missing = Recorder::new(replay);
    let target = missing
        .candidate
        .resolve(Kind::Staff, &JsString::from("staff-a"))
        .unwrap();
    missing.candidate.hide(&target).unwrap();
    let attempts = missing.candidate.reservation.attempts;
    assert_eq!(
        missing.move_child(
            &order,
            &JsString::from("staff-a"),
            Some(&JsString::from("staff-a"))
        ),
        Err(Failure::TargetNotFound)
    );
    assert_eq!(missing.candidate.reservation.attempts, attempts);
}

#[test]
fn malformed_stored_move_owner_kind_predecessor_and_noop_fail_before_order_writes() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let part = recorder
        .candidate
        .resolve(Kind::Part, &JsString::from("part-z"))
        .unwrap();
    recorder
        .move_child(
            &CandidateOrder::new(&part, Children::Staffs),
            &JsString::from("staff-z"),
            Some(&JsString::from("staff-a")),
        )
        .unwrap();
    let (_, journal) = recorder.finish().unwrap();
    for change in ["owner", "kind", "predecessor", "noop", "self-anchor"] {
        let mut operation = journal.steps[0].forward.clone();
        let Operation::MoveOrderedChild {
            order,
            target,
            expected_anchor,
            anchor,
        } = &mut operation
        else {
            panic!("move");
        };
        match change {
            "owner" => order.owner = *target,
            "kind" => order.children = Children::Voices,
            "predecessor" => *expected_anchor = Some(*target),
            "noop" => *expected_anchor = *anchor,
            "self-anchor" => *anchor = Some(*target),
            _ => unreachable!(),
        }
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        let mut bindings = ReplayBindings::at(
            &journal.identities,
            BoundarySide::SuffixStart,
            &mut candidate,
        )
        .unwrap();
        let attempts = candidate.reservation.attempts;
        assert_eq!(
            operation.apply(&mut candidate, &mut bindings),
            Err(Failure::InternalError)
        );
        assert_eq!(candidate.reservation.attempts, attempts);
        assert!(candidate.orders.is_empty());
    }
}

#[test]
fn moving_a_small_staff_list_does_not_visit_unrelated_events_or_rebuild_the_bundle() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut part = moving_part();
    let voice = &mut part.measure_contents[0].voices[0];
    for index in 0..1024 {
        let mut event = voice.sequence.events[0].clone();
        event.id = format!("bulk-event-{index}").into();
        event.content = RhythmicContentV1::Rest;
        voice.sequence.events.push(event);
    }
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id,
    ));
    let root = recorder.insert_part(part, None).unwrap();
    let original = recorder.active[&root].bundle.clone();
    let order_count = recorder.order_changes.len();
    let visits = recorder.candidate.work.visited_entries;
    recorder
        .move_child(
            &CandidateOrder::new(&root, Children::Staffs),
            &JsString::from("move-staff-b"),
            Some(&JsString::from("move-staff-a")),
        )
        .unwrap();
    assert!(recorder.candidate.work.visited_entries - visits <= 12);
    assert!(Arc::ptr_eq(&recorder.active[&root].bundle, &original));
    assert_eq!(recorder.order_changes.len(), order_count + 1);
}

#[test]
fn malformed_recorded_order_membership_is_rejected_before_part_removal() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for foreign in [false, true] {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        let root = recorder.insert_part(moving_part(), None).unwrap();
        let order = CandidateOrder::new(&root, Children::Staffs);
        recorder
            .move_child(
                &order,
                &JsString::from("move-staff-b"),
                Some(&JsString::from("move-staff-a")),
            )
            .unwrap();
        let mut bad = recorder.order_changes[&order].as_ref().clone();
        bad[1] = if foreign {
            recorder.active[&root].bundle.nodes[0].id
        } else {
            bad[0]
        };
        recorder.order_changes.insert(order, Arc::new(bad));
        assert_eq!(
            recorder.remove_part(&JsString::from("temporary")),
            Err(Failure::InternalError)
        );
        assert!(recorder.candidate.visible(&root));
        assert!(recorder.finish().is_err());
    }
}

#[test]
fn all_recorded_move_and_patched_removal_reservation_failures_are_terminal() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let expected = TransactionOverlayV1::new(&store).finish().unwrap();
    for prefix in [false, true] {
        let prepare = || {
            let mut recorder = Recorder::new(Candidate::new(
                TransactionOverlayV1::new(&store),
                document.id.clone(),
            ));
            if !prefix {
                recorder.insert_part(moving_part(), None).unwrap();
            }
            recorder.candidate.reservation = Reservation::default();
            recorder
        };
        let run = |recorder: &mut Recorder<'_>| -> Result<(), Failure> {
            if prefix {
                let part = recorder
                    .candidate
                    .resolve(Kind::Part, &JsString::from("part-z"))?;
                recorder.move_child(
                    &CandidateOrder::new(&part, Children::Staffs),
                    &JsString::from("staff-z"),
                    Some(&JsString::from("staff-a")),
                )?;
                Ok(())
            } else {
                move_staff_and_voice(recorder)?;
                recorder.remove_part(&JsString::from("temporary"))
            }
        };
        let mut baseline = prepare();
        run(&mut baseline).unwrap();
        for fail_at in 1..=baseline.candidate.reservation.attempts {
            let mut recorder = prepare();
            recorder.candidate.reservation = Reservation::fail_at(fail_at);
            assert_eq!(
                run(&mut recorder),
                Err(Failure::InternalError),
                "prefix={prefix}, reservation={fail_at}"
            );
            assert_eq!(recorder.candidate.reservation.attempts, fail_at);
            let identities = std::mem::take(&mut recorder.identities);
            assert!(identities.finish(&mut recorder.candidate).is_err());
            assert_eq!(recorder.candidate.prefix.finish().unwrap(), expected);
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn all_moved_subtree_replay_reservation_failures_remain_discard_only() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    recorder.insert_part(moving_part(), None).unwrap();
    move_staff_and_voice(&mut recorder).unwrap();
    recorder.remove_part(&JsString::from("temporary")).unwrap();
    let (_, journal) = recorder.finish().unwrap();
    for inverse in [false, true] {
        let direction = || {
            if inverse {
                Direction::Inverse
            } else {
                Direction::Forward
            }
        };
        let mut baseline = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        journal.replay(&mut baseline, direction()).unwrap();
        for fail_at in 1..=baseline.reservation.attempts {
            let mut candidate =
                Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
            candidate.reservation = Reservation::fail_at(fail_at);
            assert_eq!(
                journal.replay(&mut candidate, direction()),
                Err(Failure::InternalError)
            );
            assert_eq!(candidate.reservation.attempts, fail_at);
            assert!(IdentityRecorder::default().finish(&mut candidate).is_err());
            assert_eq!(
                journal.replay(&mut candidate, direction()),
                Err(Failure::InternalError)
            );
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn repeated_content_measure_ids_do_not_merge_voice_owners_or_weaken_target_ambiguity() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for case in ["valid", "wrong-owner", "duplicate-target"] {
        let mut part = moving_part();
        part.measure_contents[1].measure_id = part.measure_contents[0].measure_id.clone();
        if case == "duplicate-target" {
            part.measure_contents[1].voices[0].id = "move-voice-0-1".into();
        }
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        recorder.insert_part(part, None).unwrap();
        let voice = recorder
            .candidate
            .resolve(Kind::Voice, &JsString::from("move-voice-0-0"))
            .unwrap();
        let content = recorder.candidate.owner(&voice).unwrap();
        let order = CandidateOrder::new(&content, Children::Voices);
        let before = sources(&mut recorder.candidate, &order);
        recorder.candidate.reservation = Reservation::default();
        let target = if case == "wrong-owner" {
            "move-voice-1-0"
        } else {
            "move-voice-0-1"
        };
        let result = recorder.move_child(&order, &JsString::from(target), None);
        if case == "valid" {
            assert_eq!(result, Ok(true));
            assert_eq!(
                sources(&mut recorder.candidate, &order),
                [before[1].clone(), before[0].clone()]
            );
            recorder.remove_part(&JsString::from("temporary")).unwrap();
            let (_, journal) = recorder.finish().unwrap();
            for direction in [Direction::Forward, Direction::Inverse] {
                let mut candidate =
                    Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
                journal.replay(&mut candidate, direction).unwrap();
                assert_eq!(part_ids(&mut candidate), ["part-z"]);
            }
        } else {
            assert_eq!(
                result,
                Err(if case == "wrong-owner" {
                    Failure::TargetNotFound
                } else {
                    Failure::InternalError
                })
            );
            assert_eq!(recorder.candidate.reservation.attempts, 0);
            assert_eq!(sources(&mut recorder.candidate, &order), before);
            assert!(recorder.finish().is_err());
        }
    }
}
