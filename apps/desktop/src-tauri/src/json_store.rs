use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::Value;
use uuid::Uuid;

use crate::document_io::atomic_write_raw;

const MAX_JSON_BYTES: u64 = 256 * 1024;

#[derive(Debug)]
pub struct JsonDocumentStore {
    path: PathBuf,
    gate: Mutex<()>,
}

impl JsonDocumentStore {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            gate: Mutex::new(()),
        }
    }

    pub fn read(&self) -> io::Result<Option<Value>> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("JSON store lock poisoned"))?;
        if !self.path.exists() {
            return Ok(None);
        }
        match read_json(&self.path) {
            Ok(value) => Ok(Some(value)),
            Err(error) if error.kind() == io::ErrorKind::InvalidData => {
                quarantine_invalid(&self.path)?;
                Ok(None)
            }
            Err(error) => Err(error),
        }
    }

    pub fn write(&self, value: Value) -> io::Result<()> {
        if !value.is_object() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "JSON document must be an object",
            ));
        }
        let bytes = serde_json::to_vec_pretty(&value).map_err(io::Error::other)?;
        if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_JSON_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "JSON document is too large",
            ));
        }
        let _guard = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("JSON store lock poisoned"))?;
        let parent = self
            .path
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
            .ok_or_else(|| {
                io::Error::new(io::ErrorKind::InvalidInput, "invalid JSON store path")
            })?;
        fs::create_dir_all(parent)?;
        atomic_write_raw(&self.path, &bytes)
    }
}

fn read_json(path: &Path) -> io::Result<Value> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() > MAX_JSON_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "JSON store file is not a supported regular file",
        ));
    }
    let mut file = fs::File::open(path)?;
    let mut bytes = Vec::with_capacity(usize::try_from(metadata.len()).unwrap_or(0));
    file.read_to_end(&mut bytes)?;
    let value = serde_json::from_slice::<Value>(&bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    if !value.is_object() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "JSON store document must be an object",
        ));
    }
    Ok(value)
}

fn quarantine_invalid(path: &Path) -> io::Result<PathBuf> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("plugin-storage.json");
    let quarantined = path.with_file_name(format!("{file_name}.invalid-{}", Uuid::new_v4()));
    fs::rename(path, &quarantined)?;
    Ok(quarantined)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_store() -> (PathBuf, JsonDocumentStore) {
        let root = std::env::temp_dir().join(format!("brilliant-json-store-{}", Uuid::new_v4()));
        let store = JsonDocumentStore::new(root.join("document.json"));
        (root, store)
    }

    #[test]
    fn missing_document_is_optional_and_does_not_create_a_file() {
        let (root, store) = test_store();
        assert_eq!(store.read().expect("read missing"), None);
        assert!(!root.exists());
    }

    #[test]
    fn object_documents_round_trip_atomically() {
        let (root, store) = test_store();
        let value = serde_json::json!({
            "schemaVersion": 1,
            "enabledPluginIds": ["example.plugin"],
        });
        store.write(value.clone()).expect("write document");
        assert_eq!(store.read().expect("read document"), Some(value));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn malformed_documents_are_quarantined_and_read_as_missing() {
        let (root, store) = test_store();
        fs::create_dir_all(&root).expect("create store directory");
        fs::write(root.join("document.json"), b"{not-json").expect("write malformed document");

        assert_eq!(store.read().expect("recover malformed document"), None);
        assert!(!root.join("document.json").exists());
        assert_eq!(
            fs::read_dir(&root).expect("list quarantined files").count(),
            1
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn scalar_documents_are_rejected_without_overwriting_existing_data() {
        let (root, store) = test_store();
        let original = serde_json::json!({ "schemaVersion": 1 });
        store.write(original.clone()).expect("write original");
        let error = store
            .write(Value::String("invalid".into()))
            .expect_err("reject scalar");
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
        assert_eq!(store.read().expect("read original"), Some(original));
        let _ = fs::remove_dir_all(root);
    }
}
