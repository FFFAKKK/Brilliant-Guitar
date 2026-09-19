use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::document_io::atomic_write_raw;

const RUN_SCHEMA_VERSION: u32 = 1;
const RUN_FILE_NAME: &str = "run.v1.json";
const MAX_RUN_BYTES: u64 = 8 * 1024 * 1024;
const MAX_RUN_ID_BYTES: usize = 128;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunEventRecordV1 {
    pub event_id: String,
    pub run_id: String,
    pub sequence: u64,
    pub occurred_at: u64,
    pub event: Value,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunStoreEntryV1 {
    pub schema_version: u32,
    pub run: Value,
    pub events: Vec<AgentRunEventRecordV1>,
    pub last_sequence: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunStoreCommitInputV1 {
    pub run_id: String,
    pub expected_sequence: u64,
    pub event: AgentRunEventRecordV1,
    pub next_run: Value,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentRunStoreInvalidCodeV1 {
    RunMismatch,
    EventSequence,
    SnapshotSequence,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum AgentRunStoreCommitResultV1 {
    Committed { entry: AgentRunStoreEntryV1 },
    SequenceConflict { current_sequence: u64 },
    Invalid { code: AgentRunStoreInvalidCodeV1 },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunRecoverySummaryV1 {
    pub run_id: String,
    pub workspace_id: String,
    pub goal: String,
    pub state: Value,
    pub last_sequence: u64,
}

#[derive(Debug)]
pub struct AgentRunStore {
    root: PathBuf,
    gate: Mutex<()>,
}

impl AgentRunStore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            gate: Mutex::new(()),
        }
    }

    pub fn load(&self, run_id: &str) -> io::Result<Option<AgentRunStoreEntryV1>> {
        let _guard = self.lock()?;
        let path = self.run_file_path(run_id)?;
        if !path.exists() {
            return Ok(None);
        }
        read_entry_or_quarantine(&path, run_id).map(Some)
    }

    pub fn commit(
        &self,
        input: AgentRunStoreCommitInputV1,
    ) -> io::Result<AgentRunStoreCommitResultV1> {
        let _guard = self.lock()?;
        validate_run_id(&input.run_id)?;

        if input.event.run_id != input.run_id || run_id(&input.next_run) != Some(&input.run_id) {
            return Ok(AgentRunStoreCommitResultV1::Invalid {
                code: AgentRunStoreInvalidCodeV1::RunMismatch,
            });
        }
        let Some(next_sequence) = input.expected_sequence.checked_add(1) else {
            return Ok(AgentRunStoreCommitResultV1::Invalid {
                code: AgentRunStoreInvalidCodeV1::EventSequence,
            });
        };
        if input.event.sequence != next_sequence {
            return Ok(AgentRunStoreCommitResultV1::Invalid {
                code: AgentRunStoreInvalidCodeV1::EventSequence,
            });
        }
        if snapshot_last_event(&input.next_run).as_ref() != Some(&input.event) {
            return Ok(AgentRunStoreCommitResultV1::Invalid {
                code: AgentRunStoreInvalidCodeV1::SnapshotSequence,
            });
        }

        let path = self.run_file_path(&input.run_id)?;
        let existing = if path.exists() {
            Some(read_entry_or_quarantine(&path, &input.run_id)?)
        } else {
            None
        };
        let current_sequence = existing.as_ref().map_or(0, |entry| entry.last_sequence);
        if current_sequence != input.expected_sequence {
            return Ok(AgentRunStoreCommitResultV1::SequenceConflict { current_sequence });
        }

        let mut events = existing.map_or_else(Vec::new, |entry| entry.events);
        events.push(input.event);
        let entry = AgentRunStoreEntryV1 {
            schema_version: RUN_SCHEMA_VERSION,
            run: input.next_run,
            last_sequence: events.last().map_or(0, |event| event.sequence),
            events,
        };
        validate_entry(&entry, &input.run_id)?;

        let run_root = path
            .parent()
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "invalid agent run path"))?;
        fs::create_dir_all(run_root)?;
        let bytes = serde_json::to_vec_pretty(&entry).map_err(io::Error::other)?;
        if bytes.len() as u64 > MAX_RUN_BYTES {
            return Err(invalid_data("agent run record exceeds size limit"));
        }
        atomic_write_raw(&path, &bytes)?;

        Ok(AgentRunStoreCommitResultV1::Committed { entry })
    }

    pub fn list_recoverable(&self) -> io::Result<Vec<AgentRunRecoverySummaryV1>> {
        let _guard = self.lock()?;
        if !self.root.exists() {
            return Ok(Vec::new());
        }

        let mut summaries = Vec::new();
        for item in fs::read_dir(&self.root)? {
            let item = item?;
            if !item.file_type()?.is_dir() {
                continue;
            }
            let Some(run_id) = item.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if validate_run_id(&run_id).is_err() {
                continue;
            }
            let path = item.path().join(RUN_FILE_NAME);
            if !path.exists() {
                continue;
            }
            let entry = match read_entry_or_quarantine(&path, &run_id) {
                Ok(entry) => entry,
                Err(error) if error.kind() == io::ErrorKind::InvalidData => continue,
                Err(error) => return Err(error),
            };
            if lifecycle(&entry.run) == Some("terminal") {
                continue;
            }
            summaries.push(AgentRunRecoverySummaryV1 {
                run_id: run_id.clone(),
                workspace_id: required_string(&entry.run, &["workspace", "workspaceId"])?
                    .to_owned(),
                goal: required_string(&entry.run, &["goal"])?.to_owned(),
                state: entry
                    .run
                    .get("state")
                    .cloned()
                    .ok_or_else(|| invalid_data("agent run state is missing"))?,
                last_sequence: entry.last_sequence,
            });
        }
        summaries.sort_by(|left, right| left.run_id.cmp(&right.run_id));
        Ok(summaries)
    }

    pub fn quarantine(&self, run_id: &str) -> io::Result<bool> {
        let _guard = self.lock()?;
        let path = self.run_file_path(run_id)?;
        if !path.exists() {
            return Ok(false);
        }
        quarantine_invalid(&path)?;
        Ok(true)
    }

    fn lock(&self) -> io::Result<std::sync::MutexGuard<'_, ()>> {
        self.gate
            .lock()
            .map_err(|_| io::Error::other("agent run store lock poisoned"))
    }

    fn run_file_path(&self, run_id: &str) -> io::Result<PathBuf> {
        validate_run_id(run_id)?;
        Ok(self.root.join(run_id).join(RUN_FILE_NAME))
    }
}

fn read_entry_or_quarantine(
    path: &Path,
    expected_run_id: &str,
) -> io::Result<AgentRunStoreEntryV1> {
    match read_entry(path, expected_run_id) {
        Ok(entry) => Ok(entry),
        Err(error) if error.kind() == io::ErrorKind::InvalidData => {
            quarantine_invalid(path)?;
            Err(error)
        }
        Err(error) => Err(error),
    }
}

fn read_entry(path: &Path, expected_run_id: &str) -> io::Result<AgentRunStoreEntryV1> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() > MAX_RUN_BYTES {
        return Err(invalid_data("invalid agent run record"));
    }
    let mut bytes = Vec::with_capacity(usize::try_from(metadata.len()).unwrap_or(0));
    fs::File::open(path)?.read_to_end(&mut bytes)?;
    let entry = serde_json::from_slice::<AgentRunStoreEntryV1>(&bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    validate_entry(&entry, expected_run_id)?;
    Ok(entry)
}

fn validate_entry(entry: &AgentRunStoreEntryV1, expected_run_id: &str) -> io::Result<()> {
    if entry.schema_version != RUN_SCHEMA_VERSION || run_id(&entry.run) != Some(expected_run_id) {
        return Err(invalid_data("agent run identity is invalid"));
    }
    let run_events = entry
        .run
        .get("events")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid_data("agent run events are missing"))?;
    if run_events.len() != entry.events.len() {
        return Err(invalid_data("agent run event history is inconsistent"));
    }

    let mut expected_sequence = 1_u64;
    for (persisted, snapshot) in entry.events.iter().zip(run_events) {
        if persisted.run_id != expected_run_id || persisted.sequence != expected_sequence {
            return Err(invalid_data("agent run event sequence is invalid"));
        }
        if serde_json::to_value(persisted).map_err(io::Error::other)? != *snapshot {
            return Err(invalid_data("agent run event snapshot is inconsistent"));
        }
        expected_sequence = expected_sequence
            .checked_add(1)
            .ok_or_else(|| invalid_data("agent run event sequence overflow"))?;
    }

    let last_sequence = entry.events.last().map_or(0, |event| event.sequence);
    if entry.last_sequence != last_sequence {
        return Err(invalid_data("agent run last sequence is invalid"));
    }
    required_string(&entry.run, &["workspace", "workspaceId"])?;
    required_string(&entry.run, &["goal"])?;
    match lifecycle(&entry.run) {
        Some("active" | "waiting" | "recovering" | "terminal") => Ok(()),
        _ => Err(invalid_data("agent run lifecycle is invalid")),
    }
}

fn validate_run_id(run_id: &str) -> io::Result<()> {
    if run_id.is_empty()
        || run_id.len() > MAX_RUN_ID_BYTES
        || !run_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "invalid agent run id",
        ));
    }
    Ok(())
}

fn run_id(run: &Value) -> Option<&str> {
    run.get("runId").and_then(Value::as_str)
}

fn lifecycle(run: &Value) -> Option<&str> {
    run.get("state")
        .and_then(|state| state.get("lifecycle"))
        .and_then(Value::as_str)
}

fn snapshot_last_event(run: &Value) -> Option<AgentRunEventRecordV1> {
    let value = run.get("events")?.as_array()?.last()?;
    serde_json::from_value::<AgentRunEventRecordV1>(value.clone()).ok()
}

fn required_string<'a>(value: &'a Value, path: &[&str]) -> io::Result<&'a str> {
    let mut current = value;
    for segment in path {
        current = current
            .get(*segment)
            .ok_or_else(|| invalid_data("agent run field is missing"))?;
    }
    current
        .as_str()
        .filter(|text| !text.is_empty())
        .ok_or_else(|| invalid_data("agent run field is invalid"))
}

fn quarantine_invalid(path: &Path) -> io::Result<PathBuf> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(RUN_FILE_NAME);
    let quarantined = path.with_file_name(format!("{name}.invalid-{}", Uuid::new_v4()));
    fs::rename(path, &quarantined)?;
    Ok(quarantined)
}

fn invalid_data(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn store() -> (PathBuf, AgentRunStore) {
        let root = std::env::temp_dir().join(format!("brilliant-agent-runs-{}", Uuid::new_v4()));
        (root.clone(), AgentRunStore::new(root))
    }

    fn event(run_id: &str, sequence: u64) -> AgentRunEventRecordV1 {
        AgentRunEventRecordV1 {
            event_id: format!("event-{sequence}"),
            run_id: run_id.to_owned(),
            sequence,
            occurred_at: sequence * 10,
            event: json!({ "type": if sequence == 1 { "run.created" } else { "run.prepared" } }),
        }
    }

    fn run(run_id: &str, lifecycle: &str, events: &[AgentRunEventRecordV1]) -> Value {
        json!({
            "runId": run_id,
            "workspace": { "workspaceId": "workspace-1", "documentId": null, "documentVersion": null, "selection": null },
            "goal": "Read the score summary",
            "state": { "lifecycle": lifecycle, "phase": "preparing" },
            "createdAt": 10,
            "policy": {},
            "intent": {},
            "events": events,
            "turns": [],
            "invocations": [],
            "contextItems": []
        })
    }

    fn commit_input(
        run_id: &str,
        expected_sequence: u64,
        lifecycle: &str,
        history: &[AgentRunEventRecordV1],
    ) -> AgentRunStoreCommitInputV1 {
        let next = event(run_id, expected_sequence + 1);
        let mut events = history.to_vec();
        events.push(next.clone());
        AgentRunStoreCommitInputV1 {
            run_id: run_id.to_owned(),
            expected_sequence,
            event: next,
            next_run: run(run_id, lifecycle, &events),
        }
    }

    #[test]
    fn first_commit_is_durable_and_loadable() {
        let (root, store) = store();
        let result = store
            .commit(commit_input("run-1", 0, "active", &[]))
            .expect("commit first event");
        let AgentRunStoreCommitResultV1::Committed { entry } = result else {
            panic!("expected committed result");
        };
        assert_eq!(entry.last_sequence, 1);
        assert_eq!(store.load("run-1").expect("load run"), Some(entry));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn stale_writer_receives_sequence_conflict() {
        let (root, store) = store();
        store
            .commit(commit_input("run-1", 0, "active", &[]))
            .expect("commit first event");
        let result = store
            .commit(commit_input("run-1", 0, "active", &[]))
            .expect("reject stale writer");
        assert_eq!(
            result,
            AgentRunStoreCommitResultV1::SequenceConflict {
                current_sequence: 1
            }
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn mismatched_snapshot_event_is_rejected() {
        let (root, store) = store();
        let mut input = commit_input("run-1", 0, "active", &[]);
        input.next_run["events"] = json!([]);
        assert_eq!(
            store.commit(input).expect("reject invalid snapshot"),
            AgentRunStoreCommitResultV1::Invalid {
                code: AgentRunStoreInvalidCodeV1::SnapshotSequence
            }
        );
        assert!(!root.exists());
    }

    #[test]
    fn malformed_record_is_quarantined() {
        let (root, store) = store();
        let run_root = root.join("run-1");
        fs::create_dir_all(&run_root).expect("create run root");
        fs::write(run_root.join(RUN_FILE_NAME), b"{broken").expect("write broken run");
        let error = store.load("run-1").expect_err("reject broken run");
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
        assert!(!run_root.join(RUN_FILE_NAME).exists());
        assert_eq!(fs::read_dir(&run_root).expect("list run root").count(), 1);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn terminal_runs_are_not_recoverable() {
        let (root, store) = store();
        store
            .commit(commit_input("active-run", 0, "active", &[]))
            .expect("commit active run");
        store
            .commit(commit_input("terminal-run", 0, "terminal", &[]))
            .expect("commit terminal run");
        let recoverable = store.list_recoverable().expect("list recoverable runs");
        assert_eq!(recoverable.len(), 1);
        assert_eq!(recoverable[0].run_id, "active-run");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn storage_failure_does_not_create_a_partial_run() {
        let (root, store) = store();
        fs::write(&root, b"not-a-directory").expect("create storage blocker");
        assert!(
            store
                .commit(commit_input("run-1", 0, "active", &[]))
                .is_err()
        );
        assert_eq!(fs::read(&root).expect("read blocker"), b"not-a-directory");
        let _ = fs::remove_file(root);
    }
}
