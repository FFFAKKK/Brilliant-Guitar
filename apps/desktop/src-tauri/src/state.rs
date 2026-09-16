use std::path::PathBuf;
use std::sync::Mutex;

use crate::application::ScoreSessionService;
use crate::diagnostics::DiagnosticLog;
use crate::document_io::RecoveryManager;

pub struct AppState {
    pub service: Mutex<ScoreSessionService>,
    pub recovery: RecoveryManager,
    pub diagnostics: DiagnosticLog,
    recovery_root: PathBuf,
}

impl AppState {
    pub fn new(recovery_root: PathBuf) -> Self {
        let diagnostics_root = recovery_root
            .parent()
            .map(|path| path.join("diagnostics"))
            .unwrap_or_else(|| PathBuf::from("diagnostics"));
        Self {
            service: Mutex::new(ScoreSessionService::default()),
            recovery: RecoveryManager::default(),
            diagnostics: DiagnosticLog::new(diagnostics_root),
            recovery_root,
        }
    }

    pub fn recovery_path(&self, workspace_id: &str) -> PathBuf {
        self.recovery_root.join(format!("{workspace_id}.bgp.json"))
    }
}
