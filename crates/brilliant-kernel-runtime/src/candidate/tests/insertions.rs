use super::*;
use brilliant_core_types::JsString;

fn staff(raw_id: &str) -> AdmissionStaffDefinitionV1 {
    let mut value = raw_part("template").staves.remove(0);
    value.id = raw_id.into();
    value
}

fn voice(raw_id: &str) -> AdmissionVoiceV1 {
    let mut value = raw_part("template")
        .measure_contents
        .remove(0)
        .voices
        .remove(0);
    value.id = raw_id.into();
    value
}

fn event(raw_id: &str) -> RhythmicEventV1<JsString> {
    let mut value = voice("template").sequence.events.remove(0);
    value.id = raw_id.into();
    value
}

#[test]
fn child_insertion_uses_prefix_orders_and_retains_raw_payload_occurrences() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let expected = TransactionOverlayV1::new(&store).finish().unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let part = candidate
        .resolve(Kind::Part, &JsString::from("part-z"))
        .unwrap();
    let empty_staff = candidate
        .insert_staff(&part, staff(""), Some(&JsString::from("staff-z")))
        .unwrap();
    let duplicate = candidate
        .insert_staff(&part, staff("staff-a"), Some(&JsString::from("staff-a")))
        .unwrap();
    assert_eq!(
        order_ids(
            &mut candidate,
            &CandidateOrder::new(&part, Children::Staffs)
        ),
        ["staff-z", "", "staff-a", "staff-a"]
    );
    assert_eq!(candidate.owner(&empty_staff), Some(part.clone()));
    assert_eq!(
        candidate.resolve(Kind::Staff, &JsString::from("staff-a")),
        Err(Failure::InternalError)
    );
    candidate.hide(&empty_staff).unwrap();
    candidate.hide(&duplicate).unwrap();
    assert!(matches!(
        candidate.resolve(Kind::Staff, &JsString::from("staff-a")),
        Ok(Occurrence::Prefix(_))
    ));
    let contents = ordered(&mut candidate, &part, Children::Contents);
    let mut payload = voice("new-voice");
    payload.default_staff_id = JsString::from("");
    payload.sequence.events[0].id = JsString::from("");
    let RhythmicContentV1::Notes { notes } = &mut payload.sequence.events[0].content else {
        panic!("notes");
    };
    notes[0].id = JsString::from("");
    let added_voice = candidate
        .insert_voice(
            &part,
            &contents[0],
            payload,
            Some(&JsString::from("voice-a")),
        )
        .unwrap();
    assert_eq!(candidate.owner(&added_voice), Some(contents[0].clone()));
    assert_eq!(
        candidate.read_staff_reference(&added_voice),
        Some(Some("".into()))
    );
    let first = ordered(&mut candidate, &added_voice, Children::Events)[0].clone();
    let note = ordered(&mut candidate, &first, Children::Notes)[0].clone();
    assert_eq!(candidate.raw_id(&first), Some(&JsString::from("")));
    assert_eq!(candidate.raw_id(&note), Some(&JsString::from("")));
    assert_ne!(first, note);
    let mut rest = event("");
    rest.content = RhythmicContentV1::Rest;
    rest.staff_id = Some("foreign-staff".into());
    let added_event = candidate
        .insert_event(&added_voice, rest, Some(&JsString::from("")))
        .unwrap();
    assert_eq!(
        candidate.read_content_kind(&added_event),
        Some(EventContentKind::Rest)
    );
    assert_eq!(
        candidate.read_staff_reference(&added_event),
        Some(Some("foreign-staff".into()))
    );
    assert!(ordered(&mut candidate, &added_event, Children::Notes).is_empty());
    assert_eq!(
        ordered(&mut candidate, &added_voice, Children::Events),
        [first, added_event]
    );
    assert_eq!(
        candidate.resolve(Kind::Event, &JsString::from("")),
        Err(Failure::InternalError)
    );
    assert_eq!(
        candidate.work.prefix_order_copies, 2,
        "Staff and Voice prefix orders only"
    );
    assert_eq!(candidate.prefix.finish().unwrap(), expected);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn added_repeated_contents_keep_insertion_ownership_and_only_the_target_order_changes() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let original_part = candidate
        .resolve(Kind::Part, &JsString::from("part-z"))
        .unwrap();
    let mut payload = raw_part("part-z");
    payload
        .measure_contents
        .push(payload.measure_contents[0].clone());
    let part = candidate.insert_part(payload, None).unwrap();
    let contents = ordered(&mut candidate, &part, Children::Contents);
    let untouched = ordered(&mut candidate, &contents[0], Children::Voices);
    let attempts = candidate.reservation.attempts;
    assert_eq!(
        candidate.insert_voice(&original_part, &contents[2], voice("new-voice"), None),
        Err(Failure::InternalError)
    );
    assert_eq!(candidate.reservation.attempts, attempts);
    let inserted_voice = candidate
        .insert_voice(&part, &contents[2], voice("new-voice"), None)
        .unwrap();
    assert_eq!(
        ordered(&mut candidate, &contents[0], Children::Voices),
        untouched
    );
    assert_eq!(candidate.owner(&inserted_voice), Some(contents[2].clone()));
    let staff = candidate
        .insert_staff(&part, staff("added-staff"), None)
        .unwrap();
    assert_eq!(candidate.owner(&staff), Some(part.clone()));
    let event = candidate
        .insert_event(&inserted_voice, event("added-event"), None)
        .unwrap();
    assert_eq!(candidate.owner(&event), Some(inserted_voice.clone()));
    assert_eq!(
        candidate.read_content_kind(&event),
        Some(EventContentKind::Notes)
    );
    assert_eq!(
        candidate.work.prefix_order_copies, 1,
        "only the document Part order was copied"
    );
    candidate.hide(&part).unwrap();
    for occurrence in [&staff, &inserted_voice, &event] {
        assert!(!candidate.visible(occurrence));
    }
    assert_eq!(
        candidate.resolve(Kind::Event, &JsString::from("added-event")),
        Err(Failure::TargetNotFound)
    );
}

#[test]
fn child_anchor_failures_precede_payload_writes_and_hidden_siblings_do_not_shift_positions() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let part = candidate
        .resolve(Kind::Part, &JsString::from("part-z"))
        .unwrap();
    let contents = ordered(&mut candidate, &part, Children::Contents);
    let target_voice = candidate
        .resolve(Kind::Voice, &JsString::from("voice-a"))
        .unwrap();
    for anchor in ["", "missing"] {
        assert_eq!(
            candidate.insert_staff(&part, staff("new-staff"), Some(&JsString::from(anchor))),
            Err(Failure::AnchorNotFound)
        );
        assert_eq!(
            candidate.insert_voice(
                &part,
                &contents[0],
                voice("new-voice"),
                Some(&JsString::from(anchor))
            ),
            Err(Failure::AnchorNotFound)
        );
        assert_eq!(
            candidate.insert_event(
                &target_voice,
                event("new-event"),
                Some(&JsString::from(anchor))
            ),
            Err(Failure::AnchorNotFound)
        );
    }
    assert_eq!(
        candidate.insert_voice(
            &part,
            &contents[0],
            voice("new-voice"),
            Some(&JsString::from("voice-z"))
        ),
        Err(Failure::AnchorWrongOwner)
    );
    assert_eq!(
        candidate.insert_event(
            &target_voice,
            event("new-event"),
            Some(&JsString::from("event-z"))
        ),
        Err(Failure::AnchorWrongOwner)
    );
    assert_eq!(candidate.reservation.attempts, 0);
    assert!(candidate.nodes.is_empty() && candidate.orders.is_empty());
    let original = candidate
        .resolve(Kind::Event, &JsString::from("event-a"))
        .unwrap();
    let first = candidate
        .insert_event(
            &target_voice,
            event("first"),
            Some(&JsString::from("event-a")),
        )
        .unwrap();
    candidate.hide(&original).unwrap();
    let second = candidate
        .insert_event(&target_voice, event("second"), None)
        .unwrap();
    let third = candidate
        .insert_event(
            &target_voice,
            event("first"),
            Some(&JsString::from("first")),
        )
        .unwrap();
    assert_eq!(
        ordered(&mut candidate, &target_voice, Children::Events),
        [second, first, third]
    );
    assert_eq!(candidate.work.prefix_order_copies, 1);
}

#[test]
fn every_child_insertion_reservation_failure_is_terminal_and_keeps_the_frozen_prefix() {
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
    let insert = |candidate: &mut Candidate<'_>| -> Result<(), Failure> {
        let part = candidate.resolve(Kind::Part, &JsString::from("part-z"))?;
        let contents = ordered(candidate, &part, Children::Contents);
        candidate.insert_staff(&part, staff("new-staff"), None)?;
        let inserted_voice =
            candidate.insert_voice(&part, &contents[0], voice("new-voice"), None)?;
        candidate.insert_event(&inserted_voice, event("new-event"), None)?;
        Ok(())
    };
    let mut baseline = Candidate::new(prepare(), document.id.clone());
    insert(&mut baseline).unwrap();
    let attempts = baseline.reservation.attempts;
    assert!(attempts > 20);
    for fail_at in 1..=attempts {
        let mut candidate = Candidate::new(prepare(), document.id.clone());
        candidate.reservation = Reservation::fail_at(fail_at);
        assert_eq!(
            insert(&mut candidate),
            Err(Failure::InternalError),
            "reservation {fail_at}"
        );
        let part = candidate
            .resolve(Kind::Part, &JsString::from("part-z"))
            .unwrap();
        let contents = ordered(&mut candidate, &part, Children::Contents);
        let target_voice = candidate
            .resolve(Kind::Voice, &JsString::from("voice-a"))
            .unwrap();
        assert_eq!(
            candidate.insert_staff(&part, staff("later"), None),
            Err(Failure::InternalError)
        );
        assert_eq!(
            candidate.insert_voice(&part, &contents[0], voice("later"), None),
            Err(Failure::InternalError)
        );
        assert_eq!(
            candidate.insert_event(&target_voice, event("later"), None),
            Err(Failure::InternalError)
        );
        assert_eq!(candidate.reservation.attempts, fail_at);
        assert_eq!(candidate.prefix.finish().unwrap(), expected);
        assert_eq!(store.export_document().unwrap(), document);
    }
}
