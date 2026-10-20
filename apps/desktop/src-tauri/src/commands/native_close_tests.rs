use super::*;
use crate::dto::{NewScoreInput, ScoreEditAction};
use crate::native_close::{
    NativeClosePrecondition, close_error, close_precondition, finish_window_close,
    request_window_close,
};
use std::{fs, path::PathBuf};

fn fixture() -> (PathBuf, AppState, String) {
    let root = std::env::temp_dir().join(format!("brilliant-lifecycle-{}", Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let state = AppState::new(root.join("recovery"));
    (root, state, Uuid::new_v4().to_string())
}

fn create(state: &AppState, workspace: &str, title: &str) -> ScoreSessionRead {
    change_document(state, workspace, |service| {
        service.create(CreateScoreRequest {
            workspace_id: workspace.into(),
            request_id: Uuid::new_v4().to_string(),
            expected_document_id: None,
            input: NewScoreInput {
                title: title.into(),
                measure_count: 1,
            },
        })
    })
    .unwrap()
}

// Model native acceptance and Destroyed separately; production no longer clears
// a document just because a close request returned.
fn close_confirmed_document(state: &AppState, workspace: &str) -> Result<bool, HostError> {
    let Some(session) = locked(state)?.read(workspace)? else {
        return Ok(false);
    };
    request_window_close(
        state,
        workspace,
        workspace,
        &close_precondition(Some(&session))?,
        || Ok(()),
    )?;
    finish_window_close(state, workspace)?;
    Ok(true)
}

#[test]
fn native_close_preserves_document_until_destroyed_and_blocks_late_mutations() {
    let (root, state, workspace) = fixture();
    let created = create(&state, &workspace, "close");
    let expected = close_precondition(Some(&created)).unwrap();
    let path = state.recovery_path(&workspace);
    request_window_close(&state, "main", &workspace, &expected, || Ok(())).unwrap();
    assert!(path.is_file());
    assert!(locked(&state).unwrap().read(&workspace).unwrap().is_some());
    assert!(read_or_recover(&state, &workspace).is_err());
    let error = change_document(&state, &workspace, |_| panic!("late mutation ran")).unwrap_err();
    assert_eq!(error.issue.unwrap().code, "file.workspace-closing");
    assert!(
        locked_workspace(&state, &workspace).is_err(),
        "Save/Open must share the gate"
    );
    request_window_close(&state, "main", &workspace, &expected, || Ok(())).unwrap();
    finish_window_close(&state, "unrelated").unwrap();
    assert!(path.is_file());
    finish_window_close(&state, "main").unwrap();
    assert!(!path.exists());
    assert!(locked(&state).unwrap().read(&workspace).unwrap().is_none());
    assert!(
        read_or_recover(&state, &workspace).is_err(),
        "late reads cannot recover a closed workspace"
    );
    assert!(change_document(&state, &workspace, |_| panic!("recreated after destroy")).is_err());
    finish_window_close(&state, "main").unwrap();
    drop(state);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejected_native_dispatch_retains_data_and_allows_retry() {
    let (root, state, workspace) = fixture();
    let created = create(&state, &workspace, "retry");
    let expected = close_precondition(Some(&created)).unwrap();
    assert!(
        request_window_close(&state, "main", &workspace, &expected, || {
            Err(close_error(
                "file.close-failed",
                "synthetic dispatch failure",
            ))
        })
        .is_err()
    );
    assert!(state.recovery_path(&workspace).is_file());
    assert!(read_or_recover(&state, &workspace).unwrap().is_some());
    assert!(locked_workspace(&state, &workspace).is_ok());
    request_window_close(&state, "main", &workspace, &expected, || Ok(())).unwrap();
    // A later failed retry cannot reopen editing while the first request is queued.
    assert!(
        request_window_close(&state, "main", &workspace, &expected, || {
            Err(close_error("file.close-failed", "synthetic retry failure"))
        })
        .is_err()
    );
    assert!(locked_workspace(&state, &workspace).is_err());
    finish_window_close(&state, "main").unwrap();
    drop(state);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn stale_close_confirmation_cannot_discard_edits_or_a_same_id_reopen() {
    let (root, state, workspace) = fixture();
    let created = create(&state, &workspace, "original");
    let expected = close_precondition(Some(&created)).unwrap();
    let json = locked(&state).unwrap().export_document(&workspace).unwrap();
    change_document(&state, &workspace, |service| {
        service.edit(ScoreEditRequest {
            workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(),
            document_id: created.document_id.clone(),
            expected_version: created.document_version,
            action: ScoreEditAction::SetTitle {
                title: "new edit".into(),
            },
        })
    })
    .unwrap();
    assert!(
        request_window_close(&state, "main", &workspace, &expected, || panic!(
            "stale close dispatched"
        ))
        .is_err()
    );
    let reopened = change_document(&state, &workspace, |service| {
        service.import_document(workspace.clone(), &json)
    })
    .unwrap();
    assert_eq!(reopened.document_id, created.document_id);
    assert_eq!(reopened.document_version, created.document_version);
    assert!(
        request_window_close(&state, "main", &workspace, &expected, || panic!(
            "reopened session closed"
        ))
        .is_err()
    );
    assert!(close_confirmed_document(&state, &workspace).unwrap());
    drop(state);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn recovery_failure_prevents_native_dispatch_without_locking_out_retry() {
    let (root, state, workspace) = fixture();
    let created = create(&state, &workspace, "recovery");
    let path = state.recovery_path(&workspace);
    state.recovery.remove(path.clone()).unwrap();
    fs::create_dir(&path).unwrap();
    assert!(
        request_window_close(
            &state,
            "main",
            &workspace,
            &close_precondition(Some(&created)).unwrap(),
            || panic!("destroy without recovery")
        )
        .is_err()
    );
    assert!(locked_workspace(&state, &workspace).is_ok());
    fs::remove_dir(&path).unwrap();
    assert!(close_confirmed_document(&state, &workspace).unwrap());
    drop(state);
    fs::remove_dir_all(root).unwrap();
}

#[test]
#[cfg(windows)]
fn post_destroy_cleanup_failure_retains_the_confirmed_recovery_snapshot() {
    use std::os::windows::fs::OpenOptionsExt;
    let (root, state, workspace) = fixture();
    let created = create(&state, &workspace, "confirmed");
    request_window_close(
        &state,
        "main",
        &workspace,
        &close_precondition(Some(&created)).unwrap(),
        || Ok(()),
    )
    .unwrap();
    let path = state.recovery_path(&workspace);
    let snapshot = fs::read(&path).unwrap();
    let held = fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&path)
        .unwrap();
    assert!(finish_window_close(&state, "main").is_err());
    assert_eq!(fs::read(&path).unwrap(), snapshot);
    assert!(locked(&state).unwrap().read(&workspace).unwrap().is_none());
    drop(held);
    finish_window_close(&state, "main").unwrap();
    assert!(!path.exists());
    drop(state);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn empty_windows_can_close_but_unread_recovery_cannot_be_discarded() {
    let (root, state, workspace) = fixture();
    let donor = Uuid::new_v4().to_string();
    create(&state, &donor, "recover me");
    let json = locked(&state).unwrap().export_document(&donor).unwrap();
    assert!(
        request_window_close(
            &state,
            "main",
            &workspace,
            &NativeClosePrecondition::Empty {},
            || panic!("unknown workspace closed a live document")
        )
        .is_err()
    );
    assert!(close_confirmed_document(&state, &donor).unwrap());
    fs::write(state.recovery_path(&workspace), json).unwrap();
    assert!(
        request_window_close(
            &state,
            "main",
            &workspace,
            &NativeClosePrecondition::Empty {},
            || panic!("discarded unread recovery")
        )
        .is_err()
    );
    fs::remove_file(state.recovery_path(&workspace)).unwrap();
    request_window_close(
        &state,
        "main",
        &workspace,
        &NativeClosePrecondition::Empty {},
        || Ok(()),
    )
    .unwrap();
    finish_window_close(&state, "main").unwrap();
    assert!(locked(&state).unwrap().is_empty());
    drop(state);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn unconfirmed_destruction_does_not_clean_recovery() {
    let (root, state, workspace) = fixture();
    create(&state, &workspace, "keep");
    let path = state.recovery_path(&workspace);
    state.recovery.flush(path.clone()).unwrap();
    finish_window_close(&state, "main").unwrap();
    assert!(path.is_file());
    assert!(locked(&state).unwrap().read(&workspace).unwrap().is_some());
    assert!(close_confirmed_document(&state, &workspace).unwrap());
    drop(state);
    fs::remove_dir_all(root).unwrap();
}
