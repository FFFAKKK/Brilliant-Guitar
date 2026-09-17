use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::time::Duration;

use uuid::Uuid;

use crate::error::HostError;

const MAX_DOCUMENT_BYTES: u64 = 32 * 1024 * 1024;
const RECOVERY_DEBOUNCE: Duration = Duration::from_millis(250);

enum RecoveryCommand {
    Persist { path: PathBuf, contents: String },
    Remove { path: PathBuf, done: Sender<bool> },
    Flush { done: Sender<bool> },
}

pub struct RecoveryManager {
    sender: Sender<RecoveryCommand>,
}

impl Default for RecoveryManager {
    fn default() -> Self {
        let (sender, receiver) = mpsc::channel();
        std::thread::Builder::new()
            .name("brilliant-recovery-writer".into())
            .spawn(move || recovery_worker(receiver))
            .expect("failed to start recovery writer");
        Self { sender }
    }
}

impl RecoveryManager {
    pub fn schedule(&self, path: PathBuf, contents: String) -> Result<(), HostError> {
        self.sender
            .send(RecoveryCommand::Persist { path, contents })
            .map_err(|_| recovery_error("无法安排乐谱恢复写入"))
    }

    pub fn remove(&self, path: PathBuf) -> Result<(), HostError> {
        let (done, result) = mpsc::channel();
        self.sender
            .send(RecoveryCommand::Remove { path, done })
            .map_err(|_| recovery_error("无法清理乐谱恢复文件"))?;
        match result.recv() {
            Ok(true) => Ok(()),
            _ => Err(recovery_error("无法清理乐谱恢复文件")),
        }
    }

    pub fn flush(&self) -> Result<(), HostError> {
        let (done, result) = mpsc::channel();
        self.sender
            .send(RecoveryCommand::Flush { done })
            .map_err(|_| recovery_error("无法确认乐谱恢复写入"))?;
        match result.recv() {
            Ok(true) => Ok(()),
            _ => Err(recovery_error("无法确认乐谱恢复写入")),
        }
    }
}

fn recovery_worker(receiver: Receiver<RecoveryCommand>) {
    let mut pending = std::collections::HashMap::<PathBuf, String>::new();
    loop {
        match receiver.recv_timeout(RECOVERY_DEBOUNCE) {
            Ok(RecoveryCommand::Persist { path, contents }) => {
                pending.insert(path, contents);
            }
            Ok(RecoveryCommand::Remove { path, done }) => {
                pending.remove(&path);
                let removed = match fs::remove_file(path) {
                    Ok(()) => true,
                    Err(error) => error.kind() == std::io::ErrorKind::NotFound,
                };
                let _ = done.send(removed);
            }
            Ok(RecoveryCommand::Flush { done }) => {
                let _ = done.send(flush_recovery(&mut pending));
            }
            Err(RecvTimeoutError::Timeout) => {
                let _ = flush_recovery(&mut pending);
            }
            Err(RecvTimeoutError::Disconnected) => {
                let _ = flush_recovery(&mut pending);
                break;
            }
        }
    }
}

fn flush_recovery(pending: &mut std::collections::HashMap<PathBuf, String>) -> bool {
    let writes = std::mem::take(pending);
    let mut succeeded = true;
    for (path, contents) in writes {
        if atomic_write(&path, contents.as_bytes()).is_err() {
            succeeded = false;
            pending.insert(path, contents);
        }
    }
    succeeded
}

pub fn read_document(path: &Path) -> Result<String, HostError> {
    let metadata = fs::metadata(path).map_err(|_| file_error("无法读取所选文件", true))?;
    if !metadata.is_file() || metadata.len() > MAX_DOCUMENT_BYTES {
        return Err(file_error("文件过大或不是普通项目文件", false));
    }
    let mut file = File::open(path).map_err(|_| file_error("无法读取所选文件", true))?;
    let mut text = String::with_capacity(usize::try_from(metadata.len()).unwrap_or(0));
    file.read_to_string(&mut text)
        .map_err(|_| file_error("项目文件不是有效的 UTF-8 文本", false))?;
    Ok(text)
}

pub fn normalize_save_path(mut path: PathBuf) -> PathBuf {
    let has_json_suffix = path
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.to_ascii_lowercase().ends_with(".json"));
    if !has_json_suffix {
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("未命名乐谱");
        path.set_file_name(format!("{name}.bgp.json"));
    }
    path
}

pub fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), HostError> {
    atomic_write_inner(path, contents).map_err(|stage| match stage {
        AtomicWriteStage::InvalidPath => file_error("保存位置无效", false),
        AtomicWriteStage::MissingDirectory => file_error("保存目录不存在", false),
        AtomicWriteStage::Create => file_error("无法在保存目录创建临时文件", true),
        AtomicWriteStage::Write => file_error("写入乐谱文件失败", true),
        AtomicWriteStage::Sync => file_error("无法确认乐谱文件已写入磁盘", true),
        AtomicWriteStage::Replace => file_error("无法原子替换目标文件", true),
    })
}

pub(crate) fn atomic_write_raw(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    atomic_write_inner(path, contents).map_err(|stage| {
        std::io::Error::other(match stage {
            AtomicWriteStage::InvalidPath => "invalid save path",
            AtomicWriteStage::MissingDirectory => "save directory does not exist",
            AtomicWriteStage::Create => "cannot create temporary file",
            AtomicWriteStage::Write => "cannot write temporary file",
            AtomicWriteStage::Sync => "cannot sync temporary file",
            AtomicWriteStage::Replace => "cannot atomically replace target",
        })
    })
}

#[derive(Clone, Copy)]
enum AtomicWriteStage {
    InvalidPath,
    MissingDirectory,
    Create,
    Write,
    Sync,
    Replace,
}

fn atomic_write_inner(path: &Path, contents: &[u8]) -> Result<(), AtomicWriteStage> {
    let parent = path
        .parent()
        .filter(|value| !value.as_os_str().is_empty())
        .ok_or(AtomicWriteStage::InvalidPath)?;
    if !parent.is_dir() {
        return Err(AtomicWriteStage::MissingDirectory);
    }
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("score.bgp.json");
    let temp = parent.join(format!(".{file_name}.{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp)
            .map_err(|_| AtomicWriteStage::Create)?;
        file.write_all(contents)
            .map_err(|_| AtomicWriteStage::Write)?;
        file.flush()
            .and_then(|_| file.sync_all())
            .map_err(|_| AtomicWriteStage::Sync)?;
        replace_file(&temp, path).map_err(|_| AtomicWriteStage::Replace)?;
        sync_parent(parent);
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

pub fn prepare_recovery_path(path: &Path) -> Result<(), HostError> {
    let parent = path.parent().ok_or_else(HostError::internal)?;
    fs::create_dir_all(parent).map_err(|_| file_error("无法创建恢复目录", true))?;
    Ok(())
}

pub fn read_recovery(path: &Path) -> Result<Option<String>, HostError> {
    if !path.exists() {
        return Ok(None);
    }
    read_document(path).map(Some)
}

pub fn quarantine_recovery(path: &Path) -> Result<PathBuf, HostError> {
    quarantine_file(path)
}

fn quarantine_file(path: &Path) -> Result<PathBuf, HostError> {
    let parent = path.parent().ok_or_else(HostError::internal)?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("recovery.bgp.json");
    let quarantined = parent.join(format!("{file_name}.invalid-{}", Uuid::new_v4()));
    fs::rename(path, &quarantined).map_err(|_| recovery_error("恢复文件损坏且无法安全隔离"))?;
    Ok(quarantined)
}

#[cfg(not(windows))]
fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    fs::rename(source, target)
}

#[cfg(windows)]
fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    // SAFETY: both buffers are NUL-terminated and remain alive for the duration of the call.
    let moved = unsafe {
        MoveFileExW(
            source.as_ptr(),
            target.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn sync_parent(parent: &Path) {
    if let Ok(directory) = File::open(parent) {
        let _ = directory.sync_all();
    }
}

#[cfg(windows)]
fn sync_parent(_parent: &Path) {}

fn file_error(message: &str, retryable: bool) -> HostError {
    HostError::issue(
        "file.io-failed",
        message,
        422,
        crate::dto::WorkbenchIssueSource::File,
        crate::dto::WorkbenchIssueTarget::Component {
            component_id: "navigation.file".into(),
        },
        Some(retryable),
    )
}

fn recovery_error(message: &str) -> HostError {
    HostError::issue(
        "file.recovery-unavailable",
        message,
        503,
        crate::dto::WorkbenchIssueSource::File,
        crate::dto::WorkbenchIssueTarget::Component {
            component_id: "navigation.file".into(),
        },
        Some(true),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_replaces_existing_file_without_leaving_temp_files() {
        let directory = std::env::temp_dir().join(format!("brilliant-atomic-{}", Uuid::new_v4()));
        fs::create_dir(&directory).expect("create temp directory");
        let target = directory.join("score.bgp.json");
        fs::write(&target, b"old").expect("seed target");

        atomic_write(&target, b"new").expect("atomic write");

        assert_eq!(fs::read(&target).expect("read target"), b"new");
        assert_eq!(fs::read_dir(&directory).expect("list directory").count(), 1);
        fs::remove_dir_all(directory).expect("remove temp directory");
    }

    #[test]
    fn save_path_adds_project_suffix_only_when_needed() {
        assert!(normalize_save_path(PathBuf::from("作品")).ends_with("作品.bgp.json"));
        assert!(normalize_save_path(PathBuf::from("作品.json")).ends_with("作品.json"));
        assert!(normalize_save_path(PathBuf::from("作品.bgp.json")).ends_with("作品.bgp.json"));
    }

    #[test]
    fn recovery_writer_coalesces_latest_document_and_cancels_pending_writes() {
        let directory = std::env::temp_dir().join(format!("brilliant-recovery-{}", Uuid::new_v4()));
        fs::create_dir(&directory).expect("create recovery directory");
        let first = directory.join("first.bgp.json");
        let cancelled = directory.join("cancelled.bgp.json");
        let manager = RecoveryManager::default();

        manager
            .schedule(first.clone(), "old".into())
            .expect("schedule old");
        manager
            .schedule(first.clone(), "new".into())
            .expect("schedule new");
        manager
            .schedule(cancelled.clone(), "discarded".into())
            .expect("schedule cancelled");
        manager.remove(cancelled.clone()).expect("cancel recovery");
        manager.flush().expect("flush recovery");

        assert_eq!(
            fs::read_to_string(first).expect("read latest recovery"),
            "new"
        );
        assert!(!cancelled.exists());
        fs::remove_dir_all(directory).expect("remove recovery directory");
    }

    #[test]
    fn corrupt_recovery_is_quarantined_without_deleting_its_bytes() {
        let directory =
            std::env::temp_dir().join(format!("brilliant-quarantine-{}", Uuid::new_v4()));
        fs::create_dir(&directory).expect("create quarantine directory");
        let recovery = directory.join("workspace.bgp.json");
        fs::write(&recovery, b"not valid score json").expect("write corrupt recovery");

        let quarantined = quarantine_file(&recovery).expect("quarantine recovery");

        assert!(!recovery.exists());
        assert_eq!(
            fs::read(quarantined).expect("read quarantined bytes"),
            b"not valid score json"
        );
        fs::remove_dir_all(directory).expect("remove quarantine directory");
    }
}
