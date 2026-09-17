use std::collections::HashSet;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::document_io::atomic_write_raw;

const SCHEMA_VERSION: u16 = 1;
const UI_LAYOUT_VERSION: u16 = 2;
const MAX_CONFIGURATION_BYTES: u64 = 512 * 1024;
const MAX_PLACEMENTS: usize = 256;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DockLayoutV1 {
    pub left: u16,
    pub right: u16,
    pub top: u16,
    pub bottom: u16,
}

impl Default for DockLayoutV1 {
    fn default() -> Self {
        Self {
            left: 208,
            right: 280,
            top: 56,
            bottom: 136,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DockVisibilityV1 {
    pub top: bool,
    pub right: bool,
    pub bottom: bool,
    pub left: bool,
}

impl Default for DockVisibilityV1 {
    fn default() -> Self {
        Self {
            top: true,
            right: true,
            bottom: true,
            left: true,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DockSelectionV1 {
    pub top: Option<String>,
    pub right: Option<String>,
    pub bottom: Option<String>,
    pub left: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DockConfigurationV1 {
    pub layout: DockLayoutV1,
    pub visibility: DockVisibilityV1,
    pub selection: DockSelectionV1,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum UiSlotV1 {
    Workspace,
    Top,
    Right,
    Bottom,
    Left,
    Overlay,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum UiPresentationV1 {
    Inline,
    Panel,
    Popover,
    Dialog,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UiPlacementV1 {
    pub component_id: String,
    pub slot: UiSlotV1,
    pub presentation: UiPresentationV1,
    pub order: u16,
    pub visible: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UiLayoutV1 {
    pub version: u16,
    pub placements: Vec<UiPlacementV1>,
}

impl Default for UiLayoutV1 {
    fn default() -> Self {
        Self {
            version: UI_LAYOUT_VERSION,
            placements: vec![
                placement(
                    "notation.staff-view",
                    UiSlotV1::Workspace,
                    UiPresentationV1::Inline,
                    0,
                ),
                placement(
                    "notation.note-input",
                    UiSlotV1::Left,
                    UiPresentationV1::Panel,
                    0,
                ),
                placement(
                    "notation.history-control",
                    UiSlotV1::Top,
                    UiPresentationV1::Panel,
                    0,
                ),
                placement(
                    "notation.paper-zoom",
                    UiSlotV1::Top,
                    UiPresentationV1::Panel,
                    1,
                ),
            ],
        }
    }
}

fn placement(
    component_id: &str,
    slot: UiSlotV1,
    presentation: UiPresentationV1,
    order: u16,
) -> UiPlacementV1 {
    UiPlacementV1 {
        component_id: component_id.into(),
        slot,
        presentation,
        order,
        visible: true,
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceConfigurationV1 {
    pub schema_version: u16,
    pub dock: DockConfigurationV1,
    pub ui_layout: UiLayoutV1,
    pub inspector_width: u16,
}

impl Default for WorkspaceConfigurationV1 {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            dock: DockConfigurationV1::default(),
            ui_layout: UiLayoutV1::default(),
            inspector_width: 288,
        }
    }
}

impl WorkspaceConfigurationV1 {
    fn validate(&self) -> io::Result<()> {
        if self.schema_version != SCHEMA_VERSION
            || self.ui_layout.version != UI_LAYOUT_VERSION
            || self.ui_layout.placements.len() > MAX_PLACEMENTS
            || !(160..=2048).contains(&self.inspector_width)
        {
            return Err(invalid_configuration());
        }
        if [
            self.dock.layout.left,
            self.dock.layout.right,
            self.dock.layout.top,
            self.dock.layout.bottom,
        ]
        .iter()
        .any(|value| *value > 4096)
        {
            return Err(invalid_configuration());
        }
        for selection in [
            &self.dock.selection.top,
            &self.dock.selection.right,
            &self.dock.selection.bottom,
            &self.dock.selection.left,
        ] {
            if selection
                .as_ref()
                .is_some_and(|value| value.is_empty() || value.len() > 160)
            {
                return Err(invalid_configuration());
            }
        }
        let mut ids = HashSet::new();
        for item in &self.ui_layout.placements {
            if item.component_id.is_empty()
                || item.component_id.len() > 160
                || item.order > 4096
                || !ids.insert(item.component_id.as_str())
            {
                return Err(invalid_configuration());
            }
        }
        Ok(())
    }
}

fn invalid_configuration() -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidData,
        "invalid workspace configuration",
    )
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfigurationSnapshotV1 {
    pub configuration: WorkspaceConfigurationV1,
    pub persisted: bool,
    pub recovered_from_invalid: bool,
}

#[derive(Debug)]
pub struct WorkspaceConfigurationStore {
    root: PathBuf,
    gate: Mutex<()>,
}

impl WorkspaceConfigurationStore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            gate: Mutex::new(()),
        }
    }

    fn path(&self, workspace_id: &str) -> io::Result<PathBuf> {
        let id = Uuid::parse_str(workspace_id)
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "invalid workspace id"))?;
        Ok(self
            .root
            .join(format!("{}.workspace.v1.json", id.hyphenated())))
    }

    pub fn read(&self, workspace_id: &str) -> io::Result<WorkspaceConfigurationSnapshotV1> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("workspace configuration lock poisoned"))?;
        let path = self.path(workspace_id)?;
        if !path.exists() {
            return Ok(WorkspaceConfigurationSnapshotV1 {
                configuration: WorkspaceConfigurationV1::default(),
                persisted: false,
                recovered_from_invalid: false,
            });
        }
        match read_configuration(&path) {
            Ok(configuration) => Ok(WorkspaceConfigurationSnapshotV1 {
                configuration,
                persisted: true,
                recovered_from_invalid: false,
            }),
            Err(error) if error.kind() == io::ErrorKind::InvalidData => {
                quarantine_invalid(&path)?;
                Ok(WorkspaceConfigurationSnapshotV1 {
                    configuration: WorkspaceConfigurationV1::default(),
                    persisted: false,
                    recovered_from_invalid: true,
                })
            }
            Err(error) => Err(error),
        }
    }

    pub fn write(
        &self,
        workspace_id: &str,
        configuration: WorkspaceConfigurationV1,
    ) -> io::Result<WorkspaceConfigurationV1> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("workspace configuration lock poisoned"))?;
        let path = self.path(workspace_id)?;
        configuration.validate()?;
        fs::create_dir_all(&self.root)?;
        atomic_write_raw(
            &path,
            &serde_json::to_vec_pretty(&configuration).map_err(io::Error::other)?,
        )?;
        Ok(configuration)
    }

    pub fn reset(&self, workspace_id: &str) -> io::Result<WorkspaceConfigurationV1> {
        self.write(workspace_id, WorkspaceConfigurationV1::default())
    }
}

fn read_configuration(path: &Path) -> io::Result<WorkspaceConfigurationV1> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() > MAX_CONFIGURATION_BYTES {
        return Err(invalid_configuration());
    }
    let mut bytes = Vec::with_capacity(usize::try_from(metadata.len()).unwrap_or(0));
    fs::File::open(path)?.read_to_end(&mut bytes)?;
    let configuration = serde_json::from_slice::<WorkspaceConfigurationV1>(&bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    configuration.validate()?;
    Ok(configuration)
}

fn quarantine_invalid(path: &Path) -> io::Result<()> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("workspace.v1.json");
    fs::rename(
        path,
        path.with_file_name(format!("{name}.invalid-{}", Uuid::new_v4())),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (PathBuf, String, WorkspaceConfigurationStore) {
        let root = std::env::temp_dir().join(format!(
            "brilliant-workspace-configuration-{}",
            Uuid::new_v4()
        ));
        (
            root.clone(),
            Uuid::new_v4().to_string(),
            WorkspaceConfigurationStore::new(root),
        )
    }

    #[test]
    fn configuration_is_isolated_by_validated_workspace_id() {
        let (root, id, store) = store();
        let mut value = WorkspaceConfigurationV1::default();
        value.dock.layout.left = 360;
        store
            .write(&id, value.clone())
            .expect("write workspace configuration");
        assert_eq!(
            store
                .read(&id)
                .expect("read workspace configuration")
                .configuration,
            value
        );
        assert!(
            !store
                .read(&Uuid::new_v4().to_string())
                .expect("read other workspace")
                .persisted
        );
        assert!(store.read("../escape").is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn malformed_configuration_is_quarantined() {
        let (root, id, store) = store();
        fs::create_dir_all(&root).expect("create root");
        fs::write(store.path(&id).expect("path"), b"{broken").expect("write invalid");
        let snapshot = store.read(&id).expect("recover invalid");
        assert!(snapshot.recovered_from_invalid);
        assert!(!snapshot.persisted);
        assert_eq!(fs::read_dir(&root).expect("list root").count(), 1);
        let _ = fs::remove_dir_all(root);
    }
}
