use std::sync::MutexGuard;

use serde::Deserialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::{
    DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult,
};

use crate::{
    application::ScoreSessionService,
    dto::{
        DocumentReplacementPrecondition, ScoreSessionRead, WorkbenchIssueSource,
        WorkbenchIssueTarget,
    },
    error::HostError,
    state::AppState,
};

/// This guard belongs to the new window-close protocol, not legacy document close.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum NativeClosePrecondition {
    Empty {},
    #[serde(rename_all = "camelCase")]
    Document {
        session_id: String,
        document_id: String,
        document_version: u64,
    },
}

pub(crate) fn close_precondition(
    session: Option<&ScoreSessionRead>,
) -> Result<NativeClosePrecondition, HostError> {
    match session {
        None => Ok(NativeClosePrecondition::Empty {}),
        Some(session) => Ok(NativeClosePrecondition::Document {
            session_id: session
                .persistence
                .as_ref()
                .ok_or_else(HostError::internal)?
                .session_id
                .clone(),
            document_id: session.document_id.clone(),
            document_version: session.document_version,
        }),
    }
}

pub(crate) fn close_error(code: &str, message: &str) -> HostError {
    HostError::issue(
        code,
        message,
        409,
        WorkbenchIssueSource::Host,
        WorkbenchIssueTarget::Workbench,
        Some(true),
    )
}

// Lock order everywhere: service, then closing_workspaces. Keep the service
// guard until the actual workspace operation finishes.
pub(crate) fn workspace_is_closing(
    state: &AppState,
    workspace_id: &str,
) -> Result<bool, HostError> {
    Ok(state
        .closing_workspaces
        .lock()
        .map_err(|_| HostError::internal())?
        .values()
        .any(|workspace| workspace == workspace_id))
}

pub(crate) fn locked_workspace<'a>(
    state: &'a AppState,
    workspace_id: &str,
) -> Result<MutexGuard<'a, ScoreSessionService>, HostError> {
    let service = state.service.lock().map_err(|_| HostError::internal())?;
    if workspace_is_closing(state, workspace_id)? {
        return Err(close_error(
            "file.workspace-closing",
            "工作区正在关闭，无法继续操作",
        ));
    }
    Ok(service)
}

fn check_close(
    service: &ScoreSessionService,
    workspace_id: &str,
    expected: &NativeClosePrecondition,
) -> Result<Option<ScoreSessionRead>, HostError> {
    let current = service.read(workspace_id)?;
    if &close_precondition(current.as_ref())? != expected {
        return Err(close_error(
            "file.close-stale",
            "乐谱已发生变化，请重新确认关闭",
        ));
    }
    Ok(current)
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum CloseDecision {
    Save,
    Discard,
    Cancel,
}

fn dialog_decision(result: MessageDialogResult) -> CloseDecision {
    match result {
        MessageDialogResult::Yes => CloseDecision::Save,
        MessageDialogResult::No => CloseDecision::Discard,
        MessageDialogResult::Custom(label) if label == "保存" => CloseDecision::Save,
        MessageDialogResult::Custom(label) if label == "不保存" => CloseDecision::Discard,
        _ => CloseDecision::Cancel,
    }
}

fn needs_close_confirmation(session: &ScoreSessionRead) -> bool {
    // Kernel import starts a clean history, but an autosave recovery/imported
    // document with no physical file checkpoint is still unsaved user work.
    session
        .persistence
        .as_ref()
        .is_none_or(|persistence| persistence.saved_version.is_none() || persistence.dirty)
}

// Runs on a command worker; native dialogs must never block Tauri's UI thread.
#[tauri::command(async)]
pub fn workbench_close_window_guarded_v1(
    app: AppHandle,
    window: tauri::Window,
    state: State<'_, AppState>,
    workspace_id: String,
    expected: NativeClosePrecondition,
) -> Result<bool, HostError> {
    if window.label() != "main" {
        return Err(close_error("file.close-window", "当前窗口不是工作区窗口"));
    }
    close_with_confirmation(
        &state,
        window.label(),
        &workspace_id,
        &expected,
        || {
            dialog_decision(
                app.dialog()
                    .message("当前乐谱有未保存的更改，关闭前要保存吗？")
                    .title("关闭 Brilliant Guitar")
                    .kind(MessageDialogKind::Warning)
                    .parent(&window)
                    .buttons(MessageDialogButtons::YesNoCancelCustom(
                        "保存".into(),
                        "不保存".into(),
                        "取消".into(),
                    ))
                    .blocking_show_with_result(),
            )
        },
        |session, snapshot| {
            let save_expected = DocumentReplacementPrecondition::Document {
                document_id: session.document_id.clone(),
                document_version: session.document_version,
            };
            crate::commands::save_snapshot(
                &app,
                &state,
                &workspace_id,
                &session.title,
                false,
                &save_expected,
                snapshot,
            )
            .map(|result| result.is_some())
        },
        || {
            window
                .destroy()
                .map_err(|_| close_error("file.close-failed", "无法关闭窗口，请重试"))
        },
    )
}

// Only the OS interactions are replaceable in unit tests; capture, identity
// checks, recovery and finalization always use the production service.
fn close_with_confirmation(
    state: &AppState,
    window_label: &str,
    workspace_id: &str,
    expected: &NativeClosePrecondition,
    confirm: impl FnOnce() -> CloseDecision,
    save: impl FnOnce(&ScoreSessionRead, &crate::application::SaveSnapshot) -> Result<bool, HostError>,
    destroy: impl FnOnce() -> Result<(), HostError>,
) -> Result<bool, HostError> {
    let prepared = {
        let service = locked_workspace(state, workspace_id)?;
        let current = check_close(&service, workspace_id, expected)?;
        current
            .map(|session| {
                let snapshot = service.export_snapshot(workspace_id)?;
                Ok::<_, HostError>((session, snapshot))
            })
            .transpose()?
    };
    if let Some((session, snapshot)) = prepared
        && needs_close_confirmation(&session)
    {
        match confirm() {
            CloseDecision::Cancel => return Ok(false),
            CloseDecision::Discard => {}
            CloseDecision::Save => {
                if !save(&session, &snapshot)? {
                    return Ok(false);
                }
            }
        }
    }
    request_window_close(state, window_label, workspace_id, expected, destroy)?;
    Ok(true)
}

pub(crate) fn request_window_close(
    state: &AppState,
    window_label: &str,
    workspace_id: &str,
    expected: &NativeClosePrecondition,
    destroy: impl FnOnce() -> Result<(), HostError>,
) -> Result<(), HostError> {
    let service = state.service.lock().map_err(|_| HostError::internal())?;
    let current = check_close(&service, workspace_id, expected)?;
    let mut closing = state
        .closing_workspaces
        .lock()
        .map_err(|_| HostError::internal())?;
    if let Some(workspace) = closing.get(window_label) {
        if workspace != workspace_id {
            return Err(close_error(
                "file.workspace-closing",
                "窗口已在关闭另一个工作区",
            ));
        }
        // A failed resend cannot revoke an already accepted native dispatch.
        return destroy();
    }
    if closing.values().any(|workspace| workspace == workspace_id) {
        return Err(close_error(
            "file.workspace-closing",
            "工作区已在另一个窗口关闭",
        ));
    }
    let path = state.recovery_path(workspace_id);
    if current.is_some() {
        state
            .recovery
            .schedule(path.clone(), service.export_document(workspace_id)?)?;
        state.recovery.flush(path)?;
    } else if !service.is_empty() || crate::document_io::read_recovery(&path)?.is_some() {
        return Err(close_error(
            "file.close-stale",
            "尚有待恢复的乐谱，请读取后再关闭",
        ));
    }
    closing.insert(window_label.into(), workspace_id.into());
    if let Err(error) = destroy() {
        closing.remove(window_label);
        return Err(error);
    }
    Ok(())
}

pub(crate) fn finish_window_close(state: &AppState, window_label: &str) -> Result<(), HostError> {
    let mut service = state.service.lock().map_err(|_| HostError::internal())?;
    let closing = state
        .closing_workspaces
        .lock()
        .map_err(|_| HostError::internal())?;
    let Some(workspace_id) = closing.get(window_label) else {
        // Unconfirmed destruction/crash leaves the recovery copy intact.
        return Ok(());
    };
    let cleanup = state.recovery.remove(state.recovery_path(workspace_id));
    service.close(workspace_id)?;
    // Retain the tombstone: late reads must not resurrect recovery after destroy.
    cleanup
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (std::path::PathBuf, AppState, String, ScoreSessionRead) {
        let root =
            std::env::temp_dir().join(format!("brilliant-close-decision-{}", uuid::Uuid::new_v4()));
        let state = AppState::new(root.join("recovery"));
        let workspace = uuid::Uuid::new_v4().to_string();
        let session = state
            .service
            .lock()
            .unwrap()
            .create(crate::dto::CreateScoreRequest {
                workspace_id: workspace.clone(),
                request_id: uuid::Uuid::new_v4().to_string(),
                expected_document_id: None,
                input: crate::dto::NewScoreInput {
                    title: "Unsaved fixture".into(),
                    measure_count: 1,
                },
            })
            .unwrap();
        (root, state, workspace, session)
    }

    #[test]
    fn dialog_results_keep_cancel_and_unknown_labels_safe() {
        assert_eq!(
            dialog_decision(MessageDialogResult::Yes),
            CloseDecision::Save
        );
        assert_eq!(
            dialog_decision(MessageDialogResult::Custom("保存".into())),
            CloseDecision::Save
        );
        assert_eq!(
            dialog_decision(MessageDialogResult::No),
            CloseDecision::Discard
        );
        assert_eq!(
            dialog_decision(MessageDialogResult::Custom("不保存".into())),
            CloseDecision::Discard
        );
        for result in [
            MessageDialogResult::Cancel,
            MessageDialogResult::Ok,
            MessageDialogResult::Custom("取消".into()),
            MessageDialogResult::Custom("unknown".into()),
        ] {
            assert_eq!(dialog_decision(result), CloseDecision::Cancel);
        }
    }

    #[test]
    fn close_protocol_rejects_absent_or_extra_identity_fields() {
        for bad in [
            serde_json::json!({}),
            serde_json::json!({"kind": "empty", "documentId": "hidden"}),
            serde_json::json!({"kind": "document", "documentId": "a", "documentVersion": 0}),
            serde_json::json!({"kind": "document", "sessionId": "s", "documentId": "a", "documentVersion": 0, "discard": true}),
        ] {
            assert!(serde_json::from_value::<NativeClosePrecondition>(bad).is_err());
        }
    }

    #[test]
    fn recovered_clean_history_without_a_physical_checkpoint_still_needs_confirmation() {
        let workspace = uuid::Uuid::new_v4().to_string();
        let mut service = ScoreSessionService::default();
        service
            .create(crate::dto::CreateScoreRequest {
                workspace_id: workspace.clone(),
                request_id: uuid::Uuid::new_v4().to_string(),
                expected_document_id: None,
                input: crate::dto::NewScoreInput {
                    title: "Recovered work".into(),
                    measure_count: 1,
                },
            })
            .unwrap();
        let json = service.export_document(&workspace).unwrap();
        let mut recovered = service.import_document(workspace, &json).unwrap();
        assert!(!recovered.persistence.as_ref().unwrap().dirty);
        assert!(needs_close_confirmation(&recovered));
        recovered.persistence.as_mut().unwrap().saved_version = Some(0);
        assert!(!needs_close_confirmation(&recovered));
        recovered.persistence.as_mut().unwrap().dirty = true;
        assert!(needs_close_confirmation(&recovered));
    }

    #[test]
    fn cancel_does_not_dispatch_and_discard_retains_recovery_until_destroyed() {
        let (root, state, workspace, session) = fixture();
        let expected = close_precondition(Some(&session)).unwrap();
        assert!(
            !close_with_confirmation(
                &state,
                "main",
                &workspace,
                &expected,
                || CloseDecision::Cancel,
                |_, _| panic!("cancel saved"),
                || panic!("cancel destroyed")
            )
            .unwrap()
        );
        assert_eq!(
            state.service.lock().unwrap().read(&workspace).unwrap(),
            Some(session.clone())
        );
        assert!(!workspace_is_closing(&state, &workspace).unwrap());
        assert!(
            close_with_confirmation(
                &state,
                "main",
                &workspace,
                &expected,
                || CloseDecision::Discard,
                |_, _| panic!("discard saved"),
                || Ok(())
            )
            .unwrap()
        );
        assert!(state.recovery_path(&workspace).is_file());
        assert_eq!(
            state.service.lock().unwrap().read(&workspace).unwrap(),
            Some(session)
        );
        finish_window_close(&state, "main").unwrap();
        assert!(!state.recovery_path(&workspace).exists());
        drop(state);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn save_cancel_and_failure_keep_work_but_success_saves_the_original_snapshot_before_dispatch() {
        let (root, state, workspace, session) = fixture();
        let expected = close_precondition(Some(&session)).unwrap();
        let original = state
            .service
            .lock()
            .unwrap()
            .export_document(&workspace)
            .unwrap();
        assert!(
            !close_with_confirmation(
                &state,
                "main",
                &workspace,
                &expected,
                || CloseDecision::Save,
                |_, _| Ok(false),
                || panic!("picker cancelled")
            )
            .unwrap()
        );
        assert!(
            close_with_confirmation(
                &state,
                "main",
                &workspace,
                &expected,
                || CloseDecision::Save,
                |_, _| Err(HostError::new("synthetic save failure", 503)),
                || panic!("failed save dispatched")
            )
            .is_err()
        );
        assert_eq!(
            state.service.lock().unwrap().read(&workspace).unwrap(),
            Some(session.clone())
        );
        assert!(!workspace_is_closing(&state, &workspace).unwrap());
        let file = root.join("saved.bgp.json");
        assert!(
            close_with_confirmation(
                &state,
                "main",
                &workspace,
                &expected,
                || CloseDecision::Save,
                |captured, snapshot| {
                    assert_eq!(captured, &session);
                    state
                        .service
                        .lock()
                        .unwrap()
                        .save_file(&workspace, file.clone(), snapshot)?;
                    Ok(true)
                },
                || {
                    assert_eq!(std::fs::read_to_string(&file).unwrap(), original);
                    Ok(())
                }
            )
            .unwrap()
        );
        assert!(state.recovery_path(&workspace).is_file());
        finish_window_close(&state, "main").unwrap();
        assert_eq!(std::fs::read_to_string(file).unwrap(), original);
        drop(state);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn modal_reopen_cannot_make_save_recapture_or_overwrite_the_old_target() {
        let (root, state, workspace, session) = fixture();
        let expected = close_precondition(Some(&session)).unwrap();
        let original = state
            .service
            .lock()
            .unwrap()
            .export_document(&workspace)
            .unwrap();
        let target = root.join("keep.bgp.json");
        std::fs::write(&target, b"keep existing target").unwrap();
        let result = close_with_confirmation(
            &state,
            "main",
            &workspace,
            &expected,
            || {
                state
                    .service
                    .lock()
                    .unwrap()
                    .import_document(workspace.clone(), &original)
                    .unwrap();
                CloseDecision::Save
            },
            |_, snapshot| {
                state
                    .service
                    .lock()
                    .unwrap()
                    .save_file(&workspace, target.clone(), snapshot)
                    .map(|_| true)
            },
            || panic!("closed the reopened instance"),
        );
        assert_eq!(result.unwrap_err().issue.unwrap().code, "file.save-stale");
        assert_eq!(std::fs::read(target).unwrap(), b"keep existing target");
        assert!(!workspace_is_closing(&state, &workspace).unwrap());
        assert_ne!(
            state
                .service
                .lock()
                .unwrap()
                .read(&workspace)
                .unwrap()
                .unwrap()
                .persistence,
            session.persistence
        );
        drop(state);
        std::fs::remove_dir_all(root).unwrap();
    }
}
