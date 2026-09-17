use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::document_io::atomic_write_raw;
use crate::dto::DeleteTimePolicy;

const SETTINGS_SCHEMA_VERSION: u16 = 1;
const MAX_SETTINGS_BYTES: u64 = 256 * 1024;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UiSettingsV1 {
    pub animations_enabled: bool,
    pub rule_warnings_visible: bool,
}

impl Default for UiSettingsV1 {
    fn default() -> Self {
        Self {
            animations_enabled: true,
            rule_warnings_visible: true,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditingSettingsV1 {
    pub delete_time_policy: DeleteTimePolicy,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplicationSettingsV1 {
    pub schema_version: u16,
    pub ui: UiSettingsV1,
    pub editing: EditingSettingsV1,
}

impl Default for ApplicationSettingsV1 {
    fn default() -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            ui: UiSettingsV1::default(),
            editing: EditingSettingsV1::default(),
        }
    }
}

impl ApplicationSettingsV1 {
    fn validate(&self) -> io::Result<()> {
        if self.schema_version != SETTINGS_SCHEMA_VERSION {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "unsupported settings schema version",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationSettingsSnapshotV1 {
    pub settings: ApplicationSettingsV1,
    pub persisted: bool,
    pub recovered_from_invalid: bool,
}

#[derive(Debug)]
pub struct ApplicationSettingsStore {
    path: PathBuf,
    gate: Mutex<()>,
}

impl ApplicationSettingsStore {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            gate: Mutex::new(()),
        }
    }

    pub fn read(&self) -> io::Result<ApplicationSettingsSnapshotV1> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("settings lock poisoned"))?;
        if !self.path.exists() {
            return Ok(ApplicationSettingsSnapshotV1 {
                settings: ApplicationSettingsV1::default(),
                persisted: false,
                recovered_from_invalid: false,
            });
        }
        match read_settings(&self.path) {
            Ok(settings) => Ok(ApplicationSettingsSnapshotV1 {
                settings,
                persisted: true,
                recovered_from_invalid: false,
            }),
            Err(error) if matches!(error.kind(), io::ErrorKind::InvalidData) => {
                quarantine_invalid(&self.path)?;
                Ok(ApplicationSettingsSnapshotV1 {
                    settings: ApplicationSettingsV1::default(),
                    persisted: false,
                    recovered_from_invalid: true,
                })
            }
            Err(error) => Err(error),
        }
    }

    pub fn write(&self, settings: ApplicationSettingsV1) -> io::Result<ApplicationSettingsV1> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("settings lock poisoned"))?;
        settings.validate()?;
        let parent = self
            .path
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "invalid settings path"))?;
        fs::create_dir_all(parent)?;
        let bytes = serde_json::to_vec_pretty(&settings).map_err(io::Error::other)?;
        atomic_write_raw(&self.path, &bytes)?;
        Ok(settings)
    }

    pub fn reset(&self) -> io::Result<ApplicationSettingsV1> {
        self.write(ApplicationSettingsV1::default())
    }
}

fn read_settings(path: &Path) -> io::Result<ApplicationSettingsV1> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() > MAX_SETTINGS_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "settings file is not a supported regular file",
        ));
    }
    let mut file = fs::File::open(path)?;
    let mut bytes = Vec::with_capacity(usize::try_from(metadata.len()).unwrap_or(0));
    file.read_to_end(&mut bytes)?;
    let settings = serde_json::from_slice::<ApplicationSettingsV1>(&bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    settings.validate()?;
    Ok(settings)
}

fn quarantine_invalid(path: &Path) -> io::Result<PathBuf> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("settings.v1.json");
    let quarantined = path.with_file_name(format!("{file_name}.invalid-{}", Uuid::new_v4()));
    fs::rename(path, &quarantined)?;
    Ok(quarantined)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_store() -> (PathBuf, ApplicationSettingsStore) {
        let root = std::env::temp_dir().join(format!("brilliant-settings-{}", Uuid::new_v4()));
        let store = ApplicationSettingsStore::new(root.join("settings.v1.json"));
        (root, store)
    }

    #[test]
    fn missing_settings_return_versioned_defaults_without_creating_a_file() {
        let (root, store) = test_store();
        let snapshot = store.read().expect("read defaults");
        assert_eq!(snapshot.settings, ApplicationSettingsV1::default());
        assert!(!snapshot.persisted);
        assert!(!snapshot.recovered_from_invalid);
        assert!(!root.exists());
    }

    #[test]
    fn settings_round_trip_as_human_readable_json() {
        let (root, store) = test_store();
        let mut settings = ApplicationSettingsV1::default();
        settings.ui.animations_enabled = false;
        settings.editing.delete_time_policy = DeleteTimePolicy::Collapse;
        store.write(settings.clone()).expect("write settings");

        let snapshot = store.read().expect("read settings");
        assert_eq!(snapshot.settings, settings);
        assert!(snapshot.persisted);
        let text = fs::read_to_string(root.join("settings.v1.json")).expect("read json");
        assert!(text.contains("\n  \"schemaVersion\": 1"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn malformed_settings_are_preserved_and_replaced_with_defaults_in_memory() {
        let (root, store) = test_store();
        fs::create_dir_all(&root).expect("create settings directory");
        fs::write(root.join("settings.v1.json"), b"{not-json").expect("write malformed settings");

        let snapshot = store.read().expect("recover malformed settings");
        assert_eq!(snapshot.settings, ApplicationSettingsV1::default());
        assert!(!snapshot.persisted);
        assert!(snapshot.recovered_from_invalid);
        assert!(!root.join("settings.v1.json").exists());
        assert_eq!(
            fs::read_dir(&root).expect("list quarantined files").count(),
            1
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn unknown_fields_and_future_schema_versions_are_not_silently_accepted() {
        let (root, store) = test_store();
        fs::create_dir_all(&root).expect("create settings directory");
        fs::write(
            root.join("settings.v1.json"),
            br#"{"schemaVersion":2,"ui":{"animationsEnabled":true,"ruleWarningsVisible":true},"editing":{"deleteTimePolicy":"preserve"},"surprise":true}"#,
        )
        .expect("write future settings");

        let snapshot = store.read().expect("quarantine unsupported settings");
        assert!(snapshot.recovered_from_invalid);
        assert_eq!(snapshot.settings.schema_version, SETTINGS_SCHEMA_VERSION);
        let _ = fs::remove_dir_all(root);
    }
}
