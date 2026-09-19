use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::agent_credential::valid_provider_id;
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

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NoteInputRetentionV1 {
    Rhythm,
    All,
    Reset,
}

impl Default for NoteInputRetentionV1 {
    fn default() -> Self {
        Self::Rhythm
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteInputDurationV1 {
    pub base: u8,
    pub dots: u8,
}

impl Default for NoteInputDurationV1 {
    fn default() -> Self {
        Self { base: 4, dots: 0 }
    }
}

impl NoteInputDurationV1 {
    fn validate(&self) -> io::Result<()> {
        if ![1, 2, 4, 8, 16].contains(&self.base) || self.dots > 1 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid default note input duration",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteInputSettingsV1 {
    #[serde(default)]
    pub retention: NoteInputRetentionV1,
    #[serde(default)]
    pub default_duration: NoteInputDurationV1,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditingSettingsV1 {
    pub delete_time_policy: DeleteTimePolicy,
    #[serde(default)]
    pub note_input: NoteInputSettingsV1,
}

impl Default for EditingSettingsV1 {
    fn default() -> Self {
        Self {
            delete_time_policy: DeleteTimePolicy::default(),
            note_input: NoteInputSettingsV1::default(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentProviderSelectionV1 {
    pub provider_id: String,
    pub model_id: String,
}

impl AgentProviderSelectionV1 {
    fn validate(&self) -> io::Result<()> {
        if !valid_provider_id(&self.provider_id) || !valid_model_id(&self.model_id) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid Agent Provider selection",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentSettingsV1 {
    pub enabled: bool,
    #[serde(default)]
    pub provider_selection: Option<AgentProviderSelectionV1>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShortcutSettingsV1 {
    pub profile_name: String,
    #[serde(default)]
    pub bindings: BTreeMap<String, Option<String>>,
}

impl Default for ShortcutSettingsV1 {
    fn default() -> Self {
        Self {
            profile_name: "官方默认".into(),
            bindings: BTreeMap::new(),
        }
    }
}

impl ShortcutSettingsV1 {
    fn validate(&self) -> io::Result<()> {
        if self.profile_name.is_empty()
            || self.profile_name.trim() != self.profile_name
            || self.profile_name.chars().count() > 80
            || self.profile_name.chars().any(char::is_control)
            || self.bindings.len() > 512
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid shortcut profile",
            ));
        }
        let mut assigned = HashSet::new();
        for (command_id, shortcut) in &self.bindings {
            if !valid_command_id(command_id)
                || shortcut
                    .as_ref()
                    .is_some_and(|value| !valid_shortcut(value) || !assigned.insert(value.as_str()))
            {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "invalid shortcut binding",
                ));
            }
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplicationSettingsV1 {
    pub schema_version: u16,
    pub ui: UiSettingsV1,
    pub editing: EditingSettingsV1,
    #[serde(default)]
    pub agent: AgentSettingsV1,
    #[serde(default)]
    pub shortcuts: ShortcutSettingsV1,
}

impl Default for ApplicationSettingsV1 {
    fn default() -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            ui: UiSettingsV1::default(),
            editing: EditingSettingsV1::default(),
            agent: AgentSettingsV1::default(),
            shortcuts: ShortcutSettingsV1::default(),
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
        if let Some(selection) = &self.agent.provider_selection {
            selection.validate()?;
        }
        self.editing.note_input.default_duration.validate()?;
        self.shortcuts.validate()?;
        Ok(())
    }
}

fn valid_command_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 160
        && value.split('.').all(|part| {
            !part.is_empty()
                && part.chars().all(|character| {
                    character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
                })
                && part
                    .chars()
                    .next()
                    .is_some_and(|character| character.is_ascii_alphanumeric())
        })
}

fn valid_shortcut(value: &str) -> bool {
    if value.is_empty() || value.len() > 64 || value.trim() != value {
        return false;
    }
    let parts = value.split('+').collect::<Vec<_>>();
    if parts.iter().any(|part| part.is_empty()) {
        return false;
    }
    let key_index = parts.len() - 1;
    let expected = ["Mod", "Alt", "Shift"];
    let modifiers = &parts[..key_index];
    let mut expected_index = 0;
    for modifier in modifiers {
        while expected_index < expected.len() && expected[expected_index] != *modifier {
            expected_index += 1;
        }
        if expected_index == expected.len() {
            return false;
        }
        expected_index += 1;
    }
    let key = parts[key_index];
    matches!(
        key,
        "Space"
            | "Enter"
            | "Escape"
            | "Tab"
            | "Backspace"
            | "Delete"
            | "Insert"
            | "Home"
            | "End"
            | "PageUp"
            | "PageDown"
            | "ArrowLeft"
            | "ArrowRight"
            | "ArrowUp"
            | "ArrowDown"
            | "Plus"
            | "Minus"
            | "Comma"
            | "Period"
            | "Slash"
            | "Backslash"
            | "Semicolon"
            | "Quote"
            | "BracketLeft"
            | "BracketRight"
            | "Backquote"
    ) || (key.len() == 1
        && key
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_uppercase() || character.is_ascii_digit()))
        || key
            .strip_prefix('F')
            .and_then(|number| number.parse::<u8>().ok())
            .is_some_and(|number| (1..=24).contains(&number))
}

fn valid_model_id(value: &str) -> bool {
    !value.is_empty()
        && value.trim() == value
        && value.chars().count() <= 160
        && !value.chars().any(char::is_control)
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
        settings.editing.note_input.retention = NoteInputRetentionV1::All;
        settings.editing.note_input.default_duration = NoteInputDurationV1 { base: 8, dots: 1 };
        settings.agent.enabled = true;
        settings.agent.provider_selection = Some(AgentProviderSelectionV1 {
            provider_id: "provider.example".into(),
            model_id: "model-1".into(),
        });
        settings.shortcuts.profile_name = "我的键位".into();
        settings
            .shortcuts
            .bindings
            .insert("playback.toggle".into(), Some("Mod+P".into()));
        store.write(settings.clone()).expect("write settings");

        let snapshot = store.read().expect("read settings");
        assert_eq!(snapshot.settings, settings);
        assert!(snapshot.persisted);
        let text = fs::read_to_string(root.join("settings.v1.json")).expect("read json");
        assert!(text.contains("\n  \"schemaVersion\": 1"));
        assert!(text.contains("\"enabled\": true"));
        assert!(text.contains("\"providerId\": \"provider.example\""));
        assert!(text.contains("\"profileName\": \"我的键位\""));
        assert!(text.contains("\"retention\": \"all\""));
        assert!(text.contains("\"defaultDuration\""));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn pre_agent_v1_settings_default_to_disabled() {
        let (root, store) = test_store();
        fs::create_dir_all(&root).expect("create settings directory");
        fs::write(
            root.join("settings.v1.json"),
            br#"{"schemaVersion":1,"ui":{"animationsEnabled":false,"ruleWarningsVisible":true},"editing":{"deleteTimePolicy":"preserve"}}"#,
        )
        .expect("write legacy settings");

        let snapshot = store.read().expect("read legacy settings");
        assert!(snapshot.persisted);
        assert!(!snapshot.recovered_from_invalid);
        assert!(!snapshot.settings.agent.enabled);
        assert_eq!(snapshot.settings.agent.provider_selection, None);
        assert_eq!(snapshot.settings.shortcuts, ShortcutSettingsV1::default());
        assert_eq!(snapshot.settings.editing.note_input, NoteInputSettingsV1::default());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn pre_provider_v1_settings_preserve_agent_activation_and_default_selection() {
        let (root, store) = test_store();
        fs::create_dir_all(&root).expect("create settings directory");
        fs::write(
            root.join("settings.v1.json"),
            br#"{"schemaVersion":1,"ui":{"animationsEnabled":true,"ruleWarningsVisible":true},"editing":{"deleteTimePolicy":"preserve"},"agent":{"enabled":true}}"#,
        )
        .expect("write legacy Agent settings");

        let snapshot = store.read().expect("read legacy Agent settings");
        assert!(snapshot.settings.agent.enabled);
        assert_eq!(snapshot.settings.agent.provider_selection, None);
        assert_eq!(snapshot.settings.shortcuts, ShortcutSettingsV1::default());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn invalid_provider_selection_is_quarantined() {
        let (root, store) = test_store();
        fs::create_dir_all(&root).expect("create settings directory");
        fs::write(
            root.join("settings.v1.json"),
            br#"{"schemaVersion":1,"ui":{"animationsEnabled":true,"ruleWarningsVisible":true},"editing":{"deleteTimePolicy":"preserve"},"agent":{"enabled":true,"providerSelection":{"providerId":"Invalid Provider","modelId":"model-1"}}}"#,
        )
        .expect("write invalid Provider settings");

        let snapshot = store.read().expect("quarantine invalid Provider settings");
        assert!(snapshot.recovered_from_invalid);
        assert_eq!(snapshot.settings.agent.provider_selection, None);
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
    fn duplicate_or_malformed_shortcuts_are_quarantined() {
        let (root, store) = test_store();
        fs::create_dir_all(&root).expect("create settings directory");
        fs::write(
            root.join("settings.v1.json"),
            br#"{"schemaVersion":1,"ui":{"animationsEnabled":true,"ruleWarningsVisible":true},"editing":{"deleteTimePolicy":"preserve"},"agent":{"enabled":false,"providerSelection":null},"shortcuts":{"profileName":"conflict","bindings":{"file.save":"Mod+S","file.open":"Mod+S"}}}"#,
        )
        .expect("write invalid shortcut settings");

        let snapshot = store.read().expect("quarantine invalid shortcuts");
        assert!(snapshot.recovered_from_invalid);
        assert_eq!(snapshot.settings.shortcuts, ShortcutSettingsV1::default());
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
