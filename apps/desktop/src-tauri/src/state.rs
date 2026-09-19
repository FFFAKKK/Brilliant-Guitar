use std::path::PathBuf;
use std::sync::Mutex;

use crate::agent_credential::AgentCredentialStore;
use crate::agent_provider::{AgentProviderCancellationRegistry, AgentProviderService};
use crate::agent_store::AgentRunStore;
use crate::application::ScoreSessionService;
use crate::capability_receipt::CapabilityReceiptStore;
use crate::diagnostics::DiagnosticLog;
use crate::document_io::RecoveryManager;
use crate::settings::ApplicationSettingsStore;
use crate::workspace_configuration::WorkspaceConfigurationStore;

pub struct AppState {
    pub service: Mutex<ScoreSessionService>,
    pub recovery: RecoveryManager,
    pub diagnostics: DiagnosticLog,
    pub settings: ApplicationSettingsStore,
    pub workspace_configuration: WorkspaceConfigurationStore,
    pub agent_runs: AgentRunStore,
    pub capability_receipts: CapabilityReceiptStore,
    pub agent_credentials: AgentCredentialStore,
    pub agent_providers: AgentProviderService,
    pub agent_provider_cancellations: AgentProviderCancellationRegistry,
    recovery_root: PathBuf,
}

impl AppState {
    #[cfg(test)]
    pub fn new(recovery_root: PathBuf) -> Self {
        let settings_path = recovery_root
            .parent()
            .map(|path| path.join("config").join("settings.v1.json"))
            .unwrap_or_else(|| PathBuf::from("config").join("settings.v1.json"));
        let workspace_configuration_root = settings_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("config"))
            .join("workspaces");
        let agent_run_root = recovery_root
            .parent()
            .map(|path| path.join("agent").join("runs"))
            .unwrap_or_else(|| PathBuf::from("agent").join("runs"));
        let capability_receipt_root = recovery_root
            .parent()
            .map(|path| path.join("agent").join("receipts"))
            .unwrap_or_else(|| PathBuf::from("agent").join("receipts"));
        Self::with_paths_and_credentials(
            recovery_root,
            settings_path,
            workspace_configuration_root,
            agent_run_root,
            capability_receipt_root,
            AgentCredentialStore::memory(),
        )
    }

    pub fn with_paths(
        recovery_root: PathBuf,
        settings_path: PathBuf,
        workspace_configuration_root: PathBuf,
        agent_run_root: PathBuf,
        capability_receipt_root: PathBuf,
    ) -> Self {
        Self::with_paths_and_credentials(
            recovery_root,
            settings_path,
            workspace_configuration_root,
            agent_run_root,
            capability_receipt_root,
            AgentCredentialStore::system(),
        )
    }

    fn with_paths_and_credentials(
        recovery_root: PathBuf,
        settings_path: PathBuf,
        workspace_configuration_root: PathBuf,
        agent_run_root: PathBuf,
        capability_receipt_root: PathBuf,
        agent_credentials: AgentCredentialStore,
    ) -> Self {
        let diagnostics_root = recovery_root
            .parent()
            .map(|path| path.join("diagnostics"))
            .unwrap_or_else(|| PathBuf::from("diagnostics"));
        Self {
            service: Mutex::new(ScoreSessionService::default()),
            recovery: RecoveryManager::default(),
            diagnostics: DiagnosticLog::new(diagnostics_root),
            settings: ApplicationSettingsStore::new(settings_path),
            workspace_configuration: WorkspaceConfigurationStore::new(workspace_configuration_root),
            agent_runs: AgentRunStore::new(agent_run_root),
            capability_receipts: CapabilityReceiptStore::new(capability_receipt_root),
            agent_credentials,
            agent_providers: AgentProviderService::default(),
            agent_provider_cancellations: AgentProviderCancellationRegistry::default(),
            recovery_root,
        }
    }

    pub fn recovery_path(&self, workspace_id: &str) -> PathBuf {
        self.recovery_root.join(format!("{workspace_id}.bgp.json"))
    }
}
