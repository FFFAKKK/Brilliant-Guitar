use std::collections::HashSet;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::json_store::JsonDocumentStore;

const MAX_RECENT: usize = 20;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentDocumentV1 {
    pub id: String,
    pub name: String,
    pub location: String,
    pub last_opened_at: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentDocumentsSnapshotV1 {
    pub api_version: u8,
    pub entries: Vec<RecentDocumentV1>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredEntry {
    id: String,
    path: PathBuf,
    name: String,
    last_opened_at: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredDirectory {
    schema_version: u8,
    entries: Vec<StoredEntry>,
}

pub struct RecentDocumentsStore {
    store: JsonDocumentStore,
    // Covers the whole read-modify-write, not only each atomic file operation.
    gate: Mutex<()>,
}

impl RecentDocumentsStore {
    pub fn new(path: PathBuf) -> Self {
        Self {
            store: JsonDocumentStore::new(path),
            gate: Mutex::new(()),
        }
    }

    fn read_locked(&self) -> io::Result<StoredDirectory> {
        let Some(value) = self.store.read()? else {
            return Ok(StoredDirectory {
                schema_version: 1,
                entries: vec![],
            });
        };
        let directory: StoredDirectory = serde_json::from_value(value).map_err(invalid)?;
        if directory.schema_version != 1 {
            return Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "unsupported recent directory version",
            ));
        }
        let mut ids = HashSet::new();
        let mut paths = HashSet::new();
        if directory.entries.len() > MAX_RECENT
            || directory.entries.iter().any(|entry| {
                !validate_record_id(&entry.id).is_ok_and(|normalized| normalized == entry.id)
                    || !ids.insert(entry.id.clone())
                    || !paths.insert(entry.path.clone())
                    || !entry.path.is_absolute()
                    || !valid_path_text(&entry.path)
                    || entry.name.is_empty()
                    || entry.name.encode_utf16().count() > 1024
                    || entry.last_opened_at > MAX_SAFE_INTEGER
            })
        {
            return Err(invalid("invalid recent directory"));
        }
        Ok(directory)
    }

    pub fn list(&self) -> io::Result<RecentDocumentsSnapshotV1> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("recent directory lock poisoned"))?;
        Ok(snapshot(&self.read_locked()?))
    }

    pub fn resolve(&self, record_id: &str) -> io::Result<Option<PathBuf>> {
        let record_id = validate_record_id(record_id)?;
        let _guard = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("recent directory lock poisoned"))?;
        Ok(self
            .read_locked()?
            .entries
            .into_iter()
            .find(|entry| entry.id == record_id)
            .map(|entry| entry.path))
    }

    pub fn record(&self, path: &Path, name: &str) -> io::Result<RecentDocumentsSnapshotV1> {
        let path = std::fs::canonicalize(path)?;
        if !path.is_file()
            || !valid_path_text(&path)
            || name.is_empty()
            || name.encode_utf16().count() > 1024
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid recent file",
            ));
        }
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(io::Error::other)?
            .as_millis();
        let now = u64::try_from(now).map_err(invalid)?;
        if now > MAX_SAFE_INTEGER {
            return Err(invalid("recent timestamp is outside transport range"));
        }
        let _guard = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("recent directory lock poisoned"))?;
        let mut directory = self.read_locked()?;
        let id = directory
            .entries
            .iter()
            .find(|entry| entry.path == path)
            .map(|entry| entry.id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        directory.entries.retain(|entry| entry.path != path);
        directory.entries.insert(
            0,
            StoredEntry {
                id,
                path,
                name: name.into(),
                last_opened_at: now,
            },
        );
        directory.entries.truncate(MAX_RECENT);
        self.store
            .write(serde_json::to_value(&directory).map_err(invalid)?)?;
        Ok(snapshot(&directory))
    }

    pub fn remove(&self, record_id: &str) -> io::Result<RecentDocumentsSnapshotV1> {
        let record_id = validate_record_id(record_id)?;
        let _guard = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("recent directory lock poisoned"))?;
        let mut directory = self.read_locked()?;
        let old_len = directory.entries.len();
        directory.entries.retain(|entry| entry.id != record_id);
        if old_len != directory.entries.len() {
            self.store
                .write(serde_json::to_value(&directory).map_err(invalid)?)?;
        }
        Ok(snapshot(&directory))
    }
}

fn valid_path_text(path: &Path) -> bool {
    path.to_str()
        .is_some_and(|text| !text.is_empty() && text.encode_utf16().count() <= 32768)
}

pub fn validate_record_id(value: &str) -> io::Result<String> {
    if value.len() != 36 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "invalid recent record ID",
        ));
    }
    Uuid::parse_str(value)
        .map(|id| id.to_string())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "invalid recent record ID"))
}

fn snapshot(directory: &StoredDirectory) -> RecentDocumentsSnapshotV1 {
    RecentDocumentsSnapshotV1 {
        api_version: 1,
        entries: directory
            .entries
            .iter()
            .map(|entry| RecentDocumentV1 {
                id: entry.id.clone(),
                name: entry.name.clone(),
                location: entry.path.to_string_lossy().into_owned(),
                last_opened_at: entry.last_opened_at,
            })
            .collect(),
    }
}

fn invalid(error: impl std::fmt::Display) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, error.to_string())
}

#[cfg(test)]
mod tests;
