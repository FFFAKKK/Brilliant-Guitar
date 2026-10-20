use std::path::PathBuf;
use std::sync::Mutex;
use std::collections::HashMap;

use crate::agent_credential::AgentCredentialStore;
use crate::agent_provider::{AgentProviderCancellationRegistry, AgentProviderService};
use crate::agent_store::AgentRunStore;
use crate::application::ScoreSessionService;
use crate::capability_receipt::CapabilityReceiptStore;
use crate::config_writer::ConfigWriterLease;
use crate::diagnostics::DiagnosticLog;
use crate::document_io::RecoveryManager;
use crate::json_store::JsonDocumentStore;
use crate::recent_documents::RecentDocumentsStore;
use crate::settings::ApplicationSettingsStore;
use crate::workspace_configuration::WorkspaceConfigurationStore;

pub struct AppState {
    pub service: Mutex<ScoreSessionService>,
    pub closing_workspaces: Mutex<HashMap<String, String>>,
    pub recovery: RecoveryManager,
    pub diagnostics: DiagnosticLog,
    pub settings: ApplicationSettingsStore,
    pub plugin_activation: JsonDocumentStore,
    pub plugin_settings: JsonDocumentStore,
    pub plugin_startup_recovery: JsonDocumentStore,
    pub recent_documents: RecentDocumentsStore,
    pub workspace_configuration: WorkspaceConfigurationStore,
    pub agent_runs: AgentRunStore,
    pub capability_receipts: CapabilityReceiptStore,
    pub agent_credentials: AgentCredentialStore,
    pub agent_providers: AgentProviderService,
    pub agent_provider_cancellations: AgentProviderCancellationRegistry,
    recovery_root: PathBuf,
    // Last field: retain the lease while earlier store/recovery fields are dropped.
    _config_writer: ConfigWriterLease,
}

impl AppState {
    #[cfg(test)]
    pub fn new(recovery_root: PathBuf) -> Self {
        let settings_path = recovery_root.join("config").join("settings.v1.json");
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
        .expect("acquire isolated test application configuration")
    }

    pub fn with_paths(
        recovery_root: PathBuf,
        settings_path: PathBuf,
        workspace_configuration_root: PathBuf,
        agent_run_root: PathBuf,
        capability_receipt_root: PathBuf,
    ) -> std::io::Result<Self> {
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
    ) -> std::io::Result<Self> {
        let config_root = settings_path
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
            .ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid settings path")
            })?;
        let config_writer = ConfigWriterLease::acquire(config_root)?;
        let diagnostics_root = recovery_root
            .parent()
            .map(|path| path.join("diagnostics"))
            .unwrap_or_else(|| PathBuf::from("diagnostics"));
        let plugin_activation_path = settings_path.with_file_name("plugin-activation.v1.json");
        let plugin_settings_path = settings_path.with_file_name("plugin-settings.v1.json");
        let recent_documents_path = settings_path.with_file_name("recent-documents.v1.json");
        let plugin_startup_recovery_path =
            settings_path.with_file_name("plugin-startup-recovery.v1.json");
        Ok(Self {
            service: Mutex::new(ScoreSessionService::default()),
            closing_workspaces: Mutex::new(HashMap::new()),
            recovery: RecoveryManager::default(),
            diagnostics: DiagnosticLog::new(diagnostics_root),
            settings: ApplicationSettingsStore::new(settings_path),
            plugin_activation: JsonDocumentStore::new(plugin_activation_path),
            plugin_settings: JsonDocumentStore::new(plugin_settings_path),
            recent_documents: RecentDocumentsStore::new(recent_documents_path),
            plugin_startup_recovery: JsonDocumentStore::new(plugin_startup_recovery_path),
            workspace_configuration: WorkspaceConfigurationStore::new(workspace_configuration_root),
            agent_runs: AgentRunStore::new(agent_run_root),
            capability_receipts: CapabilityReceiptStore::new(capability_receipt_root),
            agent_credentials,
            agent_providers: AgentProviderService::default(),
            agent_provider_cancellations: AgentProviderCancellationRegistry::default(),
            recovery_root,
            _config_writer: config_writer,
        })
    }

    pub fn recovery_path(&self, workspace_id: &str) -> PathBuf {
        self.recovery_root.join(format!("{workspace_id}.bgp.json"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_lease_acquisition_does_not_construct_stores_or_rewrite_configuration() {
        let root = std::env::temp_dir().join(format!("writer-failure-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("config/.application-writer.lock")).unwrap();
        let path = root.join("config/settings.v1.json");
        std::fs::write(&path, b"preserve existing data").unwrap();
        let result = AppState::with_paths_and_credentials(
            root.join("recovery"),
            path.clone(),
            root.join("config/workspaces"),
            root.join("agent/runs"),
            root.join("agent/receipts"),
            AgentCredentialStore::memory(),
        );
        assert!(result.is_err());
        assert_eq!(std::fs::read(path).unwrap(), b"preserve existing data");
        assert!(!root.join("recovery").exists());
        assert!(!root.join("agent").exists());
        assert!(!root.join("diagnostics").exists());
        assert!(!root.join("config/plugin-settings.v1.json").exists());
        std::fs::remove_dir_all(root).expect("remove isolated failed domain");
    }

    #[test]
    fn state_rejects_a_second_owner_before_stores_are_available_and_reopens_after_drop() {
        let root = std::env::temp_dir().join(format!("writer-state-{}", uuid::Uuid::new_v4()));
        let open = || {
            AppState::with_paths_and_credentials(
                root.join("recovery"),
                root.join("config/settings.v1.json"),
                root.join("config/workspaces"),
                root.join("agent/runs"),
                root.join("agent/receipts"),
                AgentCredentialStore::memory(),
            )
        };
        let first = open().expect("first owner");
        let a = serde_json::json!({"startup": {"revision": 1, "enabled": ["a"]}});
        first
            .plugin_settings
            .write(a.clone())
            .expect("first native write");
        assert_eq!(
            open().err().expect("reject second owner").kind(),
            std::io::ErrorKind::WouldBlock
        );
        assert_eq!(
            first.plugin_settings.read().expect("read actual disk"),
            Some(a.clone())
        );
        drop(first);
        let restarted = open().expect("restart after release");
        assert_eq!(
            restarted.plugin_settings.read().expect("reopen disk"),
            Some(a)
        );
        drop(restarted);
        std::fs::remove_dir_all(root).expect("remove isolated state directory");
    }
}
