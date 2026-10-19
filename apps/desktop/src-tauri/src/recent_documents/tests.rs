use super::*;

fn directory() -> PathBuf {
    let root = std::env::temp_dir().join(format!("brilliant-recent-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    root
}
fn project(root: &Path, name: &str) -> PathBuf {
    let path = root.join(name);
    std::fs::write(&path, b"preserved project bytes").unwrap();
    path
}

#[test]
fn recent_directory_caps_reorders_deduplicates_and_survives_recreation() {
    let root = directory();
    let file = root.join("config/recent-documents.v1.json");
    let store = RecentDocumentsStore::new(file.clone());
    assert!(store.list().unwrap().entries.is_empty());
    let paths: Vec<_> = (0..21)
        .map(|index| project(&root, &format!("piece-{index}.json")))
        .collect();
    let first = store.record(&paths[0], "first").unwrap().entries[0]
        .id
        .clone();
    for path in &paths[1..20] {
        store.record(path, "piece").unwrap();
    }
    let promoted = store
        .record(&root.join(".").join("piece-0.json"), "renamed")
        .unwrap();
    assert_eq!(promoted.entries.len(), 20);
    assert_eq!(promoted.entries[0].id, first);
    assert_eq!(promoted.entries[0].name, "renamed");
    store.record(&paths[20], "last").unwrap();
    let listed = store.list().unwrap();
    assert_eq!(listed.entries.len(), 20);
    assert_eq!(listed.entries[0].name, "last");
    assert_eq!(listed.entries[1].id, first);
    assert!(
        !listed
            .entries
            .iter()
            .any(|entry| entry.location.ends_with("piece-1.json"))
    );
    drop(store);
    assert_eq!(RecentDocumentsStore::new(file).list().unwrap(), listed);
    let wire = serde_json::to_value(&listed).unwrap();
    assert_eq!(wire["apiVersion"], 1);
    assert!(wire["entries"][0].get("path").is_none());
    std::fs::remove_dir_all(root).unwrap();
}

#[cfg(windows)]
#[test]
fn actual_windows_canonicalization_deduplicates_case_aliases() {
    let root = directory();
    let path = project(&root, "Case-A.json");
    let store = RecentDocumentsStore::new(root.join("recent.json"));
    let first = store.record(&path, "first").unwrap();
    let second = store
        .record(
            &PathBuf::from(path.to_str().unwrap().to_ascii_uppercase()),
            "again",
        )
        .unwrap();
    assert_eq!(second.entries.len(), 1);
    assert_eq!(second.entries[0].id, first.entries[0].id);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn concurrent_recent_updates_keep_every_accepted_record() {
    let root = directory();
    let store = std::sync::Arc::new(RecentDocumentsStore::new(root.join("recent.json")));
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(13));
    let threads: Vec<_> = (0..12)
        .map(|index| {
            let path = project(&root, &format!("{index}.json"));
            let store = store.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                store.record(&path, "piece").unwrap();
            })
        })
        .collect();
    barrier.wait();
    for thread in threads {
        thread.join().unwrap();
    }
    assert_eq!(store.list().unwrap().entries.len(), 12);
    drop(store);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn recent_removal_is_idempotent_and_never_deletes_the_project() {
    let root = directory();
    let path = project(&root, "keep.json");
    let store = RecentDocumentsStore::new(root.join("recent.json"));
    let accepted = store.record(&path, "keep").unwrap();
    let id = &accepted.entries[0].id;
    assert_eq!(
        store.resolve(id).unwrap(),
        Some(std::fs::canonicalize(&path).unwrap())
    );
    assert!(store.remove(id).unwrap().entries.is_empty());
    assert!(store.remove(id).unwrap().entries.is_empty());
    assert_eq!(store.resolve(id).unwrap(), None);
    for invalid in ["../keep.json", "", "not-an-id"] {
        assert!(store.remove(invalid).is_err());
        assert!(store.resolve(invalid).is_err());
    }
    assert_eq!(std::fs::read(path).unwrap(), b"preserved project bytes");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn future_or_structurally_invalid_recent_data_is_not_overwritten() {
    let root = directory();
    let path = project(&root, "piece.json");
    let file = root.join("recent.json");
    let store = RecentDocumentsStore::new(file.clone());
    for value in [
        serde_json::json!({"schemaVersion":2,"entries":[]}),
        serde_json::json!({"schemaVersion":1,"entries":[{"id":"wrong","path":"relative","name":"x","lastOpenedAt":0}]}),
        serde_json::json!({"schemaVersion":1,"entries":[],"future":true}),
    ] {
        let bytes = serde_json::to_vec(&value).unwrap();
        std::fs::write(&file, &bytes).unwrap();
        assert!(store.list().is_err());
        assert!(store.record(&path, "piece").is_err());
        assert!(store.remove(&Uuid::new_v4().to_string()).is_err());
        assert_eq!(std::fs::read(&file).unwrap(), bytes);
    }
    std::fs::write(&file, b"{broken").unwrap();
    assert!(store.list().unwrap().entries.is_empty());
    let quarantined = std::fs::read_dir(&root)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .find(|path| {
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("recent.json.invalid-")
        })
        .unwrap();
    assert_eq!(std::fs::read(quarantined).unwrap(), b"{broken");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn failed_recent_write_and_missing_project_do_not_create_false_records() {
    let root = directory();
    let path = project(&root, "piece.json");
    let blocked = root.join("blocked");
    std::fs::write(&blocked, b"existing data").unwrap();
    let store = RecentDocumentsStore::new(blocked.join("recent.json"));
    assert!(store.record(&path, "piece").is_err());
    assert_eq!(std::fs::read(blocked).unwrap(), b"existing data");
    let file = root.join("recent.json");
    let store = RecentDocumentsStore::new(file.clone());
    assert!(store.record(&root.join("missing.json"), "missing").is_err());
    assert!(!file.exists());
    std::fs::remove_dir_all(root).unwrap();
}
