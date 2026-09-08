use super::*;
use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1, ScoreEntityTargetV1, StaffAnchorV1, decode_admission_submit_request,
};
use brilliant_score_foundation::StaffDefinitionV1;

mod oracle;

fn staff(raw: impl Into<JsString>) -> AdmissionStaffDefinitionV1 {
    let source = fixture().parts[0].staves[0].clone();
    StaffDefinitionV1 {
        id: raw.into(),
        line_count: source.line_count,
        default_clef: source.default_clef,
    }
}

fn part(candidate: &mut Candidate<'_>, raw: &str) -> Occurrence {
    candidate.resolve(Kind::Part, &JsString::from(raw)).unwrap()
}

fn staff_state(candidate: &mut Candidate<'_>, owner: &Occurrence) -> Vec<(JsString, Value)> {
    let mut sources = Vec::new();
    candidate
        .visit_order(
            &CandidateOrder::new(owner, Children::Staffs),
            &mut |source, _| {
                sources.push(source.clone());
                true
            },
        )
        .unwrap();
    sources
        .into_iter()
        .map(|source| {
            (
                candidate.raw_id(&source).unwrap().clone(),
                candidate.read_value(&source).unwrap(),
            )
        })
        .collect()
}

fn definition(lines: i64) -> Value {
    let source = staff("unused");
    Value::StaffDefinition {
        line_count: SafeInteger::new(lines).unwrap(),
        default_clef: source.default_clef,
    }
}

// This is a test driver for real admission DTOs, not a production dispatcher.
pub(super) fn execute_staff_wire(
    recorder: &mut Recorder<'_>,
    command: &str,
) -> Result<(), Failure> {
    let request = format!("{{\"apiVersion\":1,\"command\":{command}}}");
    let command = decode_admission_submit_request(request.as_bytes())
        .expect("valid admission shape")
        .command;
    match command {
        CoreCommandEnvelopeV1::DocumentSetMetadata {
            target: ScoreEntityTargetV1::Document { document_id },
            metadata,
        } => {
            let target = recorder
                .candidate
                .resolve(Kind::Document, document_id.as_js_string())?;
            recorder.replace_scalar(&target, Value::DocumentMetadata(metadata))?;
            Ok(())
        }
        CoreCommandEnvelopeV1::StaffInsert {
            target: ScoreEntityTargetV1::Part { part_id },
            anchor,
            staff,
        } => {
            let owner = recorder
                .candidate
                .resolve(Kind::Part, part_id.as_js_string())?;
            let after = match &anchor {
                StaffAnchorV1::Start => None,
                StaffAnchorV1::AfterStaff { staff_id } => Some(staff_id),
            };
            recorder.insert_staff(&owner, staff, after)?;
            Ok(())
        }
        CoreCommandEnvelopeV1::StaffRemove {
            target: ScoreEntityTargetV1::Staff { staff_id },
        } => recorder.remove_staff(staff_id.as_js_string()),
        CoreCommandEnvelopeV1::StaffMove {
            target: ScoreEntityTargetV1::Staff { staff_id },
            anchor,
        } => {
            let target = recorder
                .candidate
                .resolve(Kind::Staff, staff_id.as_js_string())?;
            let owner = recorder.candidate.owner(&target).unwrap();
            let after = match &anchor {
                StaffAnchorV1::Start => None,
                StaffAnchorV1::AfterStaff { staff_id } => Some(staff_id),
            };
            recorder.move_child(
                &CandidateOrder::new(&owner, Children::Staffs),
                staff_id.as_js_string(),
                after,
            )?;
            Ok(())
        }
        CoreCommandEnvelopeV1::StaffSetDefinition {
            target: ScoreEntityTargetV1::Staff { staff_id },
            line_count,
            default_clef,
        } => {
            let target = recorder
                .candidate
                .resolve(Kind::Staff, staff_id.as_js_string())?;
            recorder.replace_scalar(
                &target,
                Value::StaffDefinition {
                    line_count,
                    default_clef,
                },
            )?;
            Ok(())
        }
        CoreCommandEnvelopeV1::PartInsert { anchor, part, .. } => {
            let after = match &anchor {
                brilliant_kernel_contracts::PartAnchorV1::Start => None,
                brilliant_kernel_contracts::PartAnchorV1::AfterPart { part_id } => Some(part_id),
            };
            recorder.insert_part(part, after)?;
            Ok(())
        }
        CoreCommandEnvelopeV1::PartRemove {
            target: ScoreEntityTargetV1::Part { part_id },
        } => recorder.remove_part(part_id.as_js_string()),
        CoreCommandEnvelopeV1::VoiceSetDefaultStaff {
            target: ScoreEntityTargetV1::Voice { voice_id },
            staff_id,
        } => {
            let target = recorder
                .candidate
                .resolve(Kind::Voice, voice_id.as_js_string())?;
            recorder.replace_reference(&target, Some(staff_id))?;
            Ok(())
        }
        CoreCommandEnvelopeV1::EventSetStaffAssignment {
            target: ScoreEntityTargetV1::Event { event_id },
            assignment,
        } => {
            let target = recorder
                .candidate
                .resolve(Kind::Event, event_id.as_js_string())?;
            let value = match assignment {
                brilliant_kernel_contracts::EventStaffAssignmentV1::InheritDefault => None,
                brilliant_kernel_contracts::EventStaffAssignmentV1::Staff { staff_id } => {
                    Some(staff_id)
                }
            };
            recorder.replace_reference(&target, value)?;
            Ok(())
        }
        _ => panic!("unsupported command in Staff journal test driver"),
    }
}

#[test]
fn decoded_staff_commands_record_insert_edit_move_remove_and_exact_replay() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let owner = part(&mut recorder.candidate, "part-z");
    let initial = staff_state(&mut recorder.candidate, &owner);
    let commands = [
        r#"{"commandVersion":1,"commandId":"core.staff.insert","target":{"kind":"part","partId":"part-z"},"payload":{"anchor":{"kind":"start"},"staff":{"id":"new/\ud800","lineCount":5,"defaultClef":{"sign":"G","line":2}}}}"#,
        r#"{"commandVersion":1,"commandId":"core.staff.set-definition","target":{"kind":"staff","staffId":"new/\ud800"},"payload":{"lineCount":7,"defaultClef":{"sign":"G","line":2}}}"#,
        r#"{"commandVersion":1,"commandId":"core.staff.move","target":{"kind":"staff","staffId":"new/\ud800"},"payload":{"anchor":{"kind":"after-staff","staffId":"staff-a"}}}"#,
        r#"{"commandVersion":1,"commandId":"core.staff.remove","target":{"kind":"staff","staffId":"new/\ud800"},"payload":{}}"#,
    ];
    let raw = JsString::from_utf16(vec![110, 101, 119, 47, 0xd800]);
    for command in commands {
        execute_staff_wire(&mut recorder, command).unwrap();
    }
    assert_eq!(recorder.steps.len(), 4);
    assert_eq!(staff_state(&mut recorder.candidate, &owner), initial);
    let (mut candidate, journal) = recorder.finish().unwrap();
    for direction in [Direction::Inverse, Direction::Forward] {
        journal.replay(&mut candidate, direction).unwrap();
        assert_eq!(staff_state(&mut candidate, &owner), initial);
        assert_eq!(
            candidate.resolve(Kind::Staff, &raw),
            Err(Failure::TargetNotFound)
        );
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn decoded_empty_and_duplicate_staff_ids_keep_distinct_occurrences() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for raw_json in [r#""""#, r#""staff-z""#] {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        let wire = format!(
            r#"{{"commandVersion":1,"commandId":"core.staff.insert","target":{{"kind":"part","partId":"part-z"}},"payload":{{"anchor":{{"kind":"start"}},"staff":{{"id":{raw_json},"lineCount":5,"defaultClef":{{"sign":"G","line":2}}}}}}}}"#
        );
        execute_staff_wire(&mut recorder, &wire).unwrap();
        let owner = part(&mut recorder.candidate, "part-z");
        let state = staff_state(&mut recorder.candidate, &owner);
        assert_eq!(state.len(), 3);
        if state[0].0.is_empty() {
            assert!(state[0].0.code_units().is_empty());
        } else {
            assert_eq!(state[0].0, state[1].0);
            assert_eq!(
                recorder.remove_staff(&JsString::from("staff-z")),
                Err(Failure::InternalError)
            );
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn prefix_staff_removal_and_same_id_rebirth_have_distinct_stored_lifetimes() {
    let mut document = fixture();
    document.parts[0].staves.push(StaffDefinitionV1 {
        id: id("unreferenced"),
        line_count: SafeInteger::new(5).unwrap(),
        default_clef: staff("unused").default_clef,
    });
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let owner = part(&mut recorder.candidate, "part-z");
    let initial = staff_state(&mut recorder.candidate, &owner);
    let old = recorder
        .candidate
        .resolve(Kind::Staff, &JsString::from("unreferenced"))
        .unwrap();
    recorder
        .remove_staff(&JsString::from("unreferenced"))
        .unwrap();
    let mut replacement = staff("unreferenced");
    replacement.line_count = SafeInteger::new(7).unwrap();
    let new = recorder.insert_staff(&owner, replacement, None).unwrap();
    assert_ne!(old, new);
    let final_state = staff_state(&mut recorder.candidate, &owner);
    let (mut candidate, journal) = recorder.finish().unwrap();
    journal.replay(&mut candidate, Direction::Inverse).unwrap();
    assert_eq!(staff_state(&mut candidate, &owner), initial);
    journal.replay(&mut candidate, Direction::Forward).unwrap();
    assert_eq!(staff_state(&mut candidate, &owner), final_state);
    assert!(!candidate.visible(&old));

    let mut final_document = document.clone();
    let mut replacement = final_document.parts[0].staves.pop().unwrap();
    replacement.line_count = SafeInteger::new(7).unwrap();
    final_document.parts[0].staves.insert(0, replacement);
    let final_store = build_live_score_store(&final_document).unwrap();
    let mut fresh = Candidate::new(
        TransactionOverlayV1::new(&final_store),
        final_document.id.clone(),
    );
    let fresh_owner = part(&mut fresh, "part-z");
    journal.replay(&mut fresh, Direction::Inverse).unwrap();
    assert_eq!(staff_state(&mut fresh, &fresh_owner), initial);
    journal.replay(&mut fresh, Direction::Forward).unwrap();
    assert_eq!(staff_state(&mut fresh, &fresh_owner), final_state);
    assert_eq!(final_store.export_document().unwrap(), final_document);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn removing_an_original_member_of_inserted_part_composes_with_parent_removal() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut payload = raw_part("new-part");
    payload.staves.push(staff("unused-original"));
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let owner = recorder.insert_part(payload, None).unwrap();
    let original = recorder.active[&owner].bundle.clone();
    recorder
        .remove_staff(&JsString::from("unused-original"))
        .unwrap();
    recorder.remove_part(&JsString::from("new-part")).unwrap();
    let (_, journal) = recorder.finish().unwrap();
    assert!(Arc::ptr_eq(inserted_bundle(&journal), &original));
    for direction in [Direction::Forward, Direction::Inverse] {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        journal.replay(&mut candidate, direction).unwrap();
        assert_eq!(part_ids(&mut candidate), ["part-z"]);
        assert_eq!(
            candidate.resolve(Kind::Staff, &JsString::from("unused-original")),
            Err(Failure::TargetNotFound)
        );
    }
    assert_eq!(store.export_document().unwrap(), document);
}

fn composed(recorder: &mut Recorder<'_>, remove_child: bool) -> Result<(), Failure> {
    let owner = recorder.insert_part(raw_part("new-part"), None)?;
    let target = recorder.insert_staff(&owner, staff("new-staff"), None)?;
    recorder.replace_scalar(&target, definition(7))?;
    recorder.move_child(
        &CandidateOrder::new(&owner, Children::Staffs),
        &JsString::from("new-staff"),
        Some(&JsString::from("staff-a")),
    )?;
    if remove_child {
        recorder.remove_staff(&JsString::from("new-staff"))?;
    }
    recorder.remove_part(&JsString::from("new-part"))
}

#[test]
fn staff_lifecycle_composes_with_parent_removal_without_rewriting_insert_payload() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for remove_child in [false, true] {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        composed(&mut recorder, remove_child).unwrap();
        let (mut candidate, journal) = recorder.finish().unwrap();
        assert_eq!(journal.steps.len(), if remove_child { 6 } else { 5 });
        assert!(
            !inserted_bundle(&journal)
                .nodes
                .iter()
                .any(|node| node.image.raw_id == "new-staff")
        );
        assert_eq!(part_ids(&mut candidate), ["part-z"]);
        for direction in [Direction::Inverse, Direction::Forward] {
            journal.replay(&mut candidate, direction).unwrap();
            assert_eq!(part_ids(&mut candidate), ["part-z"]);
            assert_eq!(
                candidate.resolve(Kind::Staff, &JsString::from("new-staff")),
                Err(Failure::TargetNotFound)
            );
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn recorded_structural_changes_do_not_allow_unrecorded_fields_or_children_into_history() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for tamper in 0..4 {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        let owner = recorder.insert_part(raw_part("new-part"), None).unwrap();
        let recorded = recorder
            .insert_staff(&owner, staff("recorded"), None)
            .unwrap();
        match tamper {
            0 => {
                recorder
                    .candidate
                    .replace_value(&recorded, definition(9))
                    .unwrap();
            }
            1 => {
                recorder
                    .candidate
                    .insert_staff(&owner, staff("unrecorded"), None)
                    .unwrap();
            }
            2 => {
                recorder.candidate.hide(&recorded).unwrap();
            }
            _ => {
                recorder
                    .candidate
                    .replace_value(&owner, Value::PartName("unrecorded parent".into()))
                    .unwrap();
            }
        }
        assert_eq!(
            recorder.remove_part(&JsString::from("new-part")),
            Err(Failure::InternalError),
            "tamper {tamper}"
        );
        assert_eq!(
            recorder.candidate.reservation.ensure_active(),
            Err(Failure::InternalError)
        );
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn recorded_staff_definition_cannot_mask_an_unrecorded_prior_edit() {
    for prefix_part in [false, true] {
        for original_member in [false, true] {
            for prior_edit in [false, true] {
                for requested in [7, 9] {
                    let mut document = fixture();
                    if prefix_part && original_member {
                        let mut tracked = document.parts[0].staves[0].clone();
                        tracked.id = id("tracked");
                        document.parts[0].staves.push(tracked);
                    }
                    let store = build_live_score_store(&document).unwrap();
                    let mut payload = raw_part("new-part");
                    if original_member {
                        payload.staves.push(staff("tracked"));
                    }
                    let mut recorder = Recorder::new(Candidate::new(
                        TransactionOverlayV1::new(&store),
                        document.id.clone(),
                    ));
                    let owner = if prefix_part {
                        part(&mut recorder.candidate, "part-z")
                    } else {
                        recorder.insert_part(payload, None).unwrap()
                    };
                    let target = if original_member {
                        recorder
                            .candidate
                            .resolve(Kind::Staff, &JsString::from("tracked"))
                            .unwrap()
                    } else {
                        recorder
                            .insert_staff(&owner, staff("tracked"), None)
                            .unwrap()
                    };
                    if prior_edit {
                        recorder.replace_scalar(&target, definition(6)).unwrap();
                    }
                    recorder
                        .candidate
                        .replace_value(&target, definition(9))
                        .unwrap();
                    let steps = recorder.steps.len();
                    assert_eq!(
                        recorder.replace_scalar(&target, definition(requested)),
                        Err(Failure::InternalError),
                        "prefix={prefix_part} original={original_member} prior={prior_edit} requested={requested}"
                    );
                    assert_eq!(recorder.steps.len(), steps);
                    assert_eq!(
                        recorder.candidate.reservation.ensure_active(),
                        Err(Failure::InternalError)
                    );
                    assert!(recorder.finish().is_err());
                    assert_eq!(store.export_document().unwrap(), document);
                }
            }
        }
    }
}

#[test]
fn untouched_prefix_staff_noop_does_not_reserve_or_record() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let target = recorder
        .candidate
        .resolve(Kind::Staff, &JsString::from("staff-z"))
        .unwrap();
    let current = recorder.candidate.read_value(&target).unwrap();
    recorder.candidate.reservation = Reservation::fail_at(1);
    assert_eq!(recorder.replace_scalar(&target, current), Ok(false));
    assert_eq!(recorder.candidate.reservation.attempts, 0);
    assert_eq!(recorder.candidate.reservation.ensure_active(), Ok(()));
    assert!(recorder.steps.is_empty());
    assert!(recorder.staff_images.is_empty());
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn malformed_staff_operations_fail_before_hiding_inserting_or_unbinding() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for inserting in [false, true] {
        for tamper in 0..4 {
            let mut recorder = Recorder::new(Candidate::new(
                TransactionOverlayV1::new(&store),
                document.id.clone(),
            ));
            let owner = part(&mut recorder.candidate, "part-z");
            recorder
                .insert_staff(&owner, staff("new"), Some(&JsString::from("staff-z")))
                .unwrap();
            let (mut candidate, journal) = recorder.finish().unwrap();
            if inserting {
                journal.replay(&mut candidate, Direction::Inverse).unwrap();
            }
            let mut operation = if inserting {
                journal.steps[0].forward.clone()
            } else {
                journal.steps[0].inverse.clone()
            };
            let (owner, anchor, bundle) = match &mut operation {
                Operation::InsertEntity {
                    owner,
                    anchor,
                    bundle: StoredEntityBundle::Staff(bundle),
                } => (owner, anchor, bundle),
                Operation::RemoveEntity {
                    owner,
                    expected_anchor,
                    expected: StoredEntityBundle::Staff(bundle),
                } => (owner, expected_anchor, bundle),
                _ => unreachable!(),
            };
            match tamper {
                0 => {
                    Arc::make_mut(&mut Arc::make_mut(bundle).image).kind = Kind::Part;
                }
                1 => {
                    Arc::make_mut(&mut Arc::make_mut(bundle).image).raw_id = "wrong".into();
                }
                2 => {
                    *owner = bundle.id;
                }
                _ => {
                    *anchor = Some(*owner);
                }
            }
            let side = if inserting {
                BoundarySide::SuffixStart
            } else {
                BoundarySide::SuffixEnd
            };
            let mut bindings =
                ReplayBindings::at(&journal.identities, side, &mut candidate).unwrap();
            let nodes = candidate.nodes.len();
            let hidden = candidate.hidden.clone();
            let attempts = candidate.reservation.attempts;
            assert_eq!(
                operation.apply(&mut candidate, &mut bindings),
                Err(Failure::InternalError),
                "insert={inserting} tamper={tamper}"
            );
            assert_eq!(candidate.nodes.len(), nodes);
            assert_eq!(candidate.hidden, hidden);
            assert_eq!(candidate.reservation.attempts, attempts);
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn scoped_reference_conflicts_and_hidden_sources_match_staff_removal_preparation() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut conflict = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    assert_eq!(
        conflict.remove_staff(&JsString::from("staff-z")),
        Err(Failure::ReferenceConflict)
    );
    assert!(conflict.steps.is_empty());

    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let owner = part(&mut recorder.candidate, "part-z");
    let new = recorder
        .insert_staff(&owner, staff("target"), None)
        .unwrap();
    let mut distant = raw_part("distant");
    for content in &mut distant.measure_contents {
        for voice in &mut content.voices {
            voice.default_staff_id = "target".into();
        }
    }
    recorder.insert_part(distant, None).unwrap();
    assert!(
        !recorder
            .candidate
            .staff_referrers(&JsString::from("target"))
            .is_empty()
    );
    recorder.remove_staff(&JsString::from("target")).unwrap();
    assert!(!recorder.candidate.visible(&new));
    recorder.remove_part(&JsString::from("distant")).unwrap();
    let (_, journal) = recorder.finish().unwrap();
    assert_eq!(journal.steps.len(), 4);

    let mut hidden = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let voice = hidden
        .candidate
        .resolve(Kind::Voice, &JsString::from("voice-z"))
        .unwrap();
    hidden.candidate.hide(&voice).unwrap();
    hidden.remove_staff(&JsString::from("staff-z")).unwrap();
    assert_eq!(hidden.steps.len(), 1);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn local_anchor_resolution_precedes_all_staff_journal_reservations() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let owner = part(&mut recorder.candidate, "part-z");
    recorder.candidate.reservation = Reservation::fail_at(1);
    assert_eq!(
        recorder.insert_staff(&owner, staff("new"), Some(&JsString::from("absent"))),
        Err(Failure::AnchorNotFound)
    );
    assert_eq!(recorder.candidate.reservation.attempts, 0);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn all_staff_recording_and_replay_reservation_failures_are_terminal() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let prepare = || {
        let mut prefix = TransactionOverlayV1::new(&store);
        prefix
            .replace_scalar(
                Scalar::PartName {
                    part_id: id("part-z"),
                },
                Value::PartName("prefix edit".into()),
            )
            .unwrap();
        prefix
    };
    let expected_prefix = prepare().finish().unwrap();
    let mut baseline = Recorder::new(Candidate::new(prepare(), document.id.clone()));
    composed(&mut baseline, true).unwrap();
    let attempts = baseline.candidate.reservation.attempts;
    assert!(attempts > 0);
    for fail_at in 1..=attempts {
        let mut recorder = Recorder::new(Candidate::new(prepare(), document.id.clone()));
        recorder.candidate.reservation = Reservation::fail_at(fail_at);
        assert_eq!(
            composed(&mut recorder, true),
            Err(Failure::InternalError),
            "record {fail_at}"
        );
        assert_eq!(recorder.candidate.reservation.attempts, fail_at);
        assert_eq!(
            recorder.remove_staff(&JsString::from("new-staff")),
            Err(Failure::InternalError)
        );
        assert!(
            std::mem::take(&mut recorder.identities)
                .finish(&mut recorder.candidate)
                .is_err()
        );
        assert_eq!(recorder.candidate.prefix.finish().unwrap(), expected_prefix);
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
        let mut baseline = Candidate::new(prepare(), document.id.clone());
        journal.replay(&mut baseline, direction()).unwrap();
        for fail_at in 1..=baseline.reservation.attempts {
            let mut candidate = Candidate::new(prepare(), document.id.clone());
            candidate.reservation = Reservation::fail_at(fail_at);
            assert_eq!(
                journal.replay(&mut candidate, direction()),
                Err(Failure::InternalError),
                "inverse={inverse} replay {fail_at}"
            );
            assert_eq!(candidate.reservation.attempts, fail_at);
            assert_eq!(
                journal.replay(&mut candidate, direction()),
                Err(Failure::InternalError)
            );
            assert!(IdentityRecorder::default().finish(&mut candidate).is_err());
            assert_eq!(candidate.prefix.finish().unwrap(), expected_prefix);
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
}
