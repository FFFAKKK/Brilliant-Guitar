use super::*;
use crate::dto::{NewScoreInput, NotationView, ScoreEditAction};
use std::path::PathBuf;

fn fixture() -> (PathBuf, AppState, String, ScoreSessionRead) {
    let root = std::env::temp_dir().join(format!("brilliant-save-commands-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let state = AppState::new(root.join("recovery"));
    let workspace = Uuid::new_v4().to_string();
    let value = locked(&state)
        .unwrap()
        .create(CreateScoreRequest {
            workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(),
            expected_document_id: None,
            input: NewScoreInput {
                title: "保存作品".into(),
                measure_count: 1,
            },
        })
        .unwrap();
    (root, state, workspace, value)
}

fn assert_saved_session(result: &NativeFileResult, before: &ScoreSessionRead) {
    let mut expected = before.clone();
    let checkpoint = expected.persistence.as_mut().expect("native checkpoint projection");
    checkpoint.saved_version = Some(before.document_version);
    checkpoint.dirty = false;
    assert_eq!(result.session, expected, "saving changes only the checkpoint, not document/history/session identity");
}

#[test]
fn dialog_snapshot_rejects_same_id_same_version_reopen_before_touching_any_file() {
    let (root, state, workspace, initial) = fixture();
    let snapshot = locked(&state).unwrap().export_snapshot(&workspace).unwrap();
    let encoded = locked(&state).unwrap().export_document(&workspace).unwrap();
    let reopened = locked(&state).unwrap().import_document(workspace.clone(), &encoded).unwrap();
    assert_eq!(reopened.document_id, initial.document_id);
    assert_eq!(reopened.document_version, initial.document_version);
    let path = root.join("protected.bgp.json");
    std::fs::write(&path, b"retain original file").unwrap();
    let error = persist_save_snapshot(&state, &workspace, path.clone(), &expected(&initial), &snapshot).unwrap_err();
    assert_eq!(error.issue.unwrap().code, "file.save-stale");
    assert_eq!(std::fs::read(path).unwrap(), b"retain original file");
    assert_eq!(locked(&state).unwrap().read(&workspace).unwrap(), Some(reopened));
    assert!(state.recent_documents.list().unwrap().entries.is_empty());
    drop(state); std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn dialog_snapshot_cannot_rebind_a_file_after_another_save_at_the_same_version() {
    let (root, state, workspace, initial) = fixture();
    let snapshot = locked(&state).unwrap().export_snapshot(&workspace).unwrap();
    let accepted = persist_selected_file(&state, &workspace, root.join("first.bgp.json"), &expected(&initial)).unwrap();
    let rejected_path = root.join("second.bgp.json");
    let error = persist_save_snapshot(&state, &workspace, rejected_path.clone(), &expected(&initial), &snapshot).unwrap_err();
    assert_eq!(error.issue.unwrap().code, "file.save-stale");
    assert!(!rejected_path.exists());
    assert_eq!(locked(&state).unwrap().read(&workspace).unwrap(), Some(accepted.session));
    assert_eq!(state.recent_documents.list().unwrap().entries.len(), 1);
    drop(state); std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn document_metadata_survives_one_history_step_guarded_physical_save_and_reopen() {
    let (root, state, workspace, initial) = fixture();
    let changed = locked(&state).unwrap().edit(ScoreEditRequest {
        workspace_id: workspace.clone(), request_id: Uuid::new_v4().to_string(),
        document_id: initial.document_id.clone(), expected_version: initial.document_version,
        action: serde_json::from_value(serde_json::json!({"kind":"set-document-metadata",
            "metadata":{"title":"保存练习曲","authors":["作者甲","Doe, Jane"],"tempoBpm":132.5}})).unwrap(),
    }).unwrap();
    let undo = locked(&state).unwrap().edit(ScoreEditRequest {
        workspace_id: workspace.clone(), request_id: Uuid::new_v4().to_string(),
        document_id: changed.document_id.clone(), expected_version: changed.document_version,
        action: ScoreEditAction::Undo,
    }).unwrap();
    assert_eq!(undo.metadata, initial.metadata);
    let redo = locked(&state).unwrap().edit(ScoreEditRequest {
        workspace_id: workspace.clone(), request_id: Uuid::new_v4().to_string(),
        document_id: undo.document_id.clone(), expected_version: undo.document_version,
        action: ScoreEditAction::Redo,
    }).unwrap();
    assert_eq!(redo.metadata, changed.metadata);
    let path = root.join("metadata.bgp.json");
    persist_selected_file(&state, &workspace, path.clone(), &expected(&redo)).unwrap();
    let encoded = read_document(&path).unwrap();
    locked(&state).unwrap().close(&workspace).unwrap();
    let reopened = locked(&state).unwrap().import_file(workspace.clone(), &encoded, path).unwrap();
    assert_eq!(reopened.session.metadata, redo.metadata); assert_eq!(reopened.session.notation, redo.notation);
    assert_eq!(reopened.session.title, "保存练习曲"); assert_eq!(reopened.session.undo_depth, 0);
    assert_eq!(reopened.saved_version, 0);
    drop(state); std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn key_signature_survives_integrated_history_guarded_disk_save_and_reopen() {
    let (root, state, workspace, mut current) = fixture();
    let mut edit = |action: serde_json::Value| {
        current = locked(&state)
            .unwrap()
            .edit(ScoreEditRequest {
                workspace_id: workspace.clone(),
                request_id: Uuid::new_v4().to_string(),
                document_id: current.document_id.clone(),
                expected_version: current.document_version,
                action: serde_json::from_value(action).unwrap(),
            })
            .unwrap();
        current.clone()
    };
    edit(
        serde_json::json!({"kind":"append","measureId":"measure-1","anchor":{"kind":"start"},
        "duration":{"base":4,"dots":0},"content":{"kind":"note","pitch":{"step":"F","octave":4,"alter":0}}}),
    );
    let keyed = edit(
        serde_json::json!({"kind":"set-key-signature","partId":"part-1","measureId":"measure-1","change":{"kind":"set","fifths":1}}),
    );
    let undone = edit(serde_json::json!({"kind":"undo"}));
    let NotationView::Staff {
        key_signature_changes,
        ..
    } = &undone.notation
    else {
        panic!("staff")
    };
    assert!(key_signature_changes.is_empty());
    let final_score = edit(serde_json::json!({"kind":"redo"}));
    assert_eq!(final_score.notation, keyed.notation);
    let path = root.join("key-signature.bgp.json");
    let saved =
        persist_selected_file(&state, &workspace, path.clone(), &expected(&final_score)).unwrap();
    assert_eq!(saved.saved_version, final_score.document_version);
    let encoded = read_document(&path).unwrap();
    assert!(encoded.contains("brilliant.notation.key-signature"));
    locked(&state).unwrap().close(&workspace).unwrap();
    let reopened = locked(&state)
        .unwrap()
        .import_file(workspace.clone(), &encoded, path)
        .unwrap();
    assert_eq!(reopened.session.notation, final_score.notation);
    assert_eq!(reopened.session.undo_depth, 0);
    assert_eq!(reopened.saved_version, 0);
    let NotationView::Staff {
        measures,
        key_signature_changes,
        ..
    } = &reopened.session.notation
    else {
        panic!("staff")
    };
    assert_eq!(key_signature_changes[0].fifths, 1);
    assert!(matches!(
        measures[0].events[0].content,
        crate::dto::InputContent::Note {
            pitch: crate::dto::InputPitch { alter: 0, .. }
        }
    ));
    drop(state);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn four_clefs_survive_history_guarded_physical_save_and_reopen_without_transposition() {
    for clef in ["treble", "bass", "alto", "tenor"] {
        let (root, state, workspace, mut current) = fixture();
        let mut edit = |action: serde_json::Value| {
            current = locked(&state).unwrap().edit(ScoreEditRequest {
                workspace_id: workspace.clone(), request_id: Uuid::new_v4().to_string(),
                document_id: current.document_id.clone(), expected_version: current.document_version,
                action: serde_json::from_value(action).unwrap(),
            }).unwrap();
            current.clone()
        };
        let original = edit(serde_json::json!({"kind":"append","measureId":"measure-1","anchor":{"kind":"start"},
            "duration":{"base":4,"dots":0},"content":{"kind":"note","pitch":{"step":"C","octave":4,"alter":1}}}));
        let changed = edit(serde_json::json!({"kind":"set-staff-clef","staffId":"staff-1","clef":clef}));
        let final_score = if clef == "treble" { changed.clone() } else {
            let undone = edit(serde_json::json!({"kind":"undo"})); assert_eq!(undone.notation, original.notation);
            let redone = edit(serde_json::json!({"kind":"redo"})); assert_eq!(redone.notation, changed.notation); redone
        };
        let path = root.join(format!("clef-{clef}.bgp.json"));
        let saved = persist_selected_file(&state, &workspace, path.clone(), &expected(&final_score)).unwrap();
        assert_eq!(saved.saved_version, final_score.document_version);
        let encoded = read_document(&path).unwrap();
        locked(&state).unwrap().close(&workspace).unwrap();
        let reopened = locked(&state).unwrap().import_file(workspace.clone(), &encoded, path).unwrap();
        assert_eq!(reopened.session.notation, final_score.notation); assert_eq!(reopened.session.undo_depth, 0);
        let NotationView::Staff { clef: actual, measures, .. } = &reopened.session.notation else { panic!("staff") };
        assert_eq!(*actual, clef);
        assert!(matches!(measures[0].events[0].content, crate::dto::InputContent::Note {
            pitch: crate::dto::InputPitch { step: crate::dto::PitchStep::C, octave: 4, alter: 1 } }));
        drop(state); std::fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn range_clipboard_survives_history_guarded_disk_save_and_reopen() {
    let (root, state, workspace, initial) = fixture();
    let NotationView::Staff { measures, .. } = &initial.notation else {
        panic!("staff")
    };
    let measure = &measures[0];
    let mut current = initial.clone();
    let mut edit = |action: serde_json::Value| {
        current = locked(&state)
            .unwrap()
            .edit(ScoreEditRequest {
                workspace_id: workspace.clone(),
                request_id: Uuid::new_v4().to_string(),
                document_id: current.document_id.clone(),
                expected_version: current.document_version,
                action: serde_json::from_value(action).unwrap(),
            })
            .unwrap();
        current.clone()
    };
    let pasted = edit(
        serde_json::json!({ "kind": "paste-fragment", "measureId": measure.id, "voiceId": measure.voice_id,
        "anchor": { "kind": "start" }, "offsetUnits": 16,
        "fragment": { "format": "brilliant-guitar.score-events", "version": 1, "events": [
            { "duration": { "base": 8, "dots": 1 }, "content": { "kind": "note", "pitch": { "step": "G", "octave": 4, "alter": 1 } } },
            { "duration": { "base": 32, "dots": 0 }, "content": { "kind": "rest" } }
        ] } }),
    );
    assert_eq!(pasted.undo_depth, 1);
    let NotationView::Staff { measures, .. } = &pasted.notation else {
        panic!("staff")
    };
    assert_eq!(measures[0].events.len(), 3);
    let deleted = edit(
        serde_json::json!({ "kind": "delete-range", "range": { "measureId": measure.id,
        "voiceId": measure.voice_id, "startEventId": measures[0].events[1].id, "endEventId": measures[0].events[2].id } }),
    );
    assert_eq!(deleted.undo_depth, 2);
    let undone = edit(serde_json::json!({ "kind": "undo" }));
    assert_eq!(undone.notation, pasted.notation);
    let redone = edit(serde_json::json!({ "kind": "redo" }));
    assert_eq!(redone.notation, deleted.notation);
    let final_score = edit(serde_json::json!({ "kind": "undo" }));
    let path = root.join("range-clipboard.bgp.json");
    let saved =
        persist_selected_file(&state, &workspace, path.clone(), &expected(&final_score)).unwrap();
    assert_eq!(saved.session.notation, pasted.notation);
    let bytes = read_document(&path).unwrap();
    locked(&state).unwrap().close(&workspace).unwrap();
    let reopened = locked(&state)
        .unwrap()
        .import_document(workspace.clone(), &bytes)
        .unwrap();
    assert_eq!(reopened.notation, final_score.notation);
    assert_eq!(reopened.undo_depth, 0);
    drop(state);
    std::fs::remove_dir_all(root).unwrap();
}
fn expected(value: &ScoreSessionRead) -> DocumentReplacementPrecondition {
    DocumentReplacementPrecondition::Document {
        document_id: value.document_id.clone(),
        document_version: value.document_version,
    }
}

#[test]
fn guitar_staff_tab_survive_duration_history_guarded_physical_save_and_reopen() {
    let (root,state,workspace,_)=fixture();
    let original=locked(&state).unwrap().import_document(workspace.clone(),
        include_str!("../application/official_domains/guitar-document.json")).unwrap();
    let changed=locked(&state).unwrap().edit(ScoreEditRequest{
        workspace_id:workspace.clone(),request_id:Uuid::new_v4().to_string(),document_id:original.document_id.clone(),
        expected_version:original.document_version,action:serde_json::from_value(serde_json::json!({
            "kind":"set-event-properties","eventId":"event-a","properties":{"duration":{"base":8,"dots":1},
            "content":{"kind":"note","pitch":{"step":"E","alter":0,"octave":3}}}
        })).unwrap(),
    }).unwrap();
    assert_ne!(original.tablature,changed.tablature);assert_eq!(changed.undo_depth,1);
    let undo=locked(&state).unwrap().edit(ScoreEditRequest{
        workspace_id:workspace.clone(),request_id:Uuid::new_v4().to_string(),document_id:changed.document_id.clone(),
        expected_version:changed.document_version,action:ScoreEditAction::Undo,
    }).unwrap();
    assert_eq!(undo.notation,original.notation);assert_eq!(undo.tablature,original.tablature);
    let redo=locked(&state).unwrap().edit(ScoreEditRequest{
        workspace_id:workspace.clone(),request_id:Uuid::new_v4().to_string(),document_id:undo.document_id.clone(),
        expected_version:undo.document_version,action:ScoreEditAction::Redo,
    }).unwrap();
    assert_eq!(redo.notation,changed.notation);assert_eq!(redo.tablature,changed.tablature);
    let path=root.join("guitar-dual.bgp.json");
    let saved=persist_selected_file(&state,&workspace,path.clone(),&expected(&redo)).unwrap();
    assert_saved_session(&saved, &redo);assert_eq!(saved.saved_version,redo.document_version);
    let encoded=read_document(&path).unwrap();
    locked(&state).unwrap().close(&workspace).unwrap();
    let reopened=locked(&state).unwrap().import_file(workspace.clone(),&encoded,path).unwrap();
    assert_eq!(reopened.session.notation,changed.notation);assert_eq!(reopened.session.tablature,changed.tablature);
    assert_eq!(reopened.session.undo_depth,0);assert_eq!(reopened.saved_version,0);
    drop(state);std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn public_guitar_position_survives_history_guarded_physical_save_and_reopen() {
    let (root, state, workspace, _) = fixture();
    let mut legacy: serde_json::Value = serde_json::from_str(
        include_str!("../application/official_domains/guitar-document.json")).unwrap();
    legacy["extensions"][0]["schemaVersion"] = serde_json::json!(1);
    legacy["extensions"][0]["payload"]["fretCount"] = serde_json::json!(24);
    let original = locked(&state).unwrap().import_document(workspace.clone(),
        &legacy.to_string()).unwrap();
    let mut current = original.clone();
    let mut edit = |action: serde_json::Value| {
        current = locked(&state).unwrap().edit(ScoreEditRequest {
            workspace_id: workspace.clone(), request_id: Uuid::new_v4().to_string(),
            document_id: current.document_id.clone(), expected_version: current.document_version,
            action: serde_json::from_value(action).unwrap(),
        }).unwrap();
        current.clone()
    };
    let changed = edit(serde_json::json!({"kind":"set-fretted-position","partId":"part-1","eventId":"event-a",
        "position":{"stringNumber":6,"fret":67}}));
    assert_eq!(changed.undo_depth, 1);
    assert!(matches!(changed.notation, NotationView::Unsupported { .. }));
    assert!(matches!(changed.tablature, crate::dto::TablatureProjection::Tablature { .. }));
    let undo = edit(serde_json::json!({"kind":"undo"}));
    assert_eq!(undo.notation, original.notation); assert_eq!(undo.tablature, original.tablature);
    let redo = edit(serde_json::json!({"kind":"redo"}));
    assert_eq!(redo.notation, changed.notation); assert_eq!(redo.tablature, changed.tablature);
    let path = root.join("guitar-position.bgp.json");
    let saved = persist_selected_file(&state, &workspace, path.clone(), &expected(&redo)).unwrap();
    assert_saved_session(&saved, &redo); assert_eq!(saved.saved_version, redo.document_version);
    let encoded = read_document(&path).unwrap();
    let raw: serde_json::Value = serde_json::from_str(&encoded).unwrap();
    assert_eq!(raw["extensions"][0]["payload"]["placements"][0],
        serde_json::json!({"noteId":"note-a","stringNumber":6,"fret":67}));
    assert_eq!(raw["extensions"][0]["schemaVersion"], serde_json::json!(2));
    assert_eq!(raw["extensions"][0]["payload"]["fretCount"], serde_json::json!(24));
    assert_eq!(raw["parts"][0]["measureContents"][0]["voices"][0]["sequence"]["events"][0]["content"]["notes"][0]["writtenPitch"],
        serde_json::json!({"step":"B","alter":0,"octave":8}));
    locked(&state).unwrap().close(&workspace).unwrap();
    let reopened = locked(&state).unwrap().import_file(workspace.clone(), &encoded, path).unwrap();
    assert_eq!(reopened.session.notation, redo.notation); assert_eq!(reopened.session.tablature, redo.tablature);
    assert_eq!(reopened.session.undo_depth, 0); assert_eq!(reopened.session.redo_depth, 0);
    assert_eq!(reopened.saved_version, 0);
    drop(state); std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn measure_structure_survives_history_guarded_disk_save_and_reopen() {
    let (root, state, workspace, mut current) = fixture();
    let original = match &current.notation {
        NotationView::Staff { measures, .. } => measures[0].id.clone(),
        _ => panic!("staff"),
    };
    let mut edit = |action: serde_json::Value| {
        current = locked(&state)
            .unwrap()
            .edit(ScoreEditRequest {
                workspace_id: workspace.clone(),
                request_id: Uuid::new_v4().to_string(),
                document_id: current.document_id.clone(),
                expected_version: current.document_version,
                action: serde_json::from_value(action).unwrap(),
            })
            .unwrap();
        current.clone()
    };
    let inserted = edit(
        serde_json::json!({ "kind": "insert-measure", "measureId": original, "position": "after" }),
    );
    let inserted_id = match &inserted.notation {
        NotationView::Staff { measures, .. } => measures[1].id.clone(),
        _ => panic!("staff"),
    };
    edit(
        serde_json::json!({ "kind": "append", "measureId": inserted_id, "anchor": { "kind": "start" },
        "duration": { "base": 4, "dots": 0 }, "content": { "kind": "note", "pitch": { "step": "F", "octave": 4, "alter": 1 } } }),
    );
    let configured = edit(
        serde_json::json!({ "kind": "set-measure-meter", "measureId": inserted_id,
        "meter": { "numerator": 3, "denominator": 4 }, "scope": "measure" }),
    );
    let deleted = edit(serde_json::json!({ "kind": "remove-measure", "measureId": original }));
    assert_eq!(deleted.measure_count, 1);
    assert_eq!(
        edit(serde_json::json!({ "kind": "undo" })).notation,
        configured.notation
    );
    let final_score = edit(serde_json::json!({ "kind": "redo" }));
    assert_eq!(final_score.notation, deleted.notation);
    let path = root.join("measure-structure.bgp.json");
    let saved =
        persist_selected_file(&state, &workspace, path.clone(), &expected(&final_score)).unwrap();
    assert_eq!(saved.saved_version, final_score.document_version);
    assert_eq!(saved.session.notation, final_score.notation);
    let bytes = read_document(&path).unwrap();
    locked(&state).unwrap().close(&workspace).unwrap();
    let reopened = locked(&state)
        .unwrap()
        .import_document(workspace.clone(), &bytes)
        .unwrap();
    assert_eq!(reopened.notation, final_score.notation);
    assert_eq!(reopened.undo_depth, 0);
    let NotationView::Staff { measures, .. } = &reopened.notation else {
        panic!("staff")
    };
    assert_eq!(
        measures[0].meter,
        crate::dto::Meter {
            numerator: 3,
            denominator: 4
        }
    );
    assert_eq!(measures[0].events.len(), 1);
    drop(state);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn guarded_save_is_physical_and_reopens_with_the_saved_business_document() {
    let (root, state, workspace, initial) = fixture();
    let changed = locked(&state)
        .unwrap()
        .edit(ScoreEditRequest {
            workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(),
            document_id: initial.document_id,
            expected_version: initial.document_version,
            action: ScoreEditAction::SetTempo { tempo_bpm: 144.0 },
        })
        .unwrap();
    let path = root.join("saved.bgp.json");
    let accepted =
        persist_selected_file(&state, &workspace, path.clone(), &expected(&changed)).unwrap();
    assert_eq!(accepted.saved_version, changed.document_version);
    assert_saved_session(&accepted, &changed);
    assert!(accepted.warnings.is_empty());
    assert_eq!(state.recent_documents.list().unwrap().entries.len(), 1);
    assert_eq!(
        locked(&state).unwrap().file_path(&workspace).unwrap(),
        Some(path.clone())
    );
    let encoded = read_document(&path).unwrap();
    assert!(locked(&state).unwrap().close(&workspace).unwrap());
    let reopened = locked(&state)
        .unwrap()
        .import_document(workspace.clone(), &encoded)
        .unwrap();
    assert_eq!(reopened.notation, changed.notation);
    assert_eq!(reopened.document_id, changed.document_id);
    // A reopened file is a new clean session; the saved notation is preserved,
    // while the in-memory edit version/history deliberately is not serialized.
    assert_eq!(reopened.document_version, 0);
    assert_eq!(reopened.undo_depth, 0);
    drop(state);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn edited_note_properties_survive_history_guarded_disk_save_and_reopen() {
    use crate::dto::{
        EventDuration, EventProperties, InputContent, InputPitch, InputSequenceAnchor,
        NotationView, PitchStep,
    };
    let (root, state, workspace, initial) = fixture();
    let appended = locked(&state)
        .unwrap()
        .edit(ScoreEditRequest {
            workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(),
            document_id: initial.document_id.clone(),
            expected_version: initial.document_version,
            action: ScoreEditAction::Append {
                measure_id: "measure-1".into(),
                anchor: InputSequenceAnchor::Start,
                offset_units: Some(0),
                duration: EventDuration { base: 4, dots: 0 },
                content: InputContent::Note {
                    pitch: InputPitch {
                        step: PitchStep::C,
                        octave: 4,
                        alter: 0,
                    },
                },
            },
        })
        .unwrap();
    let event_id = match &appended.notation {
        NotationView::Staff { measures, .. } => measures[0].events[0].id.clone(),
        _ => panic!("Expected staff"),
    };
    let properties = EventProperties {
        duration: EventDuration { base: 8, dots: 1 },
        content: InputContent::Note {
            pitch: InputPitch {
                step: PitchStep::D,
                octave: 5,
                alter: -1,
            },
        },
    };
    let changed = locked(&state)
        .unwrap()
        .edit(ScoreEditRequest {
            workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(),
            document_id: appended.document_id.clone(),
            expected_version: appended.document_version,
            action: ScoreEditAction::SetEventProperties {
                event_id: event_id.clone(),
                properties: properties.clone(),
            },
        })
        .unwrap();
    match &changed.notation {
        NotationView::Staff { measures, .. } => {
            assert_eq!(measures[0].events[0].id, event_id);
            assert_eq!(measures[0].events[0].duration, properties.duration);
            assert_eq!(measures[0].events[0].content, properties.content);
        }
        _ => panic!("Expected staff"),
    }
    let undone = locked(&state)
        .unwrap()
        .edit(ScoreEditRequest {
            workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(),
            document_id: changed.document_id.clone(),
            expected_version: changed.document_version,
            action: ScoreEditAction::Undo,
        })
        .unwrap();
    assert_eq!(undone.notation, appended.notation);
    let redone = locked(&state)
        .unwrap()
        .edit(ScoreEditRequest {
            workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(),
            document_id: undone.document_id.clone(),
            expected_version: undone.document_version,
            action: ScoreEditAction::Redo,
        })
        .unwrap();
    assert_eq!(redone.notation, changed.notation);
    let path = root.join("edited-properties.bgp.json");
    let saved =
        persist_selected_file(&state, &workspace, path.clone(), &expected(&redone)).unwrap();
    assert_eq!(saved.saved_version, redone.document_version);
    let encoded = read_document(&path).unwrap();
    assert!(locked(&state).unwrap().close(&workspace).unwrap());
    let reopened = locked(&state)
        .unwrap()
        .import_document(workspace, &encoded)
        .unwrap();
    assert_eq!(reopened.notation, redone.notation);
    assert_eq!(reopened.document_id, redone.document_id);
    assert_eq!(reopened.undo_depth, 0);
    drop(state);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn stale_version_or_replaced_identity_cannot_overwrite_disk_or_change_file_path() {
    let (root, state, workspace, initial) = fixture();
    let path = root.join("retained.bgp.json");
    std::fs::write(&path, b"keep-existing-bytes").unwrap();
    let changed = locked(&state)
        .unwrap()
        .edit(ScoreEditRequest {
            workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(),
            document_id: initial.document_id.clone(),
            expected_version: initial.document_version,
            action: ScoreEditAction::SetTempo { tempo_bpm: 120.0 },
        })
        .unwrap();
    assert_eq!(
        persist_selected_file(&state, &workspace, path.clone(), &expected(&initial))
            .unwrap_err()
            .status,
        409
    );
    assert_eq!(std::fs::read(&path).unwrap(), b"keep-existing-bytes");
    assert_eq!(locked(&state).unwrap().file_path(&workspace).unwrap(), None);
    let replacement = locked(&state)
        .unwrap()
        .create(CreateScoreRequest {
            workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(),
            expected_document_id: Some(changed.document_id),
            input: NewScoreInput {
                title: "另一作品".into(),
                measure_count: 1,
            },
        })
        .unwrap();
    assert_eq!(replacement.document_version, initial.document_version);
    assert_ne!(replacement.document_id, initial.document_id);
    assert_eq!(
        persist_selected_file(&state, &workspace, path.clone(), &expected(&initial))
            .unwrap_err()
            .status,
        409
    );
    assert_eq!(std::fs::read(&path).unwrap(), b"keep-existing-bytes");
    assert_eq!(
        locked(&state).unwrap().read(&workspace).unwrap(),
        Some(replacement)
    );
    assert_eq!(locked(&state).unwrap().file_path(&workspace).unwrap(), None);
    assert_eq!(
        persist_selected_file(
            &state,
            &workspace,
            path,
            &DocumentReplacementPrecondition::Empty {}
        )
        .unwrap_err()
        .status,
        400
    );
    drop(state);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn failed_physical_write_preserves_the_document_and_recovery() {
    let (root, state, workspace, initial) = fixture();
    schedule_current_recovery(&state, &locked(&state).unwrap(), &workspace);
    state.recovery.flush(state.recovery_path(&workspace)).unwrap();
    let recovery = state.recovery_path(&workspace);
    let before = std::fs::read(&recovery).unwrap();
    let blocked = root.join("is-a-directory");
    std::fs::create_dir(&blocked).unwrap();
    assert!(persist_selected_file(&state, &workspace, blocked, &expected(&initial)).is_err());
    assert_eq!(
        locked(&state).unwrap().read(&workspace).unwrap(),
        Some(initial)
    );
    assert_eq!(locked(&state).unwrap().file_path(&workspace).unwrap(), None);
    assert_eq!(std::fs::read(&recovery).unwrap(), before);
    assert!(state.recent_documents.list().unwrap().entries.is_empty());
    drop(state);
    std::fs::remove_dir_all(root).unwrap();
}

#[cfg(windows)]
#[test]
fn cleanup_and_recent_failures_are_post_commit_warnings_not_a_failed_save() {
    use std::os::windows::fs::OpenOptionsExt;
    let (root, state, workspace, initial) = fixture();
    let path = root.join("saved.bgp.json");
    persist_selected_file(&state, &workspace, path.clone(), &expected(&initial)).unwrap();
    let catalog = root.join("recovery/config/recent-documents.v1.json");
    let held = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(catalog)
        .unwrap();
    let recovery = state.recovery_path(&workspace);
    std::fs::create_dir_all(&recovery).unwrap();
    let accepted =
        persist_selected_file(&state, &workspace, path.clone(), &expected(&initial)).unwrap();
    assert_eq!(accepted.saved_version, initial.document_version);
    assert_eq!(
        accepted
            .warnings
            .iter()
            .map(|item| item.code.as_str())
            .collect::<Vec<_>>(),
        vec!["file.recovery-unavailable", "file.recent-unavailable"]
    );
    assert_eq!(
        locked(&state).unwrap().file_path(&workspace).unwrap(),
        Some(path.clone())
    );
    assert!(!read_document(&path).unwrap().is_empty());
    drop(held);
    std::fs::remove_dir(&recovery).unwrap();
    assert_eq!(
        record_current_file(&state, &workspace, &expected(&initial))
            .unwrap()
            .entries
            .len(),
        1
    );
    drop(state);
    std::fs::remove_dir_all(root).unwrap();
}
