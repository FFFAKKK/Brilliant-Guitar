use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    capability::{CapabilityInvocation, CapabilityResult},
    document_io::atomic_write_raw,
};

const RECEIPT_SCHEMA_VERSION: u32 = 2;
const MAX_RECEIPT_BYTES: u64 = 1024 * 1024;
const INPUT_HASH_DOMAIN: &[u8] = b"brilliant-capability-input-v1\0";

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct CapabilityReceiptRecord {
    schema_version: u32,
    invocation_id: String,
    capability_id: String,
    contract_version: u64,
    workspace_id: String,
    #[serde(default)]
    input_hash: Option<String>,
    state: CapabilityReceiptState,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
enum CapabilityReceiptState {
    Started,
    Resolved { result: CapabilityResult },
}

#[derive(Clone, Debug, PartialEq)]
pub enum CapabilityReceiptBeginV1 {
    Started,
    Pending,
    Replay(CapabilityResult),
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum CapabilityReceiptLookupV1 {
    NotStarted,
    Started,
    Resolved { result: CapabilityResult },
}

#[derive(Debug)]
pub struct CapabilityReceiptStore {
    root: PathBuf,
    gate: Mutex<()>,
}

impl CapabilityReceiptStore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            gate: Mutex::new(()),
        }
    }

    pub fn begin(&self, invocation: &CapabilityInvocation) -> io::Result<CapabilityReceiptBeginV1> {
        let _guard = self.lock()?;
        let path = self.path(&invocation.invocation_id)?;
        let input_hash = capability_input_hash(&invocation.input)?;
        if path.exists() {
            let record = read_record(&path)?;
            validate_identity(&record, invocation, &input_hash)?;
            return Ok(match record.state {
                CapabilityReceiptState::Started => CapabilityReceiptBeginV1::Pending,
                CapabilityReceiptState::Resolved { result } => {
                    CapabilityReceiptBeginV1::Replay(result)
                }
            });
        }

        fs::create_dir_all(&self.root)?;
        write_record(
            &path,
            &CapabilityReceiptRecord {
                schema_version: RECEIPT_SCHEMA_VERSION,
                invocation_id: invocation.invocation_id.clone(),
                capability_id: invocation.capability_id.clone(),
                contract_version: invocation.contract_version,
                workspace_id: invocation.workspace_id.clone(),
                input_hash: Some(input_hash),
                state: CapabilityReceiptState::Started,
            },
        )?;
        Ok(CapabilityReceiptBeginV1::Started)
    }

    pub fn resolve(
        &self,
        invocation: &CapabilityInvocation,
        result: CapabilityResult,
    ) -> io::Result<()> {
        let _guard = self.lock()?;
        let path = self.path(&invocation.invocation_id)?;
        let existing = read_record(&path)?;
        let input_hash = capability_input_hash(&invocation.input)?;
        validate_identity(&existing, invocation, &input_hash)?;
        write_record(
            &path,
            &CapabilityReceiptRecord {
                state: CapabilityReceiptState::Resolved { result },
                ..existing
            },
        )
    }

    pub fn lookup(
        &self,
        invocation: &CapabilityInvocation,
    ) -> io::Result<CapabilityReceiptLookupV1> {
        let _guard = self.lock()?;
        let path = self.path(&invocation.invocation_id)?;
        if !path.exists() {
            return Ok(CapabilityReceiptLookupV1::NotStarted);
        }
        let record = read_record(&path)?;
        let input_hash = capability_input_hash(&invocation.input)?;
        validate_identity(&record, invocation, &input_hash)?;
        Ok(match record.state {
            CapabilityReceiptState::Started => CapabilityReceiptLookupV1::Started,
            CapabilityReceiptState::Resolved { result } => {
                CapabilityReceiptLookupV1::Resolved { result }
            }
        })
    }

    fn path(&self, invocation_id: &str) -> io::Result<PathBuf> {
        let id = Uuid::parse_str(invocation_id)
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "invalid invocation id"))?;
        Ok(self
            .root
            .join(format!("{}.receipt.v1.json", id.hyphenated())))
    }

    fn lock(&self) -> io::Result<std::sync::MutexGuard<'_, ()>> {
        self.gate
            .lock()
            .map_err(|_| io::Error::other("capability receipt lock poisoned"))
    }
}

fn validate_identity(
    record: &CapabilityReceiptRecord,
    invocation: &CapabilityInvocation,
    input_hash: &str,
) -> io::Result<()> {
    if record.schema_version != RECEIPT_SCHEMA_VERSION
        || record.invocation_id != invocation.invocation_id
        || record.capability_id != invocation.capability_id
        || record.contract_version != invocation.contract_version
        || record.workspace_id != invocation.workspace_id
        || record.input_hash.as_deref() != Some(input_hash)
    {
        return Err(invalid_data("capability receipt identity mismatch"));
    }
    Ok(())
}

fn read_record(path: &Path) -> io::Result<CapabilityReceiptRecord> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() > MAX_RECEIPT_BYTES {
        return Err(invalid_data("invalid capability receipt"));
    }
    let mut bytes = Vec::with_capacity(usize::try_from(metadata.len()).unwrap_or(0));
    fs::File::open(path)?.read_to_end(&mut bytes)?;
    let record = serde_json::from_slice::<CapabilityReceiptRecord>(&bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    if record.schema_version == 0 || record.schema_version > RECEIPT_SCHEMA_VERSION {
        return Err(invalid_data("unsupported capability receipt schema"));
    }
    Ok(record)
}

fn capability_input_hash(input: &Value) -> io::Result<String> {
    let mut canonical = Vec::new();
    write_canonical_json(input, &mut canonical)?;
    let mut digest = Sha256::new();
    digest.update(INPUT_HASH_DOMAIN);
    digest.update(canonical);
    Ok(format!("{:x}", digest.finalize()))
}

fn write_canonical_json(value: &Value, output: &mut Vec<u8>) -> io::Result<()> {
    match value {
        Value::Array(items) => {
            output.push(b'[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    output.push(b',');
                }
                write_canonical_json(item, output)?;
            }
            output.push(b']');
        }
        Value::Object(object) => {
            output.push(b'{');
            let mut keys = object.keys().collect::<Vec<_>>();
            keys.sort_unstable();
            for (index, key) in keys.into_iter().enumerate() {
                if index > 0 {
                    output.push(b',');
                }
                serde_json::to_writer(&mut *output, key).map_err(io::Error::other)?;
                output.push(b':');
                write_canonical_json(&object[key], output)?;
            }
            output.push(b'}');
        }
        _ => serde_json::to_writer(output, value).map_err(io::Error::other)?,
    }
    Ok(())
}

fn write_record(path: &Path, record: &CapabilityReceiptRecord) -> io::Result<()> {
    let bytes = serde_json::to_vec_pretty(record).map_err(io::Error::other)?;
    if bytes.len() as u64 > MAX_RECEIPT_BYTES {
        return Err(invalid_data("capability receipt exceeds size limit"));
    }
    atomic_write_raw(path, &bytes)
}

fn invalid_data(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::capability::CapabilityCaller;

    fn store() -> (PathBuf, CapabilityReceiptStore) {
        let root =
            std::env::temp_dir().join(format!("brilliant-capability-receipts-{}", Uuid::new_v4()));
        (root.clone(), CapabilityReceiptStore::new(root))
    }

    fn invocation(id: &str) -> CapabilityInvocation {
        CapabilityInvocation {
            invocation_id: id.to_owned(),
            capability_id: "score.read-summary".into(),
            contract_version: 1,
            workspace_id: Uuid::new_v4().to_string(),
            caller: CapabilityCaller::Test,
            input: json!({}),
        }
    }

    fn completed(invocation: &CapabilityInvocation) -> CapabilityResult {
        CapabilityResult::Completed {
            invocation_id: invocation.invocation_id.clone(),
            capability_id: invocation.capability_id.clone(),
            contract_version: invocation.contract_version,
            data: json!({ "measureCount": 4 }),
        }
    }

    #[test]
    fn receipt_moves_from_not_started_to_started_and_resolved() {
        let (root, store) = store();
        let invocation = invocation(&Uuid::new_v4().to_string());
        assert_eq!(
            store.lookup(&invocation).expect("lookup missing"),
            CapabilityReceiptLookupV1::NotStarted
        );
        assert_eq!(
            store.begin(&invocation).expect("begin receipt"),
            CapabilityReceiptBeginV1::Started
        );
        assert_eq!(
            store.lookup(&invocation).expect("lookup started"),
            CapabilityReceiptLookupV1::Started
        );
        let result = completed(&invocation);
        store
            .resolve(&invocation, result.clone())
            .expect("resolve receipt");
        assert_eq!(
            store.lookup(&invocation).expect("lookup resolved"),
            CapabilityReceiptLookupV1::Resolved { result }
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn duplicate_identity_replays_result_and_mismatch_is_rejected() {
        let (root, store) = store();
        let id = Uuid::new_v4().to_string();
        let original = invocation(&id);
        let result = completed(&original);
        store.begin(&original).expect("begin receipt");
        store
            .resolve(&original, result.clone())
            .expect("resolve receipt");
        assert_eq!(
            store.begin(&original).expect("replay receipt"),
            CapabilityReceiptBeginV1::Replay(result)
        );
        let mut mismatch = invocation(&id);
        mismatch.workspace_id = Uuid::new_v4().to_string();
        assert_eq!(
            store.begin(&mismatch).expect_err("reject mismatch").kind(),
            io::ErrorKind::InvalidData
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn canonical_input_identity_ignores_object_key_order_but_rejects_changed_values() {
        let (root, store) = store();
        let id = Uuid::new_v4().to_string();
        let mut original = invocation(&id);
        original.input = json!({ "range": { "end": 8, "start": 4 }, "voices": [1, 2] });
        assert_eq!(
            capability_input_hash(&original.input).expect("hash input"),
            "7134c21041484d2eb7be35e5b41db5cc3f7bcbc21b92518cfbb64bf822b71389"
        );
        let result = completed(&original);
        store.begin(&original).expect("begin receipt");
        store
            .resolve(&original, result.clone())
            .expect("resolve receipt");

        let mut reordered = original.clone();
        reordered.input = serde_json::from_str(r#"{"voices":[1,2],"range":{"start":4,"end":8}}"#)
            .expect("parse reordered input");
        assert_eq!(
            store.begin(&reordered).expect("replay canonical input"),
            CapabilityReceiptBeginV1::Replay(result)
        );

        let mut changed = reordered;
        changed.input = json!({ "range": { "end": 9, "start": 4 }, "voices": [1, 2] });
        assert_eq!(
            store
                .begin(&changed)
                .expect_err("reject changed input")
                .kind(),
            io::ErrorKind::InvalidData
        );
        assert_eq!(
            store
                .lookup(&changed)
                .expect_err("reject lookup mismatch")
                .kind(),
            io::ErrorKind::InvalidData
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn legacy_receipt_without_input_identity_is_never_replayed() {
        let (root, store) = store();
        let invocation = invocation(&Uuid::new_v4().to_string());
        fs::create_dir_all(&root).expect("create receipt root");
        write_record(
            &store.path(&invocation.invocation_id).expect("receipt path"),
            &CapabilityReceiptRecord {
                schema_version: 1,
                invocation_id: invocation.invocation_id.clone(),
                capability_id: invocation.capability_id.clone(),
                contract_version: invocation.contract_version,
                workspace_id: invocation.workspace_id.clone(),
                input_hash: None,
                state: CapabilityReceiptState::Resolved {
                    result: completed(&invocation),
                },
            },
        )
        .expect("write legacy receipt");

        assert_eq!(
            store
                .begin(&invocation)
                .expect_err("legacy receipt must not replay")
                .kind(),
            io::ErrorKind::InvalidData
        );
        assert_eq!(
            store
                .lookup(&invocation)
                .expect_err("legacy receipt must require reconciliation")
                .kind(),
            io::ErrorKind::InvalidData
        );
        let _ = fs::remove_dir_all(root);
    }
}
