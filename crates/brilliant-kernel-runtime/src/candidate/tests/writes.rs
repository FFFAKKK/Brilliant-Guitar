use super::*;

fn changed_value(mut value: Value) -> Value {
    match &mut value {
        Value::DocumentMetadata(metadata) => metadata.title.push_str(" candidate"),
        Value::MeasureDefinition { meter, .. } => meter.numerator = SafeInteger::new(3).unwrap(),
        Value::PartName(name) => name.push_str(" candidate"),
        Value::StaffDefinition { line_count, .. } => *line_count = SafeInteger::new(4).unwrap(),
        Value::VoiceSequenceStart(start) => start.numerator = SafeInteger::new(1).unwrap(),
        Value::EventNoteValue(duration) => duration.dots = SafeInteger::new(2).unwrap(),
        Value::NoteWrittenPitch(pitch) => pitch.octave = SafeInteger::new(7).unwrap(),
        Value::PartInstrument(_) => panic!("instrument has a separate field"),
    }
    value
}

#[test]
fn scalar_writes_cover_all_fields_without_mutating_or_charging_the_frozen_prefix() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let prepare = || {
        let mut prefix = TransactionOverlayV1::new(&store);
        let segment = prefix.begin_segment();
        prefix
            .replace_scalar(
                Scalar::PartName {
                    part_id: id("part-z"),
                },
                Value::PartName("prefix".into()),
            )
            .unwrap();
        prefix.add_prepared_effects(1).unwrap();
        prefix.end_segment(segment).unwrap();
        prefix
    };
    let expected = prepare().finish().unwrap();
    let mut candidate = Candidate::new(prepare(), document.id.clone());
    let mut changes = 0;
    for (kind, raw_id) in [
        (Kind::Document, document.id.as_str()),
        (Kind::Measure, "measure-a"),
        (Kind::Part, "part-z"),
        (Kind::Staff, "staff-a"),
        (Kind::Voice, "voice-a"),
        (Kind::Event, "event-a"),
        (Kind::Note, "note-a"),
    ] {
        let occurrence = candidate.resolve(kind, raw_id).unwrap();
        let original = candidate.read_value(&occurrence).unwrap();
        let value = changed_value(original.clone());
        let before = candidate.reservation.attempts;
        assert_eq!(
            candidate.replace_value(&occurrence, original.clone()),
            Ok(false)
        );
        assert_eq!(candidate.reservation.attempts, before);
        assert_eq!(
            candidate.replace_value(&occurrence, value.clone()),
            Ok(true)
        );
        assert_eq!(candidate.read_value(&occurrence), Some(value.clone()));
        assert_eq!(candidate.replace_value(&occurrence, value), Ok(false));
        assert_eq!(
            candidate.replace_value(&occurrence, original.clone()),
            Ok(true)
        );
        changes += 2;
        assert_eq!(candidate.read_value(&occurrence), Some(original));
        assert_eq!(
            candidate.reservation.attempts,
            before + 1,
            "replacement must reuse its map entry"
        );
    }
    let part = candidate.resolve(Kind::Part, "part-z").unwrap();
    let original = candidate.read_instrument(&part).unwrap();
    let mut instrument = original.clone();
    instrument.written_to_sounding.chromatic_semitones = SafeInteger::new(-12).unwrap();
    assert_eq!(
        candidate.replace_instrument(&part, instrument.clone()),
        Ok(true)
    );
    assert_eq!(candidate.read_instrument(&part), Some(instrument.clone()));
    let attempts = candidate.reservation.attempts;
    assert_eq!(candidate.replace_instrument(&part, instrument), Ok(false));
    assert_eq!(candidate.replace_instrument(&part, original), Ok(true));
    assert_eq!(candidate.reservation.attempts, attempts);
    assert_eq!(
        changes, 14,
        "a net-zero batch still contains individual field changes"
    );
    assert_eq!(candidate.work, Work::default());
    assert!(candidate.orders.is_empty());
    assert!(candidate.nodes.is_empty());
    assert!(candidate.id_pool.is_empty());
    assert_eq!(candidate.prefix.finish().unwrap(), expected);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn added_scalar_changes_are_occurrence_local_and_hidden_prefix_replacements_do_not_leak() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let old_part = candidate.resolve(Kind::Part, "part-z").unwrap();
    let old_note = candidate.resolve(Kind::Note, "note-a").unwrap();
    let changed = changed_value(candidate.read_value(&old_note).unwrap());
    candidate.replace_value(&old_note, changed.clone()).unwrap();
    candidate.hide(&old_part).unwrap();
    let mut payload = raw_part("part-z");
    payload.staves.push(payload.staves[0].clone());
    let added = candidate.insert_part(payload, None).unwrap();
    let staffs = ordered(&mut candidate, &added, Children::Staffs);
    assert_eq!(candidate.raw_id(&staffs[0]), candidate.raw_id(&staffs[2]));
    let duplicate_original = candidate.read_value(&staffs[2]).unwrap();
    for (kind, raw_id) in [
        (Kind::Part, "part-z"),
        (Kind::Voice, "voice-a"),
        (Kind::Event, "event-a"),
        (Kind::Note, "note-a"),
    ] {
        let node = candidate.resolve(kind, raw_id).unwrap();
        let value = changed_value(candidate.read_value(&node).unwrap());
        assert_eq!(candidate.replace_value(&node, value.clone()), Ok(true));
        assert_eq!(candidate.read_value(&node), Some(value));
    }
    let staff_value = changed_value(candidate.read_value(&staffs[0]).unwrap());
    assert_eq!(
        candidate.replace_value(&staffs[0], staff_value.clone()),
        Ok(true)
    );
    assert_eq!(candidate.read_value(&staffs[0]), Some(staff_value));
    assert_eq!(candidate.read_value(&staffs[2]), Some(duplicate_original));
    let mut instrument = candidate.read_instrument(&added).unwrap();
    instrument.name.push_str(" new");
    assert_eq!(
        candidate.replace_instrument(&added, instrument.clone()),
        Ok(true)
    );
    assert_eq!(candidate.read_instrument(&added), Some(instrument));
    assert_eq!(
        candidate.values.len(),
        1,
        "added values live in their own nodes"
    );
    assert!(candidate.instruments.is_empty());
    assert_eq!(candidate.read_value(&old_note), None);
    assert_eq!(
        candidate.replace_value(&old_note, changed),
        Err(Failure::TargetNotFound)
    );
}

#[test]
fn reference_replacements_remove_stale_edges_and_find_new_empty_or_unknown_edges() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let voice = candidate.resolve(Kind::Voice, "voice-a").unwrap();
    let event = candidate.resolve(Kind::Event, "event-a").unwrap();
    let part = candidate.resolve(Kind::Part, "part-z").unwrap();
    assert!(candidate.staff_referrers("staff-a").contains(&voice));
    assert!(candidate.staff_referrers("staff-a").contains(&event));
    for value in ["", "future-staff", "foreign-staff", "staff-a"] {
        assert_eq!(
            candidate.replace_staff_reference(&voice, Some(value.into())),
            Ok(true)
        );
        assert_eq!(
            candidate.read_staff_reference(&voice),
            Some(Some(value.into()))
        );
        assert_eq!(
            candidate
                .staff_referrers(value)
                .iter()
                .filter(|source| *source == &voice)
                .count(),
            1
        );
        if value != "staff-a" {
            assert!(!candidate.staff_referrers("staff-a").contains(&voice));
        }
    }
    for stale in ["", "future-staff", "foreign-staff"] {
        assert!(candidate.staff_referrers(stale).is_empty());
    }
    assert_eq!(candidate.replace_staff_reference(&event, None), Ok(true));
    assert_eq!(candidate.read_staff_reference(&event), Some(None));
    assert!(!candidate.staff_referrers("staff-a").contains(&event));
    assert_eq!(
        candidate.replace_staff_reference(&event, Some("".into())),
        Ok(true)
    );
    assert_eq!(candidate.staff_referrers(""), std::slice::from_ref(&event));
    let attempts = candidate.reservation.attempts;
    assert_eq!(
        candidate.replace_staff_reference(&event, Some("".into())),
        Ok(false)
    );
    assert_eq!(candidate.reservation.attempts, attempts);
    candidate.hide(&event).unwrap();
    assert!(candidate.staff_referrers("").is_empty());
    assert_eq!(candidate.read_staff_reference(&event), None);
    assert_eq!(
        candidate.replace_staff_reference(&event, None),
        Err(Failure::TargetNotFound)
    );
    candidate.hide(&part).unwrap();
    assert!(candidate.staff_referrers("staff-a").is_empty());
}

#[test]
fn scoped_referrers_distinguish_part_occurrences_and_same_id_rebuilds() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let part = candidate.resolve(Kind::Part, "part-z").unwrap();
    let old_voice = candidate.resolve(Kind::Voice, "voice-a").unwrap();
    candidate
        .replace_staff_reference(&old_voice, Some("future-staff".into()))
        .unwrap();
    let foreign = candidate.insert_part(raw_part("part-z"), None).unwrap();
    let contents = ordered(&mut candidate, &foreign, Children::Contents);
    let voice = ordered(&mut candidate, &contents[0], Children::Voices)[0].clone();
    let event = ordered(&mut candidate, &voice, Children::Events)[0].clone();
    candidate
        .replace_staff_reference(&voice, Some("future-staff".into()))
        .unwrap();
    candidate
        .replace_staff_reference(&event, Some("future-staff".into()))
        .unwrap();
    assert_eq!(
        candidate
            .staff_referrers_in_part(&part, "future-staff")
            .unwrap(),
        std::slice::from_ref(&old_voice)
    );
    assert_eq!(
        candidate
            .staff_referrers_in_part(&foreign, "future-staff")
            .unwrap(),
        [voice.clone(), event.clone()]
    );
    candidate
        .replace_staff_reference(&old_voice, Some("staff-a".into()))
        .unwrap();
    assert!(
        candidate
            .staff_referrers_in_part(&part, "future-staff")
            .unwrap()
            .is_empty(),
        "foreign references do not block removal in this Part"
    );
    candidate.hide(&part).unwrap();
    assert_eq!(candidate.read_staff_reference(&old_voice), None);
    assert_eq!(candidate.resolve(Kind::Voice, "voice-a"), Ok(voice.clone()));
    assert_eq!(
        candidate.read_staff_reference(&voice),
        Some(Some("future-staff".into()))
    );
    candidate.replace_staff_reference(&event, None).unwrap();
    assert_eq!(
        candidate
            .staff_referrers_in_part(&foreign, "future-staff")
            .unwrap(),
        [voice]
    );
    candidate.hide(&foreign).unwrap();
    let rebuilt = candidate.insert_part(raw_part("part-z"), None).unwrap();
    let rebuilt_voice = candidate.resolve(Kind::Voice, "voice-a").unwrap();
    assert_eq!(
        candidate.read_staff_reference(&rebuilt_voice),
        Some(Some("staff-a".into()))
    );
    assert!(
        candidate
            .staff_referrers_in_part(&rebuilt, "future-staff")
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        candidate.staff_referrers_in_part(&foreign, "staff-a"),
        Err(Failure::TargetNotFound)
    );
}

#[test]
fn invalid_field_kind_and_required_reference_fail_before_reservation_or_mutation() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let part = candidate.resolve(Kind::Part, "part-z").unwrap();
    let voice = candidate.resolve(Kind::Voice, "voice-a").unwrap();
    let note = candidate.resolve(Kind::Note, "note-a").unwrap();
    let instrument = candidate.read_instrument(&part).unwrap();
    let original = candidate.read_value(&note);
    assert_eq!(
        candidate.replace_value(&note, Value::PartName("wrong".into())),
        Err(Failure::InternalError)
    );
    assert_eq!(
        candidate.replace_value(&part, Value::PartInstrument(instrument.clone())),
        Err(Failure::InternalError)
    );
    assert_eq!(
        candidate.replace_instrument(&note, instrument),
        Err(Failure::InternalError)
    );
    assert_eq!(
        candidate.replace_staff_reference(&voice, None),
        Err(Failure::InternalError)
    );
    assert_eq!(
        candidate.replace_staff_reference(&part, Some("".into())),
        Err(Failure::InternalError)
    );
    assert_eq!(
        candidate.staff_referrers_in_part(&voice, "staff-a"),
        Err(Failure::InternalError)
    );
    assert_eq!(candidate.reservation.attempts, 0);
    assert_eq!(candidate.read_value(&note), original);
    assert!(
        candidate.values.is_empty()
            && candidate.instruments.is_empty()
            && candidate.staff_references.is_empty()
    );
}

#[test]
fn replacement_reservation_failure_is_terminal_with_unchanged_current_field_and_prefix() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let prepare = || {
        let mut prefix = TransactionOverlayV1::new(&store);
        prefix
            .replace_scalar(
                Scalar::PartName {
                    part_id: id("part-z"),
                },
                Value::PartName("prefix".into()),
            )
            .unwrap();
        prefix
    };
    let expected = prepare().finish().unwrap();
    let run = |candidate: &mut Candidate<'_>, step| match step {
        0 => {
            let part = candidate.resolve(Kind::Part, "part-z").unwrap();
            candidate.replace_value(&part, Value::PartName("candidate".into()))
        }
        1 => {
            let part = candidate.resolve(Kind::Part, "part-z").unwrap();
            let mut instrument = candidate.read_instrument(&part).unwrap();
            instrument.name.push_str(" candidate");
            candidate.replace_instrument(&part, instrument)
        }
        _ => {
            let voice = candidate.resolve(Kind::Voice, "voice-a").unwrap();
            candidate.replace_staff_reference(&voice, Some("future-staff".into()))
        }
    };
    let mut baseline = Candidate::new(prepare(), document.id.clone());
    for step in 0..3 {
        assert_eq!(run(&mut baseline, step), Ok(true));
    }
    assert_eq!(
        baseline.reservation.sites & 0x700,
        0x700,
        "all three replacement maps are covered"
    );
    let attempts = baseline.reservation.attempts;
    assert_eq!(attempts, 4, "three maps and one new shared reference ID");
    for fail_at in 1..=attempts {
        let mut candidate = Candidate::new(prepare(), document.id.clone());
        candidate.reservation = Reservation::fail_at(fail_at);
        let mut failed = false;
        for step in 0..3 {
            let part = candidate.resolve(Kind::Part, "part-z").unwrap();
            let voice = candidate.resolve(Kind::Voice, "voice-a").unwrap();
            let before = (
                candidate.read_value(&part),
                candidate.read_instrument(&part),
                candidate.read_staff_reference(&voice),
            );
            if run(&mut candidate, step).is_err() {
                assert_eq!(
                    (
                        candidate.read_value(&part),
                        candidate.read_instrument(&part),
                        candidate.read_staff_reference(&voice)
                    ),
                    before
                );
                failed = true;
                break;
            }
        }
        assert!(failed, "reservation {fail_at}");
        for step in 0..3 {
            assert_eq!(run(&mut candidate, step), Err(Failure::InternalError));
        }
        assert_eq!(candidate.reservation.attempts, fail_at);
        assert_eq!(candidate.prefix.finish().unwrap(), expected);
        assert_eq!(store.export_document().unwrap(), document);
    }
}
