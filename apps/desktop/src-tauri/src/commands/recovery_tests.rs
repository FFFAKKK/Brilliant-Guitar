use super::*;
use crate::dto::{CapabilityDocumentPrecondition, NewScoreInput, ScoreEditAction};
use std::{fs, path::{Path, PathBuf}};

fn app_state(root: &Path) -> AppState {
    AppState::with_paths(
        root.join("recovery"), root.join("config/settings.v1.json"),
        root.join("config/workspaces"), root.join("agent/runs"), root.join("agent/receipts"),
    ).unwrap()
}

fn fixture() -> (PathBuf, AppState, String) {
    let root = std::env::temp_dir().join(format!("brilliant-recovery-order-{}", Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let state = app_state(&root);
    (root, state, Uuid::new_v4().to_string())
}

fn create(state: &AppState, workspace: &str, title: &str) -> ScoreSessionRead {
    change_document(state, workspace, |service| {
        service.create(CreateScoreRequest {
            workspace_id: workspace.into(),
            request_id: Uuid::new_v4().to_string(),
            expected_document_id: None,
            input: NewScoreInput { title: title.into(), measure_count: 1 },
        })
    }).unwrap()
}

fn expected(session: &ScoreSessionRead) -> DocumentReplacementPrecondition {
    DocumentReplacementPrecondition::Document {
        document_id: session.document_id.clone(),
        document_version: session.document_version,
    }
}

#[test]
fn committed_create_reports_recovery_warning_and_retains_the_snapshot_for_retry() {
    let (root, state, workspace) = fixture();
    fs::write(root.join("recovery"), b"temporary fixture blocker").unwrap();
    let created = create(&state, &workspace, "committed");
    let wire = serde_json::to_value(&created).unwrap();
    assert_eq!(wire["warnings"][0]["code"], "file.recovery-unavailable");
    assert_eq!(wire["warnings"][0]["severity"], "warning");
    assert_eq!(wire["warnings"][0]["source"], "file");
    assert_eq!(read_or_recover(&state, &workspace).unwrap().unwrap().title, "committed");
    let path = state.recovery_path(&workspace);
    assert!(state.recovery.flush(path.clone()).is_err());
    fs::remove_file(root.join("recovery")).unwrap();
    state.recovery.flush(path.clone()).unwrap();
    assert!(read_or_recover(&state, &workspace).unwrap().unwrap().warnings.is_empty());
    assert_eq!(fs::read_to_string(path).unwrap(), locked(&state).unwrap().export_document(&workspace).unwrap());
    assert!(close_document(&state, &workspace).unwrap());
    drop(state);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn capability_mutations_share_recovery_but_queries_and_rejections_do_not_write() {
    let (root, state, workspace) = fixture();
    let initial = create(&state, &workspace, "original");
    let path = state.recovery_path(&workspace);
    state.recovery.remove(path.clone()).unwrap();
    let mut invocation = CapabilityInvocation {
        invocation_id: Uuid::new_v4().to_string(),
        capability_id: "score.read-summary".into(),
        contract_version: 1,
        workspace_id: workspace.clone(),
        document_precondition: None,
        caller: CapabilityCaller::Ui,
        input: serde_json::json!({}),
    };
    assert!(matches!(invoke_with_recovery(&state, invocation.clone()).unwrap(), CapabilityResult::Completed { .. }));
    state.recovery.flush(path.clone()).unwrap();
    assert!(!path.exists());

    invocation.capability_id = "score.update-title".into();
    invocation.document_precondition = Some(CapabilityDocumentPrecondition {
        document_id: initial.document_id, document_version: initial.document_version,
    });
    invocation.input = serde_json::json!({ "title": "Agent edit" });
    assert!(matches!(invoke_with_recovery(&state, invocation.clone()).unwrap(), CapabilityResult::Rejected { .. }));
    state.recovery.flush(path.clone()).unwrap();
    assert!(!path.exists(), "UI permission rejection must not queue a snapshot");

    invocation.caller = CapabilityCaller::Agent;
    assert!(matches!(invoke_with_recovery(&state, invocation.clone()).unwrap(), CapabilityResult::Completed { .. }));
    state.recovery.flush(path.clone()).unwrap();
    let document = locked(&state).unwrap().export_document(&workspace).unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), document);
    assert_eq!(read_or_recover(&state, &workspace).unwrap().unwrap().title, "Agent edit");
    invocation.invocation_id = Uuid::new_v4().to_string();
    invocation.input = serde_json::json!({ "title": "stale edit" });
    assert!(matches!(invoke_with_recovery(&state, invocation).unwrap(), CapabilityResult::Rejected { .. }));
    state.recovery.flush(path.clone()).unwrap();
    assert_eq!(fs::read_to_string(path).unwrap(), document);
    assert!(close_document(&state, &workspace).unwrap());
    drop(state);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn committed_save_cleanup_failure_keeps_the_current_snapshot_and_saved_checkpoint() {
    let (root, state, workspace) = fixture();
    let initial = create(&state, &workspace, "saved");
    let recovery = state.recovery_path(&workspace);
    state.recovery.remove(recovery.clone()).unwrap();
    fs::create_dir(&recovery).unwrap();
    let target = root.join("saved.bgp.json");
    let accepted = persist_selected_file(&state, &workspace, target.clone(), &expected(&initial)).unwrap();
    assert_eq!(accepted.warnings[0].code, "file.recovery-unavailable");
    let persistence = accepted.session.persistence.unwrap();
    assert!(!persistence.dirty);
    assert_eq!(persistence.saved_version, Some(accepted.saved_version));
    assert!(close_document(&state, &workspace).is_err());
    assert!(locked(&state).unwrap().read(&workspace).unwrap().is_some());
    fs::remove_dir(&recovery).unwrap();
    state.recovery.flush(recovery.clone()).unwrap();
    assert_eq!(fs::read_to_string(&recovery).unwrap(), fs::read_to_string(&target).unwrap());
    let retried = persist_selected_file(&state, &workspace, target, &expected(&initial)).unwrap();
    assert!(retried.warnings.is_empty());
    assert!(!recovery.exists());
    assert!(close_document(&state, &workspace).unwrap());
    drop(state);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn failed_open_cleanup_recovers_the_accepted_document_instead_of_its_predecessor() {
    let (root, state, workspace) = fixture();
    let old = create(&state, &workspace, "old");
    let other = Uuid::new_v4().to_string();
    let source = create(&state, &other, "new");
    let document = locked(&state).unwrap().export_document(&other).unwrap();
    assert!(close_document(&state, &other).unwrap());
    let recovery = state.recovery_path(&workspace);
    state.recovery.remove(recovery.clone()).unwrap();
    fs::create_dir(&recovery).unwrap();
    schedule_current_recovery(&state, &locked(&state).unwrap(), &workspace);
    let target = root.join("opened.bgp.json");
    fs::write(&target, &document).unwrap();
    let accepted = accept_opened_file(&state, workspace.clone(), target, Some(&expected(&old))).unwrap();
    assert_eq!(accepted.session.document_id, source.document_id);
    assert_ne!(accepted.session.document_id, old.document_id);
    assert_eq!(accepted.warnings[0].code, "file.recovery-unavailable");
    fs::remove_dir(&recovery).unwrap();
    state.recovery.flush(recovery).unwrap();
    drop(state);
    let restarted = app_state(&root);
    assert_eq!(read_or_recover(&restarted, &workspace).unwrap().unwrap().document_id, source.document_id);
    assert!(close_document(&restarted, &workspace).unwrap());
    drop(restarted);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn closing_one_workspace_does_not_flush_or_fail_on_another_workspace() {
    let (root, state, blocked) = fixture();
    create(&state, &blocked, "blocked");
    let path = state.recovery_path(&blocked);
    state.recovery.remove(path.clone()).unwrap();
    fs::create_dir(&path).unwrap();
    schedule_current_recovery(&state, &locked(&state).unwrap(), &blocked);
    assert!(state.recovery.flush(path.clone()).is_err());
    let other = Uuid::new_v4().to_string();
    create(&state, &other, "other");
    assert!(close_document(&state, &other).unwrap());
    assert!(locked(&state).unwrap().read(&other).unwrap().is_none());
    assert!(locked(&state).unwrap().read(&blocked).unwrap().is_some());
    assert!(state.recovery.status(path.clone()).is_err());
    fs::remove_dir(&path).unwrap();
    assert!(close_document(&state, &blocked).unwrap());
    drop(state);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn failed_cleanup_without_pending_writes_does_not_block_its_own_close_retry() {
    let (root, state, workspace) = fixture();
    create(&state, &workspace, "retry");
    let path = state.recovery_path(&workspace);
    state.recovery.flush(path.clone()).unwrap();
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    assert!(close_document(&state, &workspace).is_err());
    assert!(state.recovery.status(path.clone()).is_err());
    fs::remove_dir(&path).unwrap();
    assert!(close_document(&state, &workspace).unwrap());
    state.recovery.status(path).unwrap();
    assert!(!close_document(&state, &workspace).unwrap());
    drop(state);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn concurrent_edits_queue_the_same_final_document_as_the_service() {
    let (root, state, workspace) = fixture();
    create(&state, &workspace, "initial");
    std::thread::scope(|scope| {
        for worker in 0..4 {
            let state = &state;
            let workspace = &workspace;
            scope.spawn(move || {
                for step in 0..10 {
                    change_document(state, workspace, |service| {
                        let current = service.read(workspace)?.unwrap();
                        service.edit(ScoreEditRequest {
                            workspace_id: workspace.clone(),
                            request_id: Uuid::new_v4().to_string(),
                            document_id: current.document_id,
                            expected_version: current.document_version,
                            action: ScoreEditAction::SetTitle { title: format!("worker-{worker}-{step}") },
                        })
                    }).unwrap();
                }
            });
        }
    });
    let path = state.recovery_path(&workspace);
    state.recovery.flush(path.clone()).unwrap();
    {
        let service = locked(&state).unwrap();
        assert_eq!(service.read(&workspace).unwrap().unwrap().document_version, 40);
        assert_eq!(fs::read_to_string(path).unwrap(), service.export_document(&workspace).unwrap());
    }
    assert!(close_document(&state, &workspace).unwrap());
    drop(state);
    fs::remove_dir_all(root).unwrap();
}
