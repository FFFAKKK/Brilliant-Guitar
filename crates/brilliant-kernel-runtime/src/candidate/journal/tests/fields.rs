use super::*;

fn changed(mut value: Value) -> Value {
    match &mut value {
        Value::DocumentMetadata(value) => value.title.push_str(" changed"),
        Value::MeasureDefinition { meter, .. } => meter.numerator = SafeInteger::new(8).unwrap(),
        Value::PartName(value) => value.push_str(" changed"),
        Value::PartInstrument(value) => value.name.push_str(" changed"),
        Value::StaffDefinition { line_count, .. } => *line_count = SafeInteger::new(7).unwrap(),
        Value::VoiceSequenceStart(value) => value.numerator = SafeInteger::new(1).unwrap(),
        Value::EventNoteValue(value) => value.dots = SafeInteger::new(1).unwrap(),
        Value::NoteWrittenPitch(value) => value.octave = SafeInteger::new(6).unwrap(),
    }
    value
}

fn editable_part() -> AdmissionPartV1 {
    let mut part = invalid_part();
    part.measure_contents.pop();
    let voice = &mut part.measure_contents[0].voices[0];
    voice.id = "edit-voice".into();
    let event = &mut voice.sequence.events[0];
    event.id = "edit-event".into();
    let RhythmicContentV1::Notes { notes } = &mut event.content else {
        panic!("notes");
    };
    notes[0].id = "edit-note".into();
    part
}

fn edit_fields(recorder: &mut Recorder<'_>) -> Result<(), Failure> {
    let root = recorder.candidate.resolve(Kind::Part, "temporary")?;
    let note = recorder.candidate.resolve(Kind::Note, "edit-note")?;
    let voice = recorder.candidate.resolve(Kind::Voice, "edit-voice")?;
    let event = recorder.candidate.resolve(Kind::Event, "edit-event")?;
    recorder.replace_scalar(&root, Value::PartName("edited".into()))?;
    let mut instrument = recorder.candidate.read_instrument(&root).unwrap();
    instrument.name = "Transposed".into();
    instrument.written_to_sounding.chromatic_semitones = SafeInteger::new(12).unwrap();
    recorder.replace_scalar(&root, Value::PartInstrument(instrument))?;
    let value = changed(recorder.candidate.read_value(&note).unwrap());
    recorder.replace_scalar(&note, value)?;
    recorder.replace_reference(&voice, Some("unresolved".into()))?;
    recorder.replace_reference(&event, None)?;
    Ok(())
}

#[test]
fn all_scalar_slots_and_raw_reference_forms_record_exact_nonempty_inverse_steps() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let mut values = Vec::new();
    for (kind, raw_id) in [
        (Kind::Document, "score-root"),
        (Kind::Measure, "measure-a"),
        (Kind::Part, "part-z"),
        (Kind::Staff, "staff-a"),
        (Kind::Voice, "voice-a"),
        (Kind::Event, "event-a"),
        (Kind::Note, "note-a"),
    ] {
        let source = recorder.candidate.resolve(kind, raw_id).unwrap();
        values.push((
            source.clone(),
            recorder.candidate.read_value(&source).unwrap(),
        ));
    }
    let part = recorder.candidate.resolve(Kind::Part, "part-z").unwrap();
    values.push((
        part.clone(),
        Value::PartInstrument(recorder.candidate.read_instrument(&part).unwrap()),
    ));
    for (source, original) in &values {
        let attempts = recorder.candidate.reservation.attempts;
        assert_eq!(recorder.replace_scalar(source, original.clone()), Ok(false));
        assert_eq!(recorder.candidate.reservation.attempts, attempts);
        let next = changed(original.clone());
        assert_eq!(recorder.replace_scalar(source, next.clone()), Ok(true));
        let attempts = recorder.candidate.reservation.attempts;
        assert_eq!(recorder.replace_scalar(source, next), Ok(false));
        assert_eq!(recorder.candidate.reservation.attempts, attempts);
        assert_eq!(recorder.replace_scalar(source, original.clone()), Ok(true));
    }
    for (kind, raw_id) in [(Kind::Voice, "voice-a"), (Kind::Event, "event-a")] {
        let source = recorder.candidate.resolve(kind, raw_id).unwrap();
        let original = recorder.candidate.read_staff_reference(&source).unwrap();
        let middle = if kind == Kind::Voice {
            Some(String::new())
        } else {
            None
        };
        assert_eq!(
            recorder.replace_reference(&source, middle.clone()),
            Ok(true)
        );
        let attempts = recorder.candidate.reservation.attempts;
        assert_eq!(recorder.replace_reference(&source, middle), Ok(false));
        assert_eq!(recorder.candidate.reservation.attempts, attempts);
        assert_eq!(
            recorder.replace_reference(&source, Some("unknown".into())),
            Ok(true)
        );
        assert_eq!(recorder.replace_reference(&source, original), Ok(true));
    }
    assert_eq!(recorder.steps.len(), 22);
    assert_eq!(recorder.candidate.work, Work::default());
    assert!(recorder.candidate.nodes.is_empty() && recorder.candidate.orders.is_empty());
    let (_, journal) = recorder.finish().unwrap();
    for inverse in [false, true] {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        let side = if inverse {
            BoundarySide::SuffixEnd
        } else {
            BoundarySide::SuffixStart
        };
        let mut bindings = ReplayBindings::at(&journal.identities, side, &mut candidate).unwrap();
        let operations: Vec<_> = if inverse {
            journal
                .steps
                .iter()
                .rev()
                .map(|step| &step.inverse)
                .collect()
        } else {
            journal.steps.iter().map(|step| &step.forward).collect()
        };
        for operation in operations {
            operation.apply(&mut candidate, &mut bindings).unwrap();
            match operation {
                Operation::ReplaceScalar { target, value, .. } => {
                    let source = bindings.resolve(*target, &candidate).unwrap();
                    let actual = if matches!(value.as_ref(), Value::PartInstrument(_)) {
                        Value::PartInstrument(candidate.read_instrument(&source).unwrap())
                    } else {
                        candidate.read_value(&source).unwrap()
                    };
                    assert_eq!(&actual, value.as_ref());
                }
                Operation::UpdateReference { target, value, .. } => {
                    let source = bindings.resolve(*target, &candidate).unwrap();
                    assert_eq!(
                        candidate.read_staff_reference(&source).unwrap().as_deref(),
                        value.as_deref()
                    );
                }
                _ => panic!("field operation"),
            }
        }
        for (source, original) in &values {
            let actual = if matches!(original, Value::PartInstrument(_)) {
                Value::PartInstrument(candidate.read_instrument(source).unwrap())
            } else {
                candidate.read_value(source).unwrap()
            };
            assert_eq!(actual, *original);
        }
        let event = candidate.resolve(Kind::Event, "event-a").unwrap();
        assert_eq!(
            candidate.read_staff_reference(&event),
            Some(Some("staff-a".into()))
        );
        assert_eq!(candidate.work.visited_entries, 0);
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn modified_transient_part_removal_retains_original_insert_and_updated_remove_payloads() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let old_part = recorder.candidate.resolve(Kind::Part, "part-z").unwrap();
    recorder
        .replace_scalar(&old_part, Value::PartName("journal prefix".into()))
        .unwrap();
    let root = recorder.insert_part(editable_part(), None).unwrap();
    let original = recorder.active[&root].bundle.clone();
    let sources = recorder.active[&root].sources.clone();
    let work = recorder.candidate.work;
    edit_fields(&mut recorder).unwrap();
    assert_eq!(
        recorder.candidate.work, work,
        "field edits must not traverse the Part or sibling orders"
    );
    assert_eq!(
        original.nodes[0].image.value,
        Some(Value::PartName("Raw part".into()))
    );
    recorder.remove_part("temporary").unwrap();
    let Operation::RemoveEntity { expected, .. } = &recorder.steps.last().unwrap().forward else {
        panic!("remove");
    };
    assert_eq!(
        expected.nodes[0].image.value,
        Some(Value::PartName("edited".into()))
    );
    assert_eq!(
        expected.nodes[0].image.instrument.as_ref().unwrap().name,
        "Transposed"
    );
    for (index, (before, after)) in original.nodes.iter().zip(&expected.nodes).enumerate() {
        assert!(Arc::ptr_eq(&before.orders, &after.orders));
        let changed = index == 0
            || matches!(
                before.image.raw_id.as_ref(),
                "edit-note" | "edit-voice" | "edit-event"
            );
        assert_eq!(!Arc::ptr_eq(&before.image, &after.image), changed);
        assert!(
            !recorder.changes.contains_key(&sources[index]),
            "removed node patch bookkeeping is no longer needed"
        );
    }
    assert_eq!(recorder.steps.len(), 8);
    let (_, journal) = recorder.finish().unwrap();
    let mut forward = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    journal.replay(&mut forward, Direction::Forward).unwrap();
    assert_eq!(part_ids(&mut forward), ["part-z"]);
    assert_eq!(
        forward.read_value(&old_part),
        Some(Value::PartName("journal prefix".into()))
    );
    let mut end = document.clone();
    end.parts[0].name = "journal prefix".into();
    let end_store = build_live_score_store(&end).unwrap();
    let mut inverse = Candidate::new(TransactionOverlayV1::new(&end_store), document.id.clone());
    journal.replay(&mut inverse, Direction::Inverse).unwrap();
    assert_eq!(part_ids(&mut inverse), ["part-z"]);
    assert_eq!(
        inverse.read_value(&old_part),
        Some(Value::PartName(document.parts[0].name.clone()))
    );
    assert_eq!(store.export_document().unwrap(), document);
    assert_eq!(end_store.export_document().unwrap(), end);
}

#[test]
fn wrong_field_shapes_required_reference_absence_and_hidden_targets_fail_before_reservation() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for case in ["wrong-scalar", "wrong-reference", "voice-none", "hidden"] {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        let part = candidate.resolve(Kind::Part, "part-z").unwrap();
        let voice = candidate.resolve(Kind::Voice, "voice-a").unwrap();
        if case == "hidden" {
            candidate.hide(&part).unwrap();
        }
        let mut recorder = Recorder::new(candidate);
        recorder.candidate.reservation = Reservation::fail_at(1);
        let result = match case {
            "wrong-scalar" => recorder.replace_scalar(&voice, Value::PartName("wrong".into())),
            "wrong-reference" => recorder.replace_reference(&part, Some("wrong".into())),
            "voice-none" => recorder.replace_reference(&voice, None),
            "hidden" => recorder.replace_scalar(&part, Value::PartName("hidden".into())),
            _ => unreachable!(),
        };
        assert_eq!(
            result,
            Err(if case == "hidden" {
                Failure::TargetNotFound
            } else {
                Failure::InternalError
            })
        );
        assert_eq!(recorder.candidate.reservation.attempts, 0);
        assert!(recorder.steps.is_empty() && recorder.changes.is_empty());
        assert!(recorder.finish().is_err());
    }
}

#[test]
fn stale_or_noop_stored_field_operations_fail_before_writing() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let part = recorder.candidate.resolve(Kind::Part, "part-z").unwrap();
    let voice = recorder.candidate.resolve(Kind::Voice, "voice-a").unwrap();
    recorder
        .replace_scalar(&part, Value::PartName("next".into()))
        .unwrap();
    recorder
        .replace_reference(&voice, Some("staff-z".into()))
        .unwrap();
    let (_, journal) = recorder.finish().unwrap();
    for scalar in [false, true] {
        for noop in [false, true] {
            let mut operation = journal.steps[if scalar { 0 } else { 1 }].forward.clone();
            match &mut operation {
                Operation::ReplaceScalar {
                    expected, value, ..
                } => {
                    *expected = if noop {
                        value.clone()
                    } else {
                        Arc::new(Value::PartName("stale".into()))
                    }
                }
                Operation::UpdateReference {
                    expected, value, ..
                } => *expected = if noop { value.clone() } else { None },
                _ => unreachable!(),
            }
            let mut candidate =
                Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
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
            assert!(candidate.values.is_empty() && candidate.staff_references.is_empty());
        }
    }
}

#[test]
fn a_local_field_journal_does_not_rebuild_or_scan_a_large_active_part() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut part = editable_part();
    for index in 0..4096 {
        let mut staff = part.staves[0].clone();
        staff.id = format!("staff-{index}");
        part.staves.push(staff);
    }
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id,
    ));
    let root = recorder.insert_part(part, None).unwrap();
    let original_bundle = recorder.active[&root].bundle.clone();
    let staff = recorder
        .candidate
        .resolve(Kind::Staff, "staff-4095")
        .unwrap();
    let before = recorder.candidate.work;
    let value = changed(recorder.candidate.read_value(&staff).unwrap());
    recorder.replace_scalar(&staff, value).unwrap();
    assert_eq!(recorder.candidate.work, before);
    assert!(Arc::ptr_eq(
        &recorder.active[&root].bundle,
        &original_bundle
    ));
    assert_eq!(recorder.changes.len(), 1);
    assert_eq!(recorder.steps.len(), 2);
}

#[test]
fn field_recording_and_patched_remove_reservations_fail_terminally_without_touching_store() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let expected = TransactionOverlayV1::new(&store).finish().unwrap();
    let prepare = || {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        recorder.insert_part(editable_part(), None).unwrap();
        recorder.candidate.reservation = Reservation::default();
        recorder
    };
    let run = |recorder: &mut Recorder<'_>| -> Result<(), Failure> {
        edit_fields(recorder)?;
        recorder.remove_part("temporary")
    };
    let mut baseline = prepare();
    run(&mut baseline).unwrap();
    for fail_at in 1..=baseline.candidate.reservation.attempts {
        let mut recorder = prepare();
        recorder.candidate.reservation = Reservation::fail_at(fail_at);
        assert_eq!(
            run(&mut recorder),
            Err(Failure::InternalError),
            "reservation {fail_at}"
        );
        assert_eq!(recorder.candidate.reservation.attempts, fail_at);
        let identities = std::mem::take(&mut recorder.identities);
        assert!(identities.finish(&mut recorder.candidate).is_err());
        assert_eq!(recorder.candidate.prefix.finish().unwrap(), expected);
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn every_edited_subtree_replay_reservation_failure_is_terminal_in_both_directions() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    recorder.insert_part(editable_part(), None).unwrap();
    edit_fields(&mut recorder).unwrap();
    recorder.remove_part("temporary").unwrap();
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
            assert_eq!(candidate.reservation.attempts, fail_at);
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn prefix_field_reservation_failures_never_publish_partial_journal_steps_or_modify_live_stores() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mutate = |recorder: &mut Recorder<'_>| -> Result<(), Failure> {
        let part = recorder.candidate.resolve(Kind::Part, "part-z")?;
        let voice = recorder.candidate.resolve(Kind::Voice, "voice-a")?;
        recorder.replace_scalar(&part, Value::PartName("changed".into()))?;
        let mut instrument = recorder.candidate.read_instrument(&part).unwrap();
        instrument.name = "changed".into();
        recorder.replace_scalar(&part, Value::PartInstrument(instrument))?;
        recorder.replace_reference(&voice, Some("staff-z".into()))?;
        Ok(())
    };
    let mut baseline = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    mutate(&mut baseline).unwrap();
    assert_eq!(baseline.candidate.reservation.sites & 0x700, 0x700);
    for fail_at in 1..=baseline.candidate.reservation.attempts {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        recorder.candidate.reservation = Reservation::fail_at(fail_at);
        assert_eq!(mutate(&mut recorder), Err(Failure::InternalError));
        assert_eq!(recorder.candidate.reservation.attempts, fail_at);
        // A fully logged earlier operation may exist; the failing operation
        // cannot append a step. A terminal candidate cannot seal either case.
        let completed = usize::from(!recorder.candidate.values.is_empty())
            + usize::from(!recorder.candidate.instruments.is_empty())
            + usize::from(!recorder.candidate.staff_references.is_empty());
        assert_eq!(recorder.steps.len(), completed);
        assert!(recorder.finish().is_err());
    }
    let (_, journal) = baseline.finish().unwrap();
    let mut end = document.clone();
    end.parts[0].name = "changed".into();
    end.parts[0].instrument.name = "changed".into();
    end.parts[0].measure_contents[0].voices[0].default_staff_id = id("staff-z");
    let end_store = build_live_score_store(&end).unwrap();
    for inverse in [false, true] {
        let base = if inverse { &end_store } else { &store };
        let direction = || {
            if inverse {
                Direction::Inverse
            } else {
                Direction::Forward
            }
        };
        let mut baseline = Candidate::new(TransactionOverlayV1::new(base), document.id.clone());
        journal.replay(&mut baseline, direction()).unwrap();
        for fail_at in 1..=baseline.reservation.attempts {
            let mut candidate =
                Candidate::new(TransactionOverlayV1::new(base), document.id.clone());
            candidate.reservation = Reservation::fail_at(fail_at);
            assert_eq!(
                journal.replay(&mut candidate, direction()),
                Err(Failure::InternalError)
            );
            assert_eq!(candidate.reservation.attempts, fail_at);
            assert!(IdentityRecorder::default().finish(&mut candidate).is_err());
            assert_eq!(
                candidate.replace_value(
                    &Occurrence::prefix(Entity::Part {
                        part_id: id("part-z")
                    }),
                    Value::PartName("cannot resume".into())
                ),
                Err(Failure::InternalError)
            );
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
    assert_eq!(end_store.export_document().unwrap(), end);
}
