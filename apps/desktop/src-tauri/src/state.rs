use std::path::PathBuf;
use std::sync::Mutex;

use crate::application::ScoreSessionService;
use crate::diagnostics::DiagnosticLog;
use crate::document_io::RecoveryManager;
use crate::settings::ApplicationSettingsStore;

pub struct AppState {
    pub service: Mutex<ScoreSessionService>,
    pub recovery: RecoveryManager,
    pub diagnostics: DiagnosticLog,
    pub settings: ApplicationSettingsStore,
    recovery_root: PathBuf,
}

impl AppState {
    #[cfg(test)]
    pub fn new(recovery_root: PathBuf) -> Self {
        let settings_path = recovery_root
            .parent()
            .map(|path| path.join("config").join("settings.v1.json"))
            .unwrap_or_else(|| PathBuf::from("config").join("settings.v1.json"));
        Self::with_paths(recovery_root, settings_path)
    }

    pub fn with_paths(recovery_root: PathBuf, settings_path: PathBuf) -> Self {
        let diagnostics_root = recovery_root
            .parent()
            .map(|path| path.join("diagnostics"))
            .unwrap_or_else(|| PathBuf::from("diagnostics"));
        Self {
            service: Mutex::new(ScoreSessionService::default()),
            recovery: RecoveryManager::default(),
            diagnostics: DiagnosticLog::new(diagnostics_root),
            settings: ApplicationSettingsStore::new(settings_path),
            recovery_root,
        }
    }

    pub fn recovery_path(&self, workspace_id: &str) -> PathBuf {
        self.recovery_root.join(format!("{workspace_id}.bgp.json"))
    }
}
