use std::fs::File;
#[cfg(windows)]
use std::fs::{self, OpenOptions};
use std::io;
use std::path::Path;

#[cfg(windows)]
const LEASE_FILE: &str = ".application-writer.lock";

/// One managed application owns a configuration directory until its state is dropped.
/// The stable lease file is never deleted: JSON documents may be atomically replaced.
#[derive(Debug)]
pub struct ConfigWriterLease {
    _handle: File,
}

impl ConfigWriterLease {
    pub fn acquire(config_root: &Path) -> io::Result<Self> {
        if config_root.as_os_str().is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "empty configuration directory",
            ));
        }
        acquire(config_root)
    }
}

#[cfg(windows)]
fn acquire(config_root: &Path) -> io::Result<ConfigWriterLease> {
    use std::os::windows::fs::OpenOptionsExt;

    fs::create_dir_all(config_root)?;
    let handle = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .share_mode(0)
        .open(config_root.join(LEASE_FILE))
        .map_err(|error| {
            if error.raw_os_error() == Some(32) {
                io::Error::new(
                    io::ErrorKind::WouldBlock,
                    "此配置目录已由另一个应用实例使用，请关闭该实例后重试",
                )
            } else {
                io::Error::new(error.kind(), format!("无法取得配置写入权限：{error}"))
            }
        })?;
    Ok(ConfigWriterLease { _handle: handle })
}

#[cfg(not(windows))]
fn acquire(_config_root: &Path) -> io::Result<ConfigWriterLease> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "当前配置单写者保护仅支持 Windows，其他桌面目标尚未验收",
    ))
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::io::Read;
    use std::path::PathBuf;
    use std::process::{Child, Command, Stdio};
    use std::time::{Duration, Instant};

    fn root() -> PathBuf {
        std::env::temp_dir().join(format!("config-writer-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn same_process_second_lease_is_rejected_and_drop_allows_reacquisition() {
        let root = root();
        let first = ConfigWriterLease::acquire(&root).expect("first lease");
        let error = ConfigWriterLease::acquire(&root).expect_err("reject second lease");
        assert_eq!(error.kind(), io::ErrorKind::WouldBlock);
        assert!(!root.join("plugin-settings.v1.json").exists());
        drop(first);
        assert!(
            root.join(LEASE_FILE).exists(),
            "stale marker is not the lease"
        );
        drop(ConfigWriterLease::acquire(&root).expect("reacquire after drop"));
        fs::remove_dir_all(root).expect("remove isolated directory");
    }

    #[test]
    fn different_configuration_directories_are_independent() {
        let a = root();
        let b = root();
        let first = ConfigWriterLease::acquire(&a).expect("domain a");
        let second = ConfigWriterLease::acquire(&b).expect("domain b");
        drop(first);
        drop(second);
        fs::remove_dir_all(a).expect("remove domain a");
        fs::remove_dir_all(b).expect("remove domain b");
    }

    #[test]
    fn held_marker_cannot_be_deleted_or_renamed_and_path_aliases_do_not_bypass_it() {
        let root = root();
        let lease = ConfigWriterLease::acquire(&root).expect("lease");
        assert!(fs::remove_file(root.join(LEASE_FILE)).is_err());
        assert!(fs::rename(root.join(LEASE_FILE), root.join("moved.lock")).is_err());
        fs::create_dir(root.join("alias")).expect("create path alias segment");
        assert_eq!(
            ConfigWriterLease::acquire(&root.join("alias").join(".."))
                .unwrap_err()
                .kind(),
            io::ErrorKind::WouldBlock
        );
        drop(lease);
        fs::remove_dir_all(root).expect("remove isolated directory");
    }

    #[test]
    fn acquisition_failure_preserves_existing_data_and_does_not_fall_back() {
        let root = root();
        fs::create_dir_all(root.join(LEASE_FILE)).expect("block lease path with directory");
        fs::write(root.join("plugin-settings.v1.json"), b"existing bytes").expect("seed data");
        assert!(ConfigWriterLease::acquire(&root).is_err());
        assert_eq!(
            fs::read(root.join("plugin-settings.v1.json")).unwrap(),
            b"existing bytes"
        );
        assert!(ConfigWriterLease::acquire(Path::new("")).is_err());
        fs::remove_dir_all(root).expect("remove isolated directory");
    }

    // Run only by the parent process tests, never against a user's configuration directory.
    #[test]
    #[ignore = "subprocess fixture"]
    fn process_holder() {
        let root = std::env::var_os("BRILLIANT_LEASE_TEST_ROOT").expect("test root");
        let lease = ConfigWriterLease::acquire(Path::new(&root)).expect("child lease");
        fs::write(Path::new(&root).join("ready"), b"held").expect("ready marker");
        let mut input = Vec::new();
        std::io::stdin()
            .read_to_end(&mut input)
            .expect("wait for normal exit");
        drop(lease);
    }

    struct Holder {
        child: Child,
        root: PathBuf,
    }

    impl Holder {
        fn start() -> Self {
            let root = root();
            let child = Command::new(std::env::current_exe().expect("test executable"))
                .args([
                    "--exact",
                    "config_writer::tests::process_holder",
                    "--ignored",
                    "--nocapture",
                ])
                .env("BRILLIANT_LEASE_TEST_ROOT", &root)
                .stdin(Stdio::piped())
                .spawn()
                .expect("spawn real native child");
            let mut holder = Self { child, root };
            let deadline = Instant::now() + Duration::from_secs(10);
            while !holder.root.join("ready").exists() {
                assert!(
                    holder.child.try_wait().unwrap().is_none(),
                    "child exited before acquiring"
                );
                assert!(Instant::now() < deadline, "child did not acquire in time");
                std::thread::sleep(Duration::from_millis(10));
            }
            holder
        }
    }

    impl Drop for Holder {
        fn drop(&mut self) {
            let _ = self.child.kill();
            let _ = self.child.wait();
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn another_process_is_rejected_until_normal_exit_then_stale_marker_is_reusable() {
        let mut holder = Holder::start();
        assert_eq!(
            ConfigWriterLease::acquire(&holder.root).unwrap_err().kind(),
            io::ErrorKind::WouldBlock
        );
        drop(holder.child.stdin.take());
        assert!(holder.child.wait().expect("normal child exit").success());
        assert!(holder.root.join(LEASE_FILE).exists());
        drop(ConfigWriterLease::acquire(&holder.root).expect("restart after normal exit"));
    }

    #[test]
    fn forced_process_termination_releases_the_lease_without_marker_cleanup() {
        let mut holder = Holder::start();
        assert_eq!(
            ConfigWriterLease::acquire(&holder.root).unwrap_err().kind(),
            io::ErrorKind::WouldBlock
        );
        holder.child.kill().expect("terminate owned test child");
        holder.child.wait().expect("wait for forced termination");
        assert!(holder.root.join(LEASE_FILE).exists());
        drop(ConfigWriterLease::acquire(&holder.root).expect("restart after forced termination"));
    }
}
