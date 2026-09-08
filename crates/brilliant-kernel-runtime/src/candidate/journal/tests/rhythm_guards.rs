use super::*;

#[test]
fn inserting_a_child_cannot_publish_an_unrecorded_owner_field() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for kind in [Kind::Part, Kind::Staff, Kind::Event] {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        let result = match kind {
            Kind::Part => {
                let mut metadata = document.metadata.clone();
                metadata.title = "unrecorded metadata".into();
                recorder
                    .candidate
                    .replace_value(
                        &recorder.candidate.document.clone(),
                        Value::DocumentMetadata(metadata),
                    )
                    .unwrap();
                recorder.insert_part(raw_part("new-part"), None)
            }
            Kind::Staff => {
                let part = recorder
                    .candidate
                    .resolve(Kind::Part, &"part-z".into())
                    .unwrap();
                recorder
                    .candidate
                    .replace_value(&part, Value::PartName("unrecorded name".into()))
                    .unwrap();
                let staff = raw_part("unused").staves.remove(0);
                recorder.insert_staff(&part, staff, None)
            }
            Kind::Event => {
                let voice = recorder
                    .candidate
                    .resolve(Kind::Voice, &"voice-a".into())
                    .unwrap();
                let mut start = document.parts[0].measure_contents[0].voices[0]
                    .sequence
                    .start
                    .clone();
                start.numerator = SafeInteger::new(1).unwrap();
                recorder
                    .candidate
                    .replace_value(&voice, Value::VoiceSequenceStart(start))
                    .unwrap();
                recorder.insert_event(&voice, rest("new-event"), None)
            }
            _ => unreachable!(),
        };
        assert_eq!(result, Err(Failure::InternalError), "{kind:?}");
        assert!(recorder.steps.is_empty());
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert_eq!(store.export_document().unwrap(), document);
    }
}

fn rest(name: &str) -> RhythmicEventV1<JsString> {
    let mut event = raw_part("unused")
        .measure_contents
        .remove(0)
        .voices
        .remove(0)
        .sequence
        .events
        .remove(0);
    event.id = name.into();
    event.content = RhythmicContentV1::Rest;
    event.staff_id = None;
    event
}

#[test]
fn part_tag_cannot_wrap_a_valid_voice_or_event_bundle_in_either_replay_direction() {
    for voice_root in [false, true] {
        for inverse in [false, true] {
            let document = fixture();
            let store = build_live_score_store(&document).unwrap();
            let mut recorder = Recorder::new(Candidate::new(
                TransactionOverlayV1::new(&store),
                document.id.clone(),
            ));
            let voice = recorder
                .candidate
                .resolve(Kind::Voice, &"voice-a".into())
                .unwrap();
            if voice_root {
                let content = recorder.candidate.owner(&voice).unwrap();
                let part = recorder.candidate.owner(&content).unwrap();
                let mut payload = raw_part("unused")
                    .measure_contents
                    .remove(0)
                    .voices
                    .remove(0);
                payload.id = "guard-voice".into();
                payload.sequence.events.clear();
                recorder
                    .insert_voice(&part, &content, payload, None)
                    .unwrap();
            } else {
                recorder
                    .insert_event(&voice, rest("guard-event"), None)
                    .unwrap();
            }
            let (current, mut journal) = recorder.finish().unwrap();
            assert_eq!(journal.steps.len(), 1);
            let operation = if inverse {
                &mut journal.steps[0].inverse
            } else {
                &mut journal.steps[0].forward
            };
            let wrapped = match operation {
                Operation::InsertEntity { bundle, .. } => bundle,
                Operation::RemoveEntity { expected, .. } => expected,
                _ => panic!("entity operation"),
            };
            let legitimate_bundle = match wrapped {
                StoredEntityBundle::Voice(bundle) | StoredEntityBundle::Event(bundle) => {
                    bundle.clone()
                }
                _ => panic!("rhythm bundle"),
            };
            assert_eq!(
                legitimate_bundle.root_kind().unwrap(),
                if voice_root { Kind::Voice } else { Kind::Event }
            );
            // Keep every identity, owner, anchor, and payload unchanged. Only
            // the operation's declared entity category is corrupt.
            *wrapped = StoredEntityBundle::Part(legitimate_bundle);
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
                "voice={voice_root}, inverse={inverse}"
            );
            assert!(candidate.reservation.ensure_active().is_err());
            assert_eq!(store.export_document().unwrap(), document);
        }
    }
}

#[test]
fn apparent_move_noop_rejects_an_unrecorded_structural_addition() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let voice = recorder
        .candidate
        .resolve(Kind::Voice, &"voice-a".into())
        .unwrap();
    let order = CandidateOrder::new(&voice, Children::Events);
    let after = JsString::from("event-a");
    let inserted = recorder
        .candidate
        .insert_event(&voice, rest("unrecorded-event"), Some(&after))
        .unwrap();
    assert_eq!(
        super::super::orders::previous(&mut recorder.candidate, &order, &inserted).unwrap(),
        Some(Occurrence::prefix(Entity::Event {
            event_id: id("event-a")
        }))
    );
    // It is a genuine no-op against the polluted candidate, but accepting it
    // would let a missing journal insertion escape the expected-order guard.
    assert_eq!(
        recorder.move_child(&order, &"unrecorded-event".into(), Some(&after)),
        Err(Failure::InternalError)
    );
    assert!(recorder.steps.is_empty());
    assert!(recorder.candidate.reservation.ensure_active().is_err());
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn equal_raw_id_and_fields_do_not_substitute_a_different_occurrence_for_a_recorded_node() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let voice = recorder
        .candidate
        .resolve(Kind::Voice, &"voice-a".into())
        .unwrap();
    let payload = rest("recorded-event");
    let recorded = recorder
        .insert_event(&voice, payload.clone(), None)
        .unwrap();
    recorder.candidate.hide(&recorded).unwrap();
    let replacement = recorder
        .candidate
        .insert_event(&voice, payload, None)
        .unwrap();
    assert_ne!(recorded, replacement);
    assert_eq!(
        recorder.candidate.raw_id(&recorded),
        recorder.candidate.raw_id(&replacement)
    );
    assert_eq!(
        recorder
            .candidate
            .resolve(Kind::Event, &"recorded-event".into())
            .unwrap(),
        replacement
    );
    assert_eq!(recorder.steps.len(), 1);
    assert_eq!(
        recorder.remove_event(&"recorded-event".into()),
        Err(Failure::InternalError)
    );
    assert_eq!(
        recorder.steps.len(),
        1,
        "a substituted node must not get a deletion journal entry"
    );
    assert!(recorder.candidate.reservation.ensure_active().is_err());
    assert_eq!(store.export_document().unwrap(), document);
}
