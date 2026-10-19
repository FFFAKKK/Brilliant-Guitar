use super::*;
use std::path::{Path, PathBuf};

fn fixture() -> (PathBuf, AppState, String) {
    let root = std::env::temp_dir().join(format!("brilliant-recent-commands-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    (
        root.clone(),
        AppState::new(root.join("recovery")),
        Uuid::new_v4().to_string(),
    )
}
fn write_piece(state: &AppState, root: &Path, name: &str) -> PathBuf {
    let workspace = Uuid::new_v4().to_string();
    locked(state)
        .unwrap()
        .create(CreateScoreRequest {
            workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(),
            expected_document_id: None,
            input: crate::dto::NewScoreInput {
                title: name.into(),
                measure_count: 1,
            },
        })
        .unwrap();
    let path = root.join(format!("{name}.json"));
    std::fs::write(
        &path,
        locked(state).unwrap().export_document(&workspace).unwrap(),
    )
    .unwrap();
    path
}
fn expected(state: &AppState, workspace: &str) -> DocumentReplacementPrecondition {
    match locked(state).unwrap().read(workspace).unwrap() {
        None => DocumentReplacementPrecondition::Empty {},
        Some(value) => DocumentReplacementPrecondition::Document {
            document_id: value.document_id,
            document_version: value.document_version,
        },
    }
}

#[test]
fn accepted_files_register_and_id_open_is_guarded_without_deleting_projects() {
    let (root, state, workspace) = fixture();
    let a = write_piece(&state, &root, "A");
    let b = write_piece(&state, &root, "B");
    let first = accept_opened_file(
        &state,
        workspace.clone(),
        a.clone(),
        Some(&expected(&state, &workspace)),
    )
    .unwrap();
    assert!(first.warnings.is_empty());
    let a_id = state.recent_documents.list().unwrap().entries[0].id.clone();
    let second = accept_opened_file(
        &state,
        workspace.clone(),
        b.clone(),
        Some(&expected(&state, &workspace)),
    )
    .unwrap();
    let before = state.recent_documents.list().unwrap();
    assert_eq!(before.entries[0].name, "B");
    assert_eq!(before.entries[1].id, a_id);
    assert_eq!(
        open_recent_file(
            &state,
            workspace.clone(),
            &a_id,
            &DocumentReplacementPrecondition::Empty {}
        )
        .unwrap_err()
        .status,
        409
    );
    assert_eq!(state.recent_documents.list().unwrap(), before);
    assert_eq!(
        locked(&state).unwrap().read(&workspace).unwrap(),
        Some(second.session)
    );
    let opened = open_recent_file(
        &state,
        workspace.clone(),
        &a_id,
        &expected(&state, &workspace),
    )
    .unwrap();
    assert_eq!(opened.session.title, "A");
    assert_eq!(state.recent_documents.list().unwrap().entries[0].id, a_id);
    let retained = state.recent_documents.list().unwrap();
    let retained_doc = locked(&state).unwrap().read(&workspace).unwrap();
    std::fs::write(&a, b"bad project").unwrap();
    assert!(
        open_recent_file(
            &state,
            workspace.clone(),
            &a_id,
            &expected(&state, &workspace)
        )
        .is_err()
    );
    std::fs::remove_file(&a).unwrap();
    assert!(
        open_recent_file(
            &state,
            workspace.clone(),
            &a_id,
            &expected(&state, &workspace)
        )
        .is_err()
    );
    assert_eq!(state.recent_documents.list().unwrap(), retained);
    assert_eq!(
        locked(&state).unwrap().read(&workspace).unwrap(),
        retained_doc
    );
    let b_bytes = std::fs::read(&b).unwrap();
    let b_id = retained.entries[1].id.clone();
    state.recent_documents.remove(&b_id).unwrap();
    assert_eq!(std::fs::read(b).unwrap(), b_bytes);
    assert_eq!(
        open_recent_file(
            &state,
            workspace,
            &b_id,
            &expected(&state, &Uuid::new_v4().to_string())
        )
        .unwrap_err()
        .status,
        409
    );
    drop(state);
    std::fs::remove_dir_all(root).unwrap();
}

#[cfg(windows)]
#[test]
fn post_acceptance_failures_are_warnings_and_registration_retry_does_not_reimport() {
    use std::os::windows::fs::OpenOptionsExt;
    let (root, state, workspace) = fixture();
    let a = write_piece(&state, &root, "A");
    let b = write_piece(&state, &root, "B");
    accept_opened_file(
        &state,
        workspace.clone(),
        a,
        Some(&expected(&state, &workspace)),
    )
    .unwrap();
    let old = state.recent_documents.list().unwrap();
    let catalog = root.join("recovery/config/recent-documents.v1.json");
    let held = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&catalog)
        .unwrap();
    let recovery = state.recovery_path(&workspace);
    std::fs::create_dir_all(&recovery).unwrap();
    let accepted = accept_opened_file(
        &state,
        workspace.clone(),
        b,
        Some(&expected(&state, &workspace)),
    )
    .unwrap();
    assert_eq!(accepted.session.title, "B");
    assert_eq!(accepted.warnings.len(), 2);
    let wire = serde_json::to_value(&accepted).unwrap();
    assert_eq!(wire["warnings"][0]["severity"], "warning");
    assert_eq!(wire["warnings"][0]["code"], "file.recovery-unavailable");
    assert_eq!(wire["warnings"][1]["code"], "file.recent-unavailable");
    assert_eq!(
        locked(&state).unwrap().read(&workspace).unwrap(),
        Some(accepted.session.clone())
    );
    drop(held);
    assert_eq!(state.recent_documents.list().unwrap(), old);
    std::fs::remove_dir(&recovery).unwrap();
    let before = locked(&state).unwrap().export_document(&workspace).unwrap();
    let retried = record_current_file(&state, &workspace, &expected(&state, &workspace)).unwrap();
    assert_eq!(retried.entries[0].name, "B");
    assert_eq!(retried.entries[1].id, old.entries[0].id);
    assert_eq!(
        locked(&state).unwrap().export_document(&workspace).unwrap(),
        before
    );
    assert!(!recovery.exists());
    assert_eq!(
        record_current_file(
            &state,
            &workspace,
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
fn fresh_host_lists_recent_files_and_opens_by_id_without_an_intermediate_score() {
    let (root, state, workspace) = fixture();
    let a = write_piece(&state, &root, "A");
    accept_opened_file(
        &state,
        workspace.clone(),
        a,
        Some(&expected(&state, &workspace)),
    )
    .unwrap();
    let listed = state.recent_documents.list().unwrap();
    drop(state);
    let restarted = AppState::new(root.join("recovery"));
    assert_eq!(restarted.recent_documents.list().unwrap(), listed);
    assert_eq!(locked(&restarted).unwrap().read(&workspace).unwrap(), None);
    let opened = open_recent_file(
        &restarted,
        workspace.clone(),
        &listed.entries[0].id,
        &DocumentReplacementPrecondition::Empty {},
    )
    .unwrap();
    assert_eq!(opened.session.title, "A");
    let missing = Uuid::new_v4().to_string();
    assert_eq!(
        open_recent_file(
            &restarted,
            workspace.clone(),
            &missing,
            &expected(&restarted, &workspace)
        )
        .unwrap_err()
        .status,
        404
    );
    drop(restarted);
    std::fs::remove_dir_all(root).unwrap();
}
