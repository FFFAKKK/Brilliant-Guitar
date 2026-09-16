use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::{
    diagnostics::{PluginDiagnosticInput, PluginDiagnosticRecord},
    document_io::{
        atomic_write, normalize_save_path, prepare_recovery_path, quarantine_recovery,
        read_document, read_recovery,
    },
    dto::{CreateScoreRequest, NativeFileResult, ScoreEditRequest, ScoreSessionRead},
    error::HostError,
    state::AppState,
};

#[tauri::command]
pub fn workbench_plugin_diagnostic_v1(
    state: State<'_, AppState>,
    diagnostic: PluginDiagnosticInput,
) -> Result<PluginDiagnosticRecord, HostError> {
    state.diagnostics.append(diagnostic).map_err(|error| {
        if error.kind() == std::io::ErrorKind::InvalidInput {
            return HostError::issue(
                "host.diagnostics-invalid",
                "插件诊断记录格式无效",
                422,
                crate::dto::WorkbenchIssueSource::Host,
                crate::dto::WorkbenchIssueTarget::Workbench,
                Some(false),
            );
        }
        HostError::issue(
            "host.diagnostics-write-failed",
            "无法保存插件诊断记录",
            503,
            crate::dto::WorkbenchIssueSource::Host,
            crate::dto::WorkbenchIssueTarget::Workbench,
            Some(true),
        )
    })
}

#[tauri::command]
pub fn workbench_read_plugin_diagnostics_v1(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<PluginDiagnosticRecord>, HostError> {
    state.diagnostics.list(limit.unwrap_or(128)).map_err(|_| {
        HostError::issue(
            "host.diagnostics-read-failed",
            "无法读取插件诊断记录",
            503,
            crate::dto::WorkbenchIssueSource::Host,
            crate::dto::WorkbenchIssueTarget::Workbench,
            Some(true),
        )
    })
}

fn locked(
    state: &AppState,
) -> Result<std::sync::MutexGuard<'_, crate::application::ScoreSessionService>, HostError> {
    state.service.lock().map_err(|_| HostError::internal())
}

fn read_or_recover(
    state: &AppState,
    workspace_id: &str,
) -> Result<Option<ScoreSessionRead>, HostError> {
    if let Some(session) = locked(state)?.read(workspace_id)? {
        return Ok(Some(session));
    }
    let recovery_path = state.recovery_path(workspace_id);
    let recovery = match read_recovery(&recovery_path) {
        Ok(value) => value,
        Err(error) => {
            if quarantine_recovery(&recovery_path).is_ok() {
                return Err(invalid_recovery());
            }
            return Err(error);
        }
    };
    let Some(document_json) = recovery else {
        return Ok(None);
    };
    match locked(state)?.import_document(workspace_id.to_owned(), &document_json) {
        Ok(session) => Ok(Some(session)),
        Err(_) => {
            quarantine_recovery(&recovery_path)?;
            Err(invalid_recovery())
        }
    }
}

#[tauri::command]
pub fn workbench_read_v1(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Option<ScoreSessionRead>, HostError> {
    read_or_recover(state.inner(), &workspace_id)
}

#[tauri::command]
pub fn workbench_create_v1(
    state: State<'_, AppState>,
    request: CreateScoreRequest,
) -> Result<ScoreSessionRead, HostError> {
    let workspace_id = request.workspace_id.clone();
    let session = locked(state.inner())?.create(request)?;
    schedule_current_recovery(state.inner(), &workspace_id);
    Ok(session)
}

#[tauri::command]
pub fn workbench_edit_v1(
    state: State<'_, AppState>,
    request: ScoreEditRequest,
) -> Result<ScoreSessionRead, HostError> {
    let workspace_id = request.workspace_id.clone();
    let session = locked(state.inner())?.edit(request)?;
    schedule_current_recovery(state.inner(), &workspace_id);
    Ok(session)
}

#[tauri::command]
pub fn workbench_export_v1(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<String, HostError> {
    locked(state.inner())?.export_document(&workspace_id)
}

#[tauri::command]
pub fn workbench_import_v1(
    state: State<'_, AppState>,
    workspace_id: String,
    document_json: String,
) -> Result<ScoreSessionRead, HostError> {
    let session = locked(state.inner())?.import_document(workspace_id.clone(), &document_json)?;
    schedule_current_recovery(state.inner(), &workspace_id);
    Ok(session)
}

#[tauri::command]
pub fn workbench_close_v1(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<bool, HostError> {
    locked(state.inner())?.read(&workspace_id)?;
    state.recovery.flush()?;
    state.recovery.remove(state.recovery_path(&workspace_id))?;
    let closed = locked(state.inner())?.close(&workspace_id)?;
    Ok(closed)
}

#[tauri::command]
pub async fn workbench_open_file_v1(
    app: AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Option<NativeFileResult>, HostError> {
    let Some(selected) = app
        .dialog()
        .file()
        .set_title("打开 Brilliant Guitar 乐谱")
        .add_filter("Brilliant Guitar 项目", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| HostError::new("无法访问所选文件", 422))?;
    let document_json = read_document(&path)?;
    let result = locked(state.inner())?.import_file(workspace_id.clone(), &document_json, path)?;
    state.recovery.remove(state.recovery_path(&workspace_id))?;
    Ok(Some(result))
}

#[tauri::command]
pub async fn workbench_save_file_v1(
    app: AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
    suggested_name: String,
    save_as: bool,
) -> Result<Option<NativeFileResult>, HostError> {
    let existing = locked(state.inner())?.file_path(&workspace_id)?;
    let path = if !save_as && let Some(path) = existing {
        path
    } else {
        let file_name = sanitize_file_name(&suggested_name);
        let Some(selected) = app
            .dialog()
            .file()
            .set_title(if save_as {
                "乐谱另存为"
            } else {
                "保存乐谱"
            })
            .set_file_name(format!("{file_name}.bgp.json"))
            .add_filter("Brilliant Guitar 项目", &["json"])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        normalize_save_path(
            selected
                .into_path()
                .map_err(|_| HostError::new("无法访问所选保存位置", 422))?,
        )
    };
    let (document_json, saved_version) = locked(state.inner())?.export_snapshot(&workspace_id)?;
    atomic_write(&path, document_json.as_bytes())?;
    let result = locked(state.inner())?.mark_saved(&workspace_id, path, saved_version)?;
    if result.session.document_version == result.saved_version {
        state.recovery.remove(state.recovery_path(&workspace_id))?;
    }
    Ok(Some(result))
}

fn schedule_current_recovery(state: &AppState, workspace_id: &str) {
    let Ok(document_json) = locked(state).and_then(|service| service.export_document(workspace_id))
    else {
        return;
    };
    let path = state.recovery_path(workspace_id);
    if prepare_recovery_path(&path).is_err() {
        return;
    }
    let _ = state.recovery.schedule(path, document_json);
}

fn sanitize_file_name(value: &str) -> String {
    let cleaned = value
        .chars()
        .map(|character| {
            if matches!(
                character,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
            ) || character.is_control()
            {
                ' '
            } else {
                character
            }
        })
        .collect::<String>();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let cleaned = cleaned.trim_end_matches(['.', ' ']);
    if cleaned.is_empty() {
        "未命名乐谱".into()
    } else {
        cleaned.chars().take(80).collect()
    }
}

fn invalid_recovery() -> HostError {
    HostError::issue(
        "file.recovery-invalid",
        "自动恢复文件已损坏并安全隔离，请重试进入工作区",
        422,
        crate::dto::WorkbenchIssueSource::File,
        crate::dto::WorkbenchIssueTarget::Component {
            component_id: "navigation.file".into(),
        },
        Some(true),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dto::{CreateScoreRequest, NewScoreInput};
    use uuid::Uuid;

    #[test]
    fn a_fresh_app_state_recovers_the_previous_process_document() {
        let recovery_root =
            std::env::temp_dir().join(format!("brilliant-recovery-restart-{}", Uuid::new_v4()));
        let workspace_id = Uuid::new_v4().to_string();
        let original = AppState::new(recovery_root.clone());
        let created = locked(&original)
            .expect("lock original state")
            .create(CreateScoreRequest {
                workspace_id: workspace_id.clone(),
                input: NewScoreInput {
                    title: "跨启动恢复".into(),
                    measure_count: 2,
                },
                request_id: Uuid::new_v4().to_string(),
                expected_document_id: None,
            })
            .expect("create recoverable score");
        schedule_current_recovery(&original, &workspace_id);
        original.recovery.flush().expect("persist recovery file");

        let restarted = AppState::new(recovery_root.clone());
        let recovered = read_or_recover(&restarted, &workspace_id)
            .expect("read recovery")
            .expect("recovered session");

        assert_eq!(recovered.document_id, created.document_id);
        assert_eq!(recovered.document_version, created.document_version);
        assert_eq!(recovered.title, "跨启动恢复");
        assert_eq!(recovered.measure_count, 2);

        restarted
            .recovery
            .remove(restarted.recovery_path(&workspace_id))
            .expect("remove recovery file");
        std::fs::remove_dir_all(recovery_root).expect("remove recovery directory");
    }
}
