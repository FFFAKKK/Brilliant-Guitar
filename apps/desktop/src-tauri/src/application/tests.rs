use super::*;

fn id() -> String {
    Uuid::new_v4().to_string()
}

fn create_request(workspace_id: &str, request_id: &str) -> CreateScoreRequest {
    CreateScoreRequest {
        workspace_id: workspace_id.into(),
        input: NewScoreInput {
            title: "测试乐谱".into(),
            measure_count: 2,
        },
        request_id: request_id.into(),
        expected_document_id: None,
    }
}

#[test]
fn create_read_and_close_session() {
    let workspace_id = id();
    let request_id = id();
    let mut service = ScoreSessionService::default();

    let created = service
        .create(create_request(&workspace_id, &request_id))
        .expect("create score");

    assert_eq!(created.title, "测试乐谱");
    assert_eq!(created.measure_count, 2);
    assert_eq!(created.document_version, 0);
    match &created.playback_source {
        PlaybackSourceProjection::Ready {
            projection_version,
            document_id,
            document_version,
            bpm,
            written_to_sounding,
            measures,
        } => {
            assert_eq!(*projection_version, 1);
            assert_eq!(document_id, &created.document_id);
            assert_eq!(*document_version, created.document_version);
            assert_eq!(*bpm, 96.0);
            assert_eq!(
                *written_to_sounding,
                PlaybackTransposition {
                    diatonic_steps: 0,
                    chromatic_semitones: 0
                }
            );
            assert_eq!(measures.len(), 2);
            assert!(measures.iter().all(|measure| measure.events.is_empty()));
        }
        PlaybackSourceProjection::Unsupported { code, .. } => {
            panic!("unexpected playback projection: {code}")
        }
    }
    assert!(service.read(&workspace_id).expect("read").is_some());
    assert!(service.close(&workspace_id).expect("close"));
    assert!(service.read(&workspace_id).expect("read closed").is_none());
}

#[test]
fn measure_index_tracks_structural_edits_undo_and_redo_by_document_version() {
    let workspace_id = id();
    let mut service = ScoreSessionService::default();
    let created = service
        .create(CreateScoreRequest {
            workspace_id: workspace_id.clone(),
            input: NewScoreInput {
                title: "索引测试".into(),
                measure_count: 1,
            },
            request_id: id(),
            expected_document_id: None,
        })
        .expect("create score");
    let initial = service
        .read_measure_index(
            &workspace_id,
            &created.document_id,
            created.document_version,
        )
        .expect("read initial index")
        .expect("initial index");
    assert_eq!(initial.measure_ids, vec!["measure-1"]);

    let inserted = edit(
        &mut service,
        &workspace_id,
        &created,
        ScoreEditAction::Append {
            measure_id: "measure-1".into(),
            anchor: InputSequenceAnchor::Start,
            offset_units: None,
            duration: EventDuration { base: 1, dots: 0 },
            content: InputContent::Note {
                pitch: crate::dto::InputPitch {
                    step: PitchStep::C,
                    octave: 4,
                    alter: 0,
                },
            },
        },
    );
    let inserted_index = service
        .read_measure_index(
            &workspace_id,
            &inserted.document_id,
            inserted.document_version,
        )
        .expect("read inserted index")
        .expect("inserted index");
    assert_eq!(inserted_index.measure_ids.len(), 2);
    assert_eq!(inserted_index.measure_ids[0], "measure-1");
    assert_eq!(
        service
            .read_measure_index(
                &workspace_id,
                &created.document_id,
                created.document_version,
            )
            .expect_err("stale index rejected")
            .status,
        409
    );

    let undone = edit(
        &mut service,
        &workspace_id,
        &inserted,
        ScoreEditAction::Undo,
    );
    let undone_index = service
        .read_measure_index(&workspace_id, &undone.document_id, undone.document_version)
        .expect("read undone index")
        .expect("undone index");
    assert_eq!(undone_index.measure_ids, vec!["measure-1"]);

    let redone = edit(&mut service, &workspace_id, &undone, ScoreEditAction::Redo);
    let redone_index = service
        .read_measure_index(&workspace_id, &redone.document_id, redone.document_version)
        .expect("read redone index")
        .expect("redone index");
    assert_eq!(redone_index.measure_ids, inserted_index.measure_ids);
}

fn create(service: &mut ScoreSessionService) -> (String, ScoreSessionRead) {
    let workspace_id = id();
    let request_id = id();
    let session = service
        .create(create_request(&workspace_id, &request_id))
        .expect("create score");
    (workspace_id, session)
}

fn edit(
    service: &mut ScoreSessionService,
    workspace_id: &str,
    current: &ScoreSessionRead,
    action: ScoreEditAction,
) -> ScoreSessionRead {
    service
        .edit(ScoreEditRequest {
            workspace_id: workspace_id.into(),
            request_id: id(),
            document_id: current.document_id.clone(),
            expected_version: current.document_version,
            action,
        })
        .expect("edit score")
}

fn append_note(
    service: &mut ScoreSessionService,
    workspace_id: &str,
    current: &ScoreSessionRead,
    anchor: InputSequenceAnchor,
    step: PitchStep,
) -> ScoreSessionRead {
    edit(
        service,
        workspace_id,
        current,
        ScoreEditAction::Append {
            measure_id: "measure-1".into(),
            anchor,
            offset_units: None,
            duration: EventDuration { base: 4, dots: 0 },
            content: InputContent::Note {
                pitch: crate::dto::InputPitch {
                    step,
                    octave: 4,
                    alter: 0,
                },
            },
        },
    )
}

fn first_measure_events(read: &ScoreSessionRead) -> &[StaffEvent] {
    match &read.notation {
        NotationView::Staff { measures, .. } => &measures[0].events,
        NotationView::Unsupported { message } => panic!("unsupported notation: {message}"),
    }
}

#[test]
fn edit_retry_version_conflict_and_history_match_host_contract() {
    let mut service = ScoreSessionService::default();
    let (workspace_id, created) = create(&mut service);
    let request = ScoreEditRequest {
        workspace_id: workspace_id.clone(),
        request_id: id(),
        document_id: created.document_id.clone(),
        expected_version: created.document_version,
        action: ScoreEditAction::Append {
            measure_id: "measure-1".into(),
            anchor: InputSequenceAnchor::Start,
            offset_units: None,
            duration: EventDuration { base: 4, dots: 0 },
            content: InputContent::Note {
                pitch: crate::dto::InputPitch {
                    step: PitchStep::C,
                    octave: 4,
                    alter: 0,
                },
            },
        },
    };
    let changed = service.edit(request.clone()).expect("append");
    assert_eq!(service.edit(request).expect("idempotent retry"), changed);
    assert_eq!(first_measure_events(&changed).len(), 1);
    assert_eq!(changed.undo_depth, 1);
    match &changed.playback_source {
        PlaybackSourceProjection::Ready {
            document_version,
            measures,
            ..
        } => {
            assert_eq!(*document_version, changed.document_version);
            assert_eq!(measures[0].events.len(), 1);
            assert_eq!(
                measures[0].events[0].duration,
                ExactFraction {
                    numerator: 1,
                    denominator: 4
                }
            );
            assert!(matches!(
                measures[0].events[0].content,
                PlaybackSourceContent::Note { .. }
            ));
        }
        PlaybackSourceProjection::Unsupported { code, .. } => {
            panic!("unexpected playback projection: {code}")
        }
    }

    let stale = ScoreEditRequest {
        workspace_id: workspace_id.clone(),
        request_id: id(),
        document_id: created.document_id.clone(),
        expected_version: created.document_version,
        action: ScoreEditAction::SetTitle {
            title: "过期写入".into(),
        },
    };
    let error = service.edit(stale).expect_err("stale version rejected");
    assert_eq!(error.status, 409);
    assert_eq!(
        error.issue.expect("structured issue").code,
        "editor.version-conflict"
    );
    assert_eq!(
        service.read(&workspace_id).expect("read"),
        Some(changed.clone())
    );

    let undone = edit(&mut service, &workspace_id, &changed, ScoreEditAction::Undo);
    assert!(first_measure_events(&undone).is_empty());
    assert!(
        matches!(&undone.playback_source, PlaybackSourceProjection::Ready { measures, .. }
        if measures[0].events.is_empty())
    );
    assert_eq!(undone.redo_depth, 1);
    let redone = edit(&mut service, &workspace_id, &undone, ScoreEditAction::Redo);
    assert_eq!(redone.notation, changed.notation);
    match (&redone.playback_source, &changed.playback_source) {
        (
            PlaybackSourceProjection::Ready {
                document_version: redone_version,
                measures: redone_measures,
                ..
            },
            PlaybackSourceProjection::Ready {
                measures: changed_measures,
                ..
            },
        ) => {
            assert_eq!(*redone_version, redone.document_version);
            assert_eq!(redone_measures, changed_measures);
        }
        _ => panic!("redo must preserve a ready playback projection"),
    }
}

#[test]
fn export_import_round_trip_resets_history_and_invalid_import_is_atomic() {
    let mut service = ScoreSessionService::default();
    let (source_workspace, created) = create(&mut service);
    let edited = append_note(
        &mut service,
        &source_workspace,
        &created,
        InputSequenceAnchor::Start,
        PitchStep::A,
    );
    let encoded = service
        .export_document(&source_workspace)
        .expect("export document");
    let restored_workspace = id();
    let restored = service
        .import_document(restored_workspace.clone(), &encoded)
        .expect("import document");
    assert_eq!(restored.notation, edited.notation);
    assert_eq!(restored.undo_depth, 0);
    assert_eq!(restored.redo_depth, 0);

    let before = service
        .read(&restored_workspace)
        .expect("read before invalid import");
    let error = service
        .import_document(restored_workspace.clone(), r#"{"schemaVersion":"future"}"#)
        .expect_err("invalid import rejected");
    assert_eq!(error.status, 422);
    assert_eq!(
        service
            .read(&restored_workspace)
            .expect("read after rejection"),
        before
    );
}

#[test]
fn property_failure_keeps_document_and_success_preserves_event_identity() {
    let mut service = ScoreSessionService::default();
    let (workspace_id, created) = create(&mut service);
    let first = append_note(
        &mut service,
        &workspace_id,
        &created,
        InputSequenceAnchor::Start,
        PitchStep::C,
    );
    let first_id = first_measure_events(&first)[0].id.clone();
    let _second = append_note(
        &mut service,
        &workspace_id,
        &first,
        InputSequenceAnchor::AfterEvent {
            event_id: first_id.clone(),
        },
        PitchStep::D,
    );
    let before = service.read(&workspace_id).expect("read").expect("session");
    let overfull_request = ScoreEditRequest {
        workspace_id: workspace_id.clone(),
        request_id: id(),
        document_id: before.document_id.clone(),
        expected_version: before.document_version,
        action: ScoreEditAction::SetEventProperties {
            event_id: first_id.clone(),
            properties: crate::dto::EventProperties {
                duration: EventDuration { base: 1, dots: 0 },
                content: InputContent::Note {
                    pitch: crate::dto::InputPitch {
                        step: PitchStep::F,
                        octave: 5,
                        alter: 1,
                    },
                },
            },
        },
    };
    let overfull = service
        .edit(overfull_request)
        .expect("overfull edit accepted");
    match &overfull.notation {
        NotationView::Staff { measures, .. } => {
            assert_eq!(measures[0].rule_warnings.len(), 1);
            assert_eq!(
                measures[0].rule_warnings[0].code,
                "rule.sequence-exceeds-measure"
            );
        }
        NotationView::Unsupported { message } => panic!("unsupported notation: {message}"),
    }
    let restored = edit(
        &mut service,
        &workspace_id,
        &overfull,
        ScoreEditAction::Undo,
    );
    assert_eq!(restored.notation, before.notation);

    let changed = edit(
        &mut service,
        &workspace_id,
        &restored,
        ScoreEditAction::SetEventProperties {
            event_id: first_id.clone(),
            properties: crate::dto::EventProperties {
                duration: EventDuration { base: 8, dots: 0 },
                content: InputContent::Note {
                    pitch: crate::dto::InputPitch {
                        step: PitchStep::G,
                        octave: 5,
                        alter: -1,
                    },
                },
            },
        },
    );
    assert_eq!(first_measure_events(&changed)[0].id, first_id);
    assert_eq!(first_measure_events(&changed)[0].duration.base, 8);
    assert!(
        first_measure_events(&changed).len() >= 3,
        "gap is represented by rests"
    );
}

#[test]
fn delete_time_policy_preserves_or_collapses_rhythm_and_remains_undoable() {
    let mut service = ScoreSessionService::default();
    let (workspace_id, created) = create(&mut service);
    let first = append_note(
        &mut service,
        &workspace_id,
        &created,
        InputSequenceAnchor::Start,
        PitchStep::C,
    );
    let first_id = first_measure_events(&first)[0].id.clone();
    let second = append_note(
        &mut service,
        &workspace_id,
        &first,
        InputSequenceAnchor::AfterEvent { event_id: first_id },
        PitchStep::D,
    );
    let second_id = first_measure_events(&second)[1].id.clone();
    let third = append_note(
        &mut service,
        &workspace_id,
        &second,
        InputSequenceAnchor::AfterEvent {
            event_id: second_id.clone(),
        },
        PitchStep::E,
    );
    let third_id = first_measure_events(&third)[2].id.clone();

    let preserved = edit(
        &mut service,
        &workspace_id,
        &third,
        ScoreEditAction::DeleteEvent {
            event_id: second_id.clone(),
            time_policy: crate::dto::DeleteTimePolicy::Preserve,
        },
    );
    assert_eq!(first_measure_events(&preserved).len(), 3);
    assert_eq!(
        first_measure_events(&preserved)[1].content,
        InputContent::Rest
    );

    let collapsed_rest = edit(
        &mut service,
        &workspace_id,
        &preserved,
        ScoreEditAction::DeleteEvent {
            event_id: second_id.clone(),
            time_policy: crate::dto::DeleteTimePolicy::Preserve,
        },
    );
    assert_eq!(
        first_measure_events(&collapsed_rest)
            .iter()
            .map(|event| event.id.as_str())
            .collect::<Vec<_>>(),
        vec![
            first_measure_events(&third)[0].id.as_str(),
            third_id.as_str()
        ]
    );
    let restored = edit(
        &mut service,
        &workspace_id,
        &collapsed_rest,
        ScoreEditAction::Undo,
    );
    assert_eq!(restored.notation, preserved.notation);

    let original = edit(
        &mut service,
        &workspace_id,
        &restored,
        ScoreEditAction::Undo,
    );
    assert_eq!(original.notation, third.notation);
    let collapsed_note = edit(
        &mut service,
        &workspace_id,
        &original,
        ScoreEditAction::DeleteEvent {
            event_id: second_id,
            time_policy: crate::dto::DeleteTimePolicy::Collapse,
        },
    );
    assert_eq!(
        first_measure_events(&collapsed_note)
            .iter()
            .map(|event| event.id.as_str())
            .collect::<Vec<_>>(),
        vec![
            first_measure_events(&third)[0].id.as_str(),
            third_id.as_str()
        ]
    );
    assert_eq!(
        edit(
            &mut service,
            &workspace_id,
            &collapsed_note,
            ScoreEditAction::Undo
        )
        .notation,
        third.notation
    );
}

#[test]
fn append_beyond_nominal_measure_capacity_is_accepted_with_a_rule_warning() {
    let mut service = ScoreSessionService::default();
    let (workspace_id, created) = create(&mut service);
    let placed = edit(
        &mut service,
        &workspace_id,
        &created,
        ScoreEditAction::Append {
            measure_id: "measure-1".into(),
            anchor: InputSequenceAnchor::Start,
            offset_units: Some(80),
            duration: EventDuration { base: 4, dots: 0 },
            content: InputContent::Note {
                pitch: crate::dto::InputPitch {
                    step: PitchStep::A,
                    octave: 4,
                    alter: 0,
                },
            },
        },
    );
    match &placed.notation {
        NotationView::Staff { measures, .. } => {
            assert_eq!(measures[0].events.len(), 3);
            assert_eq!(measures[0].rule_warnings.len(), 1);
            assert_eq!(measures[0].rule_warnings[0].overflow.numerator, 1);
            assert_eq!(measures[0].rule_warnings[0].overflow.denominator, 2);
        }
        NotationView::Unsupported { message } => panic!("unsupported notation: {message}"),
    }
}

#[test]
fn title_limit_uses_javascript_utf16_length() {
    let mut service = ScoreSessionService::default();
    let workspace_id = id();
    let mut request = create_request(&workspace_id, &id());
    request.input.title = "😀".repeat(61);
    assert_eq!(
        service
            .create(request)
            .expect_err("122 UTF-16 units rejected")
            .status,
        400
    );
}

#[test]
fn malformed_edit_identifiers_are_rejected_before_session_state() {
    let mut service = ScoreSessionService::default();
    let (workspace_id, created) = create(&mut service);
    let request = ScoreEditRequest {
        workspace_id: workspace_id.clone(),
        request_id: id(),
        document_id: created.document_id.clone(),
        expected_version: created.document_version,
        action: ScoreEditAction::Append {
            measure_id: String::new(),
            anchor: InputSequenceAnchor::Start,
            offset_units: None,
            duration: EventDuration { base: 4, dots: 0 },
            content: InputContent::Rest,
        },
    };
    assert_eq!(
        service
            .edit(request)
            .expect_err("empty measure rejected")
            .status,
        400
    );
    assert_eq!(service.read(&workspace_id).expect("read"), Some(created));
}

#[test]
fn legacy_delete_requests_default_to_rhythm_preservation() {
    let action: ScoreEditAction = serde_json::from_value(json!({
        "kind": "delete-event",
        "eventId": "event-1"
    }))
    .expect("legacy delete action");
    assert_eq!(
        action,
        ScoreEditAction::DeleteEvent {
            event_id: "event-1".into(),
            time_policy: crate::dto::DeleteTimePolicy::Preserve,
        }
    );
    assert!(
        serde_json::from_value::<ScoreEditAction>(json!({
            "kind": "delete-event",
            "eventId": "event-1",
            "timePolicy": "stretch"
        }))
        .is_err()
    );
}

#[test]
fn batch_failure_code_uses_the_decisive_inner_failure() {
    let failure = json!({
        "code": "command.batch-child-rejected",
        "index": 1,
        "failure": { "code": "command.target-missing" }
    });
    assert_eq!(failure_code(&failure), Some("command.target-missing"));
}

#[test]
fn physical_save_close_and_reopen_preserves_the_business_document() {
    let mut service = ScoreSessionService::default();
    let (workspace_id, created) = create(&mut service);
    let changed = append_note(
        &mut service,
        &workspace_id,
        &created,
        InputSequenceAnchor::Start,
        PitchStep::E,
    );
    let undone = edit(&mut service, &workspace_id, &changed, ScoreEditAction::Undo);
    let redone = edit(&mut service, &workspace_id, &undone, ScoreEditAction::Redo);
    assert_eq!(redone.notation, changed.notation);

    let directory = std::env::temp_dir().join(format!("brilliant-business-flow-{}", id()));
    std::fs::create_dir(&directory).expect("create business flow directory");
    let path = directory.join("score.bgp.json");
    let encoded = service
        .export_document(&workspace_id)
        .expect("export before save");
    crate::document_io::atomic_write(&path, encoded.as_bytes()).expect("physical save");
    let saved = service
        .mark_saved(&workspace_id, path.clone(), redone.document_version)
        .expect("mark persisted checkpoint");
    assert_eq!(saved.saved_version, redone.document_version);
    assert!(
        !read_state(&service.sessions[&workspace_id].session)
            .expect("read persisted state")
            .dirty
    );
    assert!(service.close(&workspace_id).expect("close saved session"));

    let reopened_json = crate::document_io::read_document(&path).expect("read saved document");
    let reopened = service
        .import_document(workspace_id.clone(), &reopened_json)
        .expect("reopen saved document");
    assert_eq!(reopened.document_id, redone.document_id);
    assert_eq!(reopened.notation, redone.notation);
    assert_eq!(reopened.undo_depth, 0);
    assert_eq!(reopened.redo_depth, 0);

    std::fs::remove_dir_all(directory).expect("remove business flow directory");
}
