use std::path::PathBuf;
use std::sync::Mutex;

use crate::application::ScoreSessionService;
use crate::document_io::RecoveryManager;

pub struct AppState {
    pub service: Mutex<ScoreSessionService>,
    pub recovery: RecoveryManager,
    recovery_root: PathBuf,
}

impl AppState {
    pub fn new(recovery_root: PathBuf) -> Self {
        Self {
            service: Mutex::new(ScoreSessionService::default()),
            recovery: RecoveryManager::default(),
            recovery_root,
        }
    }

    pub fn recovery_path(&self, workspace_id: &str) -> PathBuf {
        self.recovery_root.join(format!("{workspace_id}.bgp.json"))
    }
}
