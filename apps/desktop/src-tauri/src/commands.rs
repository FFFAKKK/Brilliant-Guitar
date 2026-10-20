use std::sync::Arc;

use serde_json::Value;
use tauri::{AppHandle, State, ipc::Channel};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use crate::{
    agent_credential::{AgentCredentialStoreError, AgentProviderCredentialStatusV1},
    agent_provider::{
        AgentModelStreamEnvelopeV1, AgentModelStreamRequestV1, AgentProviderDecideRequestV1,
        AgentProviderDecisionEnvelopeV1, AgentProviderError, AgentProviderProgressObserver,
        AgentProviderStreamEventV1,
    },
    agent_store::{
        AgentRunRecoverySummaryV1, AgentRunStoreCommitInputV1, AgentRunStoreCommitResultV1,
        AgentRunStoreEntryV1,
    },
    capability::{CAPABILITY_CATALOG, CapabilityCaller, CapabilityInvocation, CapabilityKind, CapabilityResult},
    capability_receipt::{CapabilityReceiptBeginV1, CapabilityReceiptLookupV1},
    diagnostics::{PluginDiagnosticInput, PluginDiagnosticRecord},
    document_io::{
        normalize_save_path, quarantine_recovery,
        read_document, read_recovery,
    },
    dto::{
        CapabilityTransportRequest, CreateScoreRequest, DocumentReplacementPrecondition,
        GuardedCreateScoreRequest, NativeFileResult, ScoreEditRequest, ScoreMeasureIndexV1,
        ScoreMeasureRangeV1, ScoreMetadataTransactionChangeSetV1, ScoreMetadataV1,
        ScorePrepareMetadataTransactionInputV1, ScorePrepareTempoChangeInputV1, ScoreSessionRead,
        ScoreStructureV1, ScoreSummaryV1, ScoreTempoChangeSetV1,
    },
    error::HostError,
    recent_documents::RecentDocumentsSnapshotV1,
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
pub async fn workbench_agent_model_stream_v1(
    state: State<'_, AppState>,
    request: AgentModelStreamRequestV1,
    progress: Channel<AgentProviderStreamEventV1>,
) -> Result<AgentModelStreamEnvelopeV1, HostError> {
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
            result = state.agent_providers.stream_model_with_observer(secret.as_str(), request, observer) => result,
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
    invoke_with_recovery(state.inner(), invocation)
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
    let result = invoke_with_recovery(state.inner(), invocation.clone())?;
    state
        .capability_receipts
        .resolve(&invocation, result.clone())
        .map_err(capability_receipt_error)?;
    Ok(result)
}

fn invoke_with_recovery(
    state: &AppState,
    invocation: CapabilityInvocation,
) -> Result<CapabilityResult, HostError> {
    let workspace_id = invocation.workspace_id.clone();
    let mutation = CAPABILITY_CATALOG.iter().any(|descriptor| {
        descriptor.id == invocation.capability_id && descriptor.kind == CapabilityKind::Mutation
    });
    let mut service = locked(state)?;
    let result = crate::capability::invoke(&mut service, invocation);
    if mutation && matches!(result, CapabilityResult::Completed { .. }) {
        // The mutation is already committed. The next session read reports
        // recovery failures; never turn its known success into a replay.
        let _ = schedule_current_recovery(state, &service, &workspace_id);
    }
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

#[tauri::command]
pub fn workbench_read_plugin_activation_v1(
    state: State<'_, AppState>,
) -> Result<Option<Value>, HostError> {
    state.plugin_activation.read().map_err(|_| {
        settings_error(
            "plugin.activation-read-failed",
            "无法读取插件启用配置",
            503,
            true,
        )
    })
}

#[tauri::command]
pub fn workbench_write_plugin_activation_v1(
    state: State<'_, AppState>,
    document: Value,
) -> Result<(), HostError> {
    state.plugin_activation.write(document).map_err(|error| {
        if error.kind() == std::io::ErrorKind::InvalidInput {
            return settings_error(
                "plugin.activation-invalid",
                "插件启用配置格式无效",
                422,
                false,
            );
        }
        settings_error(
            "plugin.activation-write-failed",
            "无法保存插件启用配置",
            503,
            true,
        )
    })
}

#[tauri::command]
pub fn workbench_read_plugin_settings_v1(
    state: State<'_, AppState>,
) -> Result<Option<Value>, HostError> {
    state
        .plugin_settings
        .read()
        .map_err(|_| settings_error("plugin.settings-read-failed", "无法读取插件设置", 503, true))
}

#[tauri::command]
pub fn workbench_write_plugin_settings_v1(
    state: State<'_, AppState>,
    document: Value,
) -> Result<(), HostError> {
    state.plugin_settings.write(document).map_err(|error| {
        if error.kind() == std::io::ErrorKind::InvalidInput {
            return settings_error("plugin.settings-invalid", "插件设置格式无效", 422, false);
        }
        settings_error(
            "plugin.settings-write-failed",
            "无法保存插件设置",
            503,
            true,
        )
    })
}

#[tauri::command]
pub fn workbench_read_plugin_startup_recovery_v1(
    state: State<'_, AppState>,
) -> Result<Option<Value>, HostError> {
    state.plugin_startup_recovery.read().map_err(|_| {
        settings_error(
            "plugin.startup-recovery-read-failed",
            "无法读取插件启动恢复标记",
            503,
            true,
        )
    })
}

#[tauri::command]
pub fn workbench_write_plugin_startup_recovery_v1(
    state: State<'_, AppState>,
    document: Value,
) -> Result<(), HostError> {
    state
        .plugin_startup_recovery
        .write(document)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::InvalidInput {
                return settings_error(
                    "plugin.startup-recovery-invalid",
                    "插件启动恢复标记格式无效",
                    422,
                    false,
                );
            }
            settings_error(
                "plugin.startup-recovery-write-failed",
                "无法保存插件启动恢复标记",
                503,
                true,
            )
        })
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
    let mut service = locked(state)?;
    if let Some(mut session) = service.read(workspace_id)? {
        session.warnings = recovery_status(state, workspace_id).into_iter().collect();
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
    match service.import_document(workspace_id.to_owned(), &document_json) {
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

// Typed score read commands are the host-side implementation of ScoreReadPort.
// They intentionally do not accept capability IDs, caller labels, or a generic
// transport envelope; Agent receipt semantics remain in the separate adapter.
#[tauri::command]
pub fn workbench_score_read_summary_v1(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Option<ScoreSummaryV1>, HostError> {
    locked(state.inner())?.read_summary(&workspace_id)
}

#[tauri::command]
pub fn workbench_score_read_metadata_v1(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Option<ScoreMetadataV1>, HostError> {
    locked(state.inner())?.read_metadata(&workspace_id)
}

#[tauri::command]
pub fn workbench_score_read_structure_v1(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Option<ScoreStructureV1>, HostError> {
    locked(state.inner())?.read_structure(&workspace_id)
}

#[tauri::command]
pub fn workbench_score_read_measure_index_v1(
    state: State<'_, AppState>,
    workspace_id: String,
    expected_document_id: String,
    expected_document_version: u64,
) -> Result<Option<ScoreMeasureIndexV1>, HostError> {
    locked(state.inner())?.read_measure_index(
        &workspace_id,
        &expected_document_id,
        expected_document_version,
    )
}

#[tauri::command]
pub fn workbench_score_read_measure_range_v1(
    state: State<'_, AppState>,
    workspace_id: String,
    start_measure_id: String,
    end_measure_id: String,
    max_measures: usize,
) -> Result<Option<ScoreMeasureRangeV1>, HostError> {
    locked(state.inner())?.read_measure_range(
        &workspace_id,
        start_measure_id,
        end_measure_id,
        max_measures,
    )
}

// ChangeSet preparation is read-only and deterministic, so it can use direct
// typed commands. Commit remains on the Agent capability command because that
// command owns the durable invocation receipt and crash-recovery protocol.
#[tauri::command]
pub fn workbench_score_prepare_tempo_change_v1(
    state: State<'_, AppState>,
    workspace_id: String,
    expected_document_id: String,
    expected_document_version: u64,
    input: ScorePrepareTempoChangeInputV1,
) -> Result<Option<ScoreTempoChangeSetV1>, HostError> {
    locked(state.inner())?.prepare_tempo_change(
        &workspace_id,
        &expected_document_id,
        expected_document_version,
        input.tempo_bpm,
    )
}

#[tauri::command]
pub fn workbench_score_prepare_metadata_transaction_v1(
    state: State<'_, AppState>,
    workspace_id: String,
    expected_document_id: String,
    expected_document_version: u64,
    input: ScorePrepareMetadataTransactionInputV1,
) -> Result<Option<ScoreMetadataTransactionChangeSetV1>, HostError> {
    locked(state.inner())?.prepare_metadata_transaction(
        &workspace_id,
        &expected_document_id,
        expected_document_version,
        input.title,
        input.tempo_bpm,
    )
}

#[tauri::command]
pub fn workbench_create_v1(
    state: State<'_, AppState>,
    request: CreateScoreRequest,
) -> Result<ScoreSessionRead, HostError> {
    let workspace_id = request.workspace_id.clone();
    change_document(state.inner(), &workspace_id, |service| service.create(request))
}

#[tauri::command]
pub fn workbench_create_guarded_v1(
    state: State<'_, AppState>,
    request: GuardedCreateScoreRequest,
) -> Result<ScoreSessionRead, HostError> {
    let workspace_id = request.workspace_id.clone();
    change_document(state.inner(), &workspace_id, |service| service.create_guarded(request))
}

#[tauri::command]
pub fn workbench_edit_v1(
    state: State<'_, AppState>,
    request: ScoreEditRequest,
) -> Result<ScoreSessionRead, HostError> {
    let workspace_id = request.workspace_id.clone();
    change_document(state.inner(), &workspace_id, |service| service.edit(request))
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
    change_document(state.inner(), &workspace_id, |service| {
        service.import_document(workspace_id.clone(), &document_json)
    })
}

#[tauri::command]
pub fn workbench_close_v1(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<bool, HostError> {
    close_document(state.inner(), &workspace_id)
}

fn close_document(state: &AppState, workspace_id: &str) -> Result<bool, HostError> {
    let mut service = locked(state)?;
    service.read(workspace_id)?;
    let path = state.recovery_path(workspace_id);
    state.recovery.flush(path.clone())?;
    state.recovery.remove(path)?;
    service.close(workspace_id)
}

#[tauri::command]
pub async fn workbench_open_file_v1(
    app: AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Option<NativeFileResult>, HostError> {
    open_file(&app, state.inner(), workspace_id, None)
}

#[tauri::command]
pub async fn workbench_open_file_guarded_v1(
    app: AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
    expected: DocumentReplacementPrecondition,
) -> Result<Option<NativeFileResult>, HostError> {
    locked(state.inner())?.check_replacement(&workspace_id, &expected)?;
    open_file(&app, state.inner(), workspace_id, Some(&expected))
}

fn open_file(
    app: &AppHandle,
    state: &AppState,
    workspace_id: String,
    expected: Option<&DocumentReplacementPrecondition>,
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
    accept_opened_file(state, workspace_id, path, expected).map(Some)
}

fn accept_opened_file(
    state: &AppState,
    workspace_id: String,
    path: std::path::PathBuf,
    expected: Option<&DocumentReplacementPrecondition>,
) -> Result<NativeFileResult, HostError> {
    let path = std::fs::canonicalize(path).map_err(|_| {
        HostError::issue(
            "file.io-failed",
            "无法读取所选文件",
            422,
            crate::dto::WorkbenchIssueSource::File,
            crate::dto::WorkbenchIssueTarget::Component {
                component_id: "navigation.file".into(),
            },
            Some(true),
        )
    })?;
    let document_json = read_document(&path)?;
    let mut service = locked(state)?;
    let mut result = match expected {
        Some(expected) => service.import_file_guarded(
            workspace_id.clone(),
            &document_json,
            path.clone(),
            expected,
        )?,
        None => service.import_file(workspace_id.clone(), &document_json, path.clone())?,
    };
    // Queue the accepted replacement before cleanup. A failed removal must
    // retain this document, not a pending snapshot from the replaced document.
    if clear_file_recovery(state, &service, &workspace_id).is_err() {
        result.warnings.push(file_acceptance_warning(
            "file.recovery-unavailable",
            "作品已打开，恢复文件清理尚未完成",
        ));
    }
    if state.recent_documents.record(&path, &result.name).is_err() {
        result.warnings.push(file_acceptance_warning(
            "file.recent-unavailable",
            "作品已打开，最近记录未能更新",
        ));
    }
    Ok(result)
}

fn file_acceptance_warning(code: &str, message: &str) -> crate::dto::WorkbenchIssue {
    crate::dto::WorkbenchIssue {
        code: code.into(),
        message: message.into(),
        severity: crate::dto::WorkbenchIssueSeverity::Warning,
        source: crate::dto::WorkbenchIssueSource::File,
        target: crate::dto::WorkbenchIssueTarget::Component {
            component_id: "navigation.file".into(),
        },
        retryable: Some(code == "file.recent-unavailable"),
    }
}

fn recent_error(error: std::io::Error) -> HostError {
    let status = match error.kind() {
        std::io::ErrorKind::InvalidInput => 400,
        std::io::ErrorKind::InvalidData | std::io::ErrorKind::Unsupported => 422,
        _ => 503,
    };
    HostError::issue(
        "file.recent-unavailable",
        "无法更新或读取最近文件目录",
        status,
        crate::dto::WorkbenchIssueSource::File,
        crate::dto::WorkbenchIssueTarget::Component {
            component_id: "navigation.file".into(),
        },
        Some(true),
    )
}

#[tauri::command]
pub fn workbench_list_recent_documents_v1(
    state: State<'_, AppState>,
) -> Result<RecentDocumentsSnapshotV1, HostError> {
    state.recent_documents.list().map_err(recent_error)
}

#[tauri::command]
pub fn workbench_remove_recent_document_v1(
    state: State<'_, AppState>,
    record_id: String,
) -> Result<RecentDocumentsSnapshotV1, HostError> {
    state
        .recent_documents
        .remove(&record_id)
        .map_err(recent_error)
}

fn open_recent_file(
    state: &AppState,
    workspace_id: String,
    record_id: &str,
    expected: &DocumentReplacementPrecondition,
) -> Result<NativeFileResult, HostError> {
    locked(state)?.check_replacement(&workspace_id, expected)?;
    // resolve releases the directory gate before the service lock is acquired again.
    let path = state
        .recent_documents
        .resolve(record_id)
        .map_err(recent_error)?
        .ok_or_else(|| HostError::new("最近文件记录已移除，请刷新目录", 404))?;
    accept_opened_file(state, workspace_id, path, Some(expected))
}

#[tauri::command]
pub async fn workbench_open_recent_document_guarded_v1(
    state: State<'_, AppState>,
    workspace_id: String,
    record_id: String,
    expected: DocumentReplacementPrecondition,
) -> Result<NativeFileResult, HostError> {
    open_recent_file(state.inner(), workspace_id, &record_id, &expected)
}

fn record_current_file(
    state: &AppState,
    workspace_id: &str,
    expected: &DocumentReplacementPrecondition,
) -> Result<RecentDocumentsSnapshotV1, HostError> {
    if matches!(expected, DocumentReplacementPrecondition::Empty {}) {
        return Err(HostError::new("登记最近文件需要当前作品身份", 400));
    }
    let service = locked(state)?;
    service.check_replacement(workspace_id, expected)?;
    let path = service
        .file_path(workspace_id)?
        .ok_or_else(|| HostError::new("当前作品尚无文件位置", 404))?;
    state
        .recent_documents
        .record(&path, &crate::application::file_display_name(&path))
        .map_err(recent_error)
}

#[tauri::command]
pub fn workbench_record_current_file_v1(
    state: State<'_, AppState>,
    workspace_id: String,
    expected: DocumentReplacementPrecondition,
) -> Result<RecentDocumentsSnapshotV1, HostError> {
    record_current_file(state.inner(), &workspace_id, &expected)
}

#[tauri::command]
pub async fn workbench_save_file_v1(
    app: AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
    suggested_name: String,
    save_as: bool,
) -> Result<Option<NativeFileResult>, HostError> {
    save_file(
        &app,
        state.inner(),
        workspace_id,
        suggested_name,
        save_as,
        None,
    )
}

#[tauri::command]
pub async fn workbench_save_file_guarded_v1(
    app: AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
    suggested_name: String,
    save_as: bool,
    expected: DocumentReplacementPrecondition,
) -> Result<Option<NativeFileResult>, HostError> {
    save_file(
        &app,
        state.inner(),
        workspace_id,
        suggested_name,
        save_as,
        Some(expected),
    )
}

fn save_file(
    app: &AppHandle,
    state: &AppState,
    workspace_id: String,
    suggested_name: String,
    save_as: bool,
    expected: Option<DocumentReplacementPrecondition>,
) -> Result<Option<NativeFileResult>, HostError> {
    let (snapshot, expected) = {
        let service = locked(state)?;
        let expected = match expected {
            Some(value) => value,
            None => {
                let value = service
                    .read(&workspace_id)?
                    .ok_or_else(|| HostError::new("当前没有可保存的作品", 404))?;
                DocumentReplacementPrecondition::Document {
                    document_id: value.document_id,
                    document_version: value.document_version,
                }
            }
        };
        if matches!(expected, DocumentReplacementPrecondition::Empty {}) {
            return Err(HostError::new("保存需要当前作品身份和版本", 400));
        }
        service.check_replacement(&workspace_id, &expected)?;
        (service.export_snapshot(&workspace_id)?, expected)
    };
    let path = if !save_as && let Some(path) = snapshot.file_path() {
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
    persist_save_snapshot(state, &workspace_id, path, &expected, &snapshot).map(Some)
}

// Dialog stays outside the service gate. The final guard and physical commit
// stay together, so no other command can replace/edit the exported document.
#[cfg(test)]
fn persist_selected_file(
    state: &AppState,
    workspace_id: &str,
    path: std::path::PathBuf,
    expected: &DocumentReplacementPrecondition,
) -> Result<NativeFileResult, HostError> {
    if matches!(expected, DocumentReplacementPrecondition::Empty {}) {
        return Err(HostError::new("保存需要当前作品身份和版本", 400));
    }
    let snapshot = {
        let service = locked(state)?;
        service.check_replacement(workspace_id, expected)?;
        service.export_snapshot(workspace_id)?
    };
    persist_save_snapshot(state, workspace_id, path, expected, &snapshot)
}

fn persist_save_snapshot(
    state: &AppState,
    workspace_id: &str,
    path: std::path::PathBuf,
    expected: &DocumentReplacementPrecondition,
    snapshot: &crate::application::SaveSnapshot,
) -> Result<NativeFileResult, HostError> {
    if matches!(expected, DocumentReplacementPrecondition::Empty {}) {
        return Err(HostError::new("保存需要当前作品身份和版本", 400));
    }
    let mut service = locked(state)?;
    service.check_replacement(workspace_id, expected)?;
    let mut result = service.save_file(workspace_id, path.clone(), snapshot)?;
    if clear_file_recovery(state, &service, workspace_id).is_err() {
        result.warnings.push(file_acceptance_warning(
            "file.recovery-unavailable",
            "作品已保存，恢复文件清理尚未完成",
        ));
    }
    if state.recent_documents.record(&path, &result.name).is_err() {
        result.warnings.push(file_acceptance_warning(
            "file.recent-unavailable",
            "作品已保存，最近记录未能更新",
        ));
    }
    Ok(result)
}

fn change_document(
    state: &AppState,
    workspace_id: &str,
    operation: impl FnOnce(&mut crate::application::ScoreSessionService) -> Result<ScoreSessionRead, HostError>,
) -> Result<ScoreSessionRead, HostError> {
    let mut service = locked(state)?;
    let mut session = operation(&mut service)?;
    let warning = schedule_current_recovery(state, &service, workspace_id)
        .or_else(|| recovery_status(state, workspace_id));
    session.warnings = warning.into_iter().collect();
    Ok(session)
}

// The caller holds the same service lock that committed the document.
fn schedule_current_recovery(
    state: &AppState,
    service: &crate::application::ScoreSessionService,
    workspace_id: &str,
) -> Option<crate::dto::WorkbenchIssue> {
    service.export_document(workspace_id)
        .and_then(|document| state.recovery.schedule(state.recovery_path(workspace_id), document))
        .err()
        .map(|_| file_acceptance_warning(
            "file.recovery-unavailable", "自动恢复副本暂不可用，请保存项目文件",
        ))
}

fn recovery_status(state: &AppState, workspace_id: &str) -> Option<crate::dto::WorkbenchIssue> {
    state.recovery.status(state.recovery_path(workspace_id)).err()
        .map(|_| file_acceptance_warning(
            "file.recovery-unavailable", "自动恢复副本暂不可用，请保存项目文件",
        ))
}

fn clear_file_recovery(
    state: &AppState,
    service: &crate::application::ScoreSessionService,
    workspace_id: &str,
) -> Result<(), HostError> {
    let _ = schedule_current_recovery(state, service, workspace_id);
    state.recovery.remove(state.recovery_path(workspace_id))
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
mod recent_tests;

#[cfg(test)]
mod save_tests;

#[cfg(test)]
mod recovery_tests;

#[cfg(test)]
mod tests {
    #[test]
    fn guarded_file_acceptance_preserves_recovery_on_conflict_and_bad_input() {
        use crate::dto::{DocumentReplacementPrecondition, NewScoreInput};
        let directory =
            std::env::temp_dir().join(format!("brilliant-guarded-open-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let state = AppState::new(directory.join("recovery"));
        let workspace = Uuid::new_v4().to_string();
        let initial = locked(&state)
            .unwrap()
            .create(CreateScoreRequest {
                workspace_id: workspace.clone(),
                input: NewScoreInput {
                    title: "保留作品".into(),
                    measure_count: 1,
                },
                request_id: Uuid::new_v4().to_string(),
                expected_document_id: None,
            })
            .unwrap();
        let expected = DocumentReplacementPrecondition::Document {
            document_id: initial.document_id.clone(),
            document_version: initial.document_version,
        };
        let path = directory.join("selected.json");
        std::fs::write(
            &path,
            locked(&state).unwrap().export_document(&workspace).unwrap(),
        )
        .unwrap();
        locked(&state)
            .unwrap()
            .mark_saved(&workspace, path.clone(), initial.document_version)
            .unwrap();
        // A second command changes the same document while the first is choosing/reading a file.
        let changed = locked(&state)
            .unwrap()
            .edit(ScoreEditRequest {
                workspace_id: workspace.clone(),
                document_id: initial.document_id,
                expected_version: initial.document_version,
                request_id: Uuid::new_v4().to_string(),
                action: crate::dto::ScoreEditAction::SetTempo { tempo_bpm: 144.0 },
            })
            .unwrap();
        schedule_current_recovery(&state, &locked(&state).unwrap(), &workspace);
        state.recovery.flush(state.recovery_path(&workspace)).unwrap();
        let recovery_path = state.recovery_path(&workspace);
        let retained_recovery = std::fs::read(&recovery_path).unwrap();
        let error = accept_opened_file(&state, workspace.clone(), path.clone(), Some(&expected))
            .unwrap_err();
        assert_eq!(error.status, 409);
        assert_eq!(
            locked(&state).unwrap().read(&workspace).unwrap(),
            Some(changed.clone())
        );
        assert_eq!(
            locked(&state).unwrap().file_path(&workspace).unwrap(),
            Some(path.clone())
        );
        assert_eq!(std::fs::read(&recovery_path).unwrap(), retained_recovery);
        let expected = DocumentReplacementPrecondition::Document {
            document_id: changed.document_id.clone(),
            document_version: changed.document_version,
        };
        let invalid = directory.join("invalid.json");
        std::fs::write(&invalid, "{\"schemaVersion\":999999}").unwrap();
        assert!(accept_opened_file(&state, workspace.clone(), invalid, Some(&expected)).is_err());
        assert_eq!(
            locked(&state).unwrap().read(&workspace).unwrap(),
            Some(changed)
        );
        assert_eq!(std::fs::read(&recovery_path).unwrap(), retained_recovery);
        let accepted =
            accept_opened_file(&state, workspace.clone(), path.clone(), Some(&expected)).unwrap();
        assert_eq!(accepted.session.document_version, initial.document_version);
        assert_eq!(accepted.saved_version, initial.document_version);
        assert_eq!(
            locked(&state).unwrap().file_path(&workspace).unwrap(),
            Some(std::fs::canonicalize(path).unwrap())
        );
        assert!(!recovery_path.exists());
        drop(state);
        std::fs::remove_dir_all(directory).unwrap();
    }

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
        schedule_current_recovery(&original, &locked(&original).unwrap(), &workspace_id);
        original.recovery.flush(original.recovery_path(&workspace_id)).expect("persist recovery file");
        drop(original);

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
        drop(restarted);
        std::fs::remove_dir_all(recovery_root).expect("remove recovery directory");
    }
}
