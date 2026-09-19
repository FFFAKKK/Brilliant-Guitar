use std::sync::Arc;

use tauri::{AppHandle, State, ipc::Channel};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use crate::{
    agent_credential::{AgentCredentialStoreError, AgentProviderCredentialStatusV1},
    agent_provider::{
        AgentProviderDecideRequestV1, AgentProviderDecisionEnvelopeV1, AgentProviderError,
        AgentProviderProgressObserver, AgentProviderStreamEventV1,
    },
    agent_store::{
        AgentRunRecoverySummaryV1, AgentRunStoreCommitInputV1, AgentRunStoreCommitResultV1,
        AgentRunStoreEntryV1,
    },
    capability::{CapabilityCaller, CapabilityInvocation, CapabilityResult},
    capability_receipt::{CapabilityReceiptBeginV1, CapabilityReceiptLookupV1},
    diagnostics::{PluginDiagnosticInput, PluginDiagnosticRecord},
    document_io::{
        atomic_write, normalize_save_path, prepare_recovery_path, quarantine_recovery,
        read_document, read_recovery,
    },
    dto::{
        CapabilityTransportRequest, CreateScoreRequest, NativeFileResult, ScoreEditRequest,
        ScoreSessionRead,
    },
    error::HostError,
    settings::{ApplicationSettingsSnapshotV1, ApplicationSettingsV1},
    state::AppState,
    workspace_configuration::{WorkspaceConfigurationSnapshotV1, WorkspaceConfigurationV1},
};
use zeroize::Zeroizing;

#[tauri::command]
pub fn workbench_agent_run_load_v1(
    state: State<'_, AppState>,
    run_id: String,
) -> Result<Option<AgentRunStoreEntryV1>, HostError> {
    state.agent_runs.load(&run_id).map_err(agent_store_error)
}

#[tauri::command]
pub fn workbench_agent_run_commit_v1(
    state: State<'_, AppState>,
    input: AgentRunStoreCommitInputV1,
) -> Result<AgentRunStoreCommitResultV1, HostError> {
    state.agent_runs.commit(input).map_err(agent_store_error)
}

#[tauri::command]
pub fn workbench_agent_run_list_recoverable_v1(
    state: State<'_, AppState>,
) -> Result<Vec<AgentRunRecoverySummaryV1>, HostError> {
    state
        .agent_runs
        .list_recoverable()
        .map_err(agent_store_error)
}

#[tauri::command]
pub fn workbench_agent_run_quarantine_v1(
    state: State<'_, AppState>,
    run_id: String,
) -> Result<bool, HostError> {
    state
        .agent_runs
        .quarantine(&run_id)
        .map_err(agent_store_error)
}

fn agent_store_error(error: std::io::Error) -> HostError {
    match error.kind() {
        std::io::ErrorKind::InvalidInput => settings_error(
            "agent-store.invalid-run-id",
            "Agent Run 标识无效",
            422,
            false,
        ),
        std::io::ErrorKind::InvalidData => settings_error(
            "agent-store.corrupt-record",
            "Agent Run 记录损坏，已安全隔离",
            409,
            false,
        ),
        _ => settings_error(
            "agent-store.unavailable",
            "暂时无法访问 Agent Run 记录",
            503,
            true,
        ),
    }
}

#[tauri::command(async)]
pub fn workbench_agent_provider_credential_status_v1(
    state: State<'_, AppState>,
    provider_id: String,
) -> Result<AgentProviderCredentialStatusV1, HostError> {
    let present = state
        .agent_credentials
        .status(&provider_id)
        .map_err(agent_credential_error)?;
    Ok(AgentProviderCredentialStatusV1::new(provider_id, present))
}

#[tauri::command(async)]
pub fn workbench_agent_provider_set_credential_v1(
    state: State<'_, AppState>,
    provider_id: String,
    secret: String,
) -> Result<AgentProviderCredentialStatusV1, HostError> {
    let secret = Zeroizing::new(secret);
    state
        .agent_credentials
        .set(&provider_id, secret.as_str())
        .map_err(agent_credential_error)?;
    Ok(AgentProviderCredentialStatusV1::new(provider_id, true))
}

#[tauri::command(async)]
pub fn workbench_agent_provider_delete_credential_v1(
    state: State<'_, AppState>,
    provider_id: String,
) -> Result<AgentProviderCredentialStatusV1, HostError> {
    state
        .agent_credentials
        .delete(&provider_id)
        .map_err(agent_credential_error)?;
    Ok(AgentProviderCredentialStatusV1::new(provider_id, false))
}

#[tauri::command]
pub async fn workbench_agent_provider_decide_v1(
    state: State<'_, AppState>,
    request: AgentProviderDecideRequestV1,
    progress: Channel<AgentProviderStreamEventV1>,
) -> Result<AgentProviderDecisionEnvelopeV1, HostError> {
    let run_id = request.run_id.clone();
    let turn_id = request.turn_id.clone();
    let cancellation = state
        .agent_provider_cancellations
        .begin(&run_id, &turn_id)
        .map_err(agent_provider_error)?;
    let secret = state
        .agent_credentials
        .read_secret(&request.provider_id)
        .map_err(agent_credential_error)
        .and_then(|value| {
            value.ok_or_else(|| agent_provider_error(AgentProviderError::AuthenticationRequired))
        });
    let observer = Some(Arc::new(move |event| {
        let _ = progress.send(event);
    }) as AgentProviderProgressObserver);
    let result = match secret {
        Ok(secret) => tokio::select! {
            result = state.agent_providers.decide_with_observer(secret.as_str(), request, observer) => result,
            () = cancellation.notified() => Err(AgentProviderError::Cancelled),
        },
        Err(error) => {
            state
                .agent_provider_cancellations
                .complete(&run_id, &turn_id);
            return Err(error);
        }
    };
    state
        .agent_provider_cancellations
        .complete(&run_id, &turn_id);
    result.map_err(agent_provider_error)
}

#[tauri::command]
pub fn workbench_agent_provider_cancel_v1(
    state: State<'_, AppState>,
    run_id: String,
    turn_id: String,
) -> Result<bool, HostError> {
    state
        .agent_provider_cancellations
        .cancel(&run_id, &turn_id)
        .map_err(agent_provider_error)
}

fn agent_credential_error(error: AgentCredentialStoreError) -> HostError {
    match error {
        AgentCredentialStoreError::InvalidProviderId => settings_error(
            "agent-credential.invalid-provider",
            "模型 Provider 标识无效",
            422,
            false,
        ),
        AgentCredentialStoreError::InvalidSecret => settings_error(
            "agent-credential.invalid-secret",
            "Provider 凭据格式无效",
            422,
            false,
        ),
        AgentCredentialStoreError::Unavailable => settings_error(
            "agent-credential.unavailable",
            "系统凭据库当前不可用",
            503,
            true,
        ),
    }
}

fn agent_provider_error(error: AgentProviderError) -> HostError {
    let (code, message, status, retryable) = match error {
        AgentProviderError::InvalidRequest => (
            "agent-provider.invalid-request",
            "模型 Provider 请求无效",
            422,
            false,
        ),
        AgentProviderError::AuthenticationRequired => (
            "agent-provider.authentication-required",
            "OpenAI API Key 缺失或无效",
            401,
            false,
        ),
        AgentProviderError::Timeout => (
            "agent-provider.timeout",
            "模型 Provider 请求超时",
            504,
            true,
        ),
        AgentProviderError::RateLimited => (
            "agent-provider.rate-limited",
            "模型 Provider 当前请求过多，请稍后重试",
            429,
            true,
        ),
        AgentProviderError::ModelUnavailable => (
            "agent-provider.model-unavailable",
            "所选模型当前不可用或项目无权访问",
            404,
            false,
        ),
        AgentProviderError::ProviderUnavailable => (
            "agent-provider.unavailable",
            "模型 Provider 当前不可用",
            503,
            true,
        ),
        AgentProviderError::RequestRejected => (
            "agent-provider.request-rejected",
            "模型 Provider 拒绝了本次请求",
            422,
            false,
        ),
        AgentProviderError::ResponseIncomplete => (
            "agent-provider.response-incomplete",
            "模型 Provider 未完成本回合决策",
            502,
            true,
        ),
        AgentProviderError::ResponseInvalid => (
            "agent-provider.response-invalid",
            "模型 Provider 返回了无法验证的决策",
            502,
            false,
        ),
        AgentProviderError::ResponseTooLarge => (
            "agent-provider.response-too-large",
            "模型 Provider 响应超过安全限制",
            502,
            false,
        ),
        AgentProviderError::Cancelled => (
            "agent-provider.cancelled",
            "模型 Provider 请求已取消",
            499,
            false,
        ),
    };
    settings_error(code, message, status, retryable)
}

#[tauri::command]
pub fn workbench_invoke_capability_v1(
    state: State<'_, AppState>,
    request: CapabilityTransportRequest,
) -> Result<CapabilityResult, HostError> {
    let invocation = CapabilityInvocation::from_transport(request, CapabilityCaller::Ui);
    let service = locked(state.inner())?;
    Ok(crate::capability::invoke(&service, invocation))
}

#[tauri::command]
pub fn workbench_agent_invoke_capability_v1(
    state: State<'_, AppState>,
    request: CapabilityTransportRequest,
) -> Result<CapabilityResult, HostError> {
    let invocation = CapabilityInvocation::from_transport(request, CapabilityCaller::Agent);
    if Uuid::parse_str(&invocation.invocation_id).is_err() {
        return Ok(CapabilityResult::Rejected {
            invocation_id: invocation.invocation_id,
            capability_id: invocation.capability_id,
            contract_version: invocation.contract_version,
            code: "capability.invalid-invocation-id".into(),
            message: "调用标识无效".into(),
        });
    }
    match state
        .capability_receipts
        .begin(&invocation)
        .map_err(capability_receipt_error)?
    {
        CapabilityReceiptBeginV1::Replay(result) => return Ok(result),
        CapabilityReceiptBeginV1::Pending => {
            return Ok(CapabilityResult::Unavailable {
                invocation_id: invocation.invocation_id,
                capability_id: invocation.capability_id,
                contract_version: invocation.contract_version,
                code: "capability.outcome-pending".into(),
                message: "原能力调用结果仍在核对中".into(),
            });
        }
        CapabilityReceiptBeginV1::Started => {}
    }
    let service = locked(state.inner())?;
    let result = crate::capability::invoke(&service, invocation.clone());
    drop(service);
    state
        .capability_receipts
        .resolve(&invocation, result.clone())
        .map_err(capability_receipt_error)?;
    Ok(result)
}

#[tauri::command]
pub fn workbench_agent_invocation_receipt_v1(
    state: State<'_, AppState>,
    request: CapabilityTransportRequest,
) -> Result<CapabilityReceiptLookupV1, HostError> {
    let invocation = CapabilityInvocation::from_transport(request, CapabilityCaller::Agent);
    state
        .capability_receipts
        .lookup(&invocation)
        .map_err(capability_receipt_error)
}

fn capability_receipt_error(error: std::io::Error) -> HostError {
    match error.kind() {
        std::io::ErrorKind::InvalidInput => settings_error(
            "capability-receipt.invalid-invocation-id",
            "能力调用标识无效",
            422,
            false,
        ),
        std::io::ErrorKind::InvalidData => settings_error(
            "capability-receipt.identity-conflict",
            "能力调用回执与原调用不一致",
            409,
            false,
        ),
        _ => settings_error(
            "capability-receipt.unavailable",
            "暂时无法访问能力调用回执",
            503,
            true,
        ),
    }
}

#[tauri::command]
pub fn workbench_read_workspace_configuration_v1(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceConfigurationSnapshotV1, HostError> {
    state
        .workspace_configuration
        .read(&workspace_id)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::InvalidInput {
                return settings_error(
                    "workspace-config.invalid-workspace",
                    "工作区标识无效",
                    422,
                    false,
                );
            }
            settings_error(
                "workspace-config.read-failed",
                "无法读取工作区配置",
                503,
                true,
            )
        })
}

#[tauri::command]
pub fn workbench_write_workspace_configuration_v1(
    state: State<'_, AppState>,
    workspace_id: String,
    configuration: WorkspaceConfigurationV1,
) -> Result<WorkspaceConfigurationV1, HostError> {
    state
        .workspace_configuration
        .write(&workspace_id, configuration)
        .map_err(|error| {
            if matches!(
                error.kind(),
                std::io::ErrorKind::InvalidData | std::io::ErrorKind::InvalidInput
            ) {
                return settings_error(
                    "workspace-config.invalid",
                    "工作区配置格式无效",
                    422,
                    false,
                );
            }
            settings_error(
                "workspace-config.write-failed",
                "无法保存工作区配置",
                503,
                true,
            )
        })
}

#[tauri::command]
pub fn workbench_reset_workspace_configuration_v1(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceConfigurationV1, HostError> {
    state
        .workspace_configuration
        .reset(&workspace_id)
        .map_err(|_| {
            settings_error(
                "workspace-config.write-failed",
                "无法恢复默认工作区配置",
                503,
                true,
            )
        })
}

#[tauri::command]
pub fn workbench_read_settings_v1(
    state: State<'_, AppState>,
) -> Result<ApplicationSettingsSnapshotV1, HostError> {
    state.settings.read().map_err(|_| {
        settings_error(
            "config.read-failed",
            "无法读取应用配置，当前设置未更改",
            503,
            true,
        )
    })
}

#[tauri::command]
pub fn workbench_write_settings_v1(
    state: State<'_, AppState>,
    settings: ApplicationSettingsV1,
) -> Result<ApplicationSettingsV1, HostError> {
    state.settings.write(settings).map_err(|error| {
        if matches!(
            error.kind(),
            std::io::ErrorKind::InvalidData | std::io::ErrorKind::InvalidInput
        ) {
            return settings_error("config.invalid", "应用配置格式无效", 422, false);
        }
        settings_error("config.write-failed", "无法保存应用配置", 503, true)
    })
}

#[tauri::command]
pub fn workbench_reset_settings_v1(
    state: State<'_, AppState>,
) -> Result<ApplicationSettingsV1, HostError> {
    state
        .settings
        .reset()
        .map_err(|_| settings_error("config.write-failed", "无法恢复默认应用配置", 503, true))
}

fn settings_error(code: &str, message: &str, status: u16, retryable: bool) -> HostError {
    HostError::issue(
        code,
        message,
        status,
        crate::dto::WorkbenchIssueSource::Host,
        crate::dto::WorkbenchIssueTarget::Workbench,
        Some(retryable),
    )
}

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
