#![allow(dead_code)]

// Production modules are compiled unchanged. Passing characterization tests
// document baseline behavior, including defects, rather than successful repairs.
#[path = "../../../../apps/desktop/src-tauri/src/application/mod.rs"]
mod application;
#[path = "../../../../apps/desktop/src-tauri/src/document_io.rs"]
mod document_io;
#[path = "../../../../apps/desktop/src-tauri/src/dto.rs"]
mod dto;
#[path = "../../../../apps/desktop/src-tauri/src/error.rs"]
mod error;
#[path = "../../../../apps/desktop/src-tauri/src/score_change_set.rs"]
mod score_change_set;

use application::ScoreSessionService;
use document_io::{RecoveryManager, atomic_write, read_document};
use dto::{CreateScoreRequest, NewScoreInput, ScoreEditAction, ScoreEditRequest, ScoreSessionRead};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

fn fixture() -> PathBuf {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../.local-evidence/coordinator-stage1/fixtures");
    fs::create_dir_all(&base).expect("create isolated audit fixtures");
    let root = base
        .canonicalize()
        .unwrap()
        .join(Uuid::new_v4().to_string());
    fs::create_dir(&root).unwrap();
    // Retain scratch evidence; do not remove other runs' files or build outputs.
    root
}

fn create(
    service: &mut ScoreSessionService,
    workspace: &str,
    title: &str,
    expected_document_id: Option<String>,
) -> ScoreSessionRead {
    service
        .create(CreateScoreRequest {
            workspace_id: workspace.into(),
            request_id: Uuid::new_v4().to_string(),
            expected_document_id,
            input: NewScoreInput {
                title: title.into(),
                measure_count: 1,
            },
        })
        .unwrap()
}

#[test]
fn audit_failed_write_can_be_silently_cancelled_by_remove() {
    let root = fixture();
    let path = root.join("missing-parent").join("recovery.bgp.json");
    let recovery = RecoveryManager::default();
    recovery.schedule(path.clone(), "unsaved".into()).unwrap();
    assert!(recovery.flush().is_err());
    assert!(recovery.remove(path.clone()).is_ok());
    assert!(recovery.flush().is_ok());
    assert!(!path.exists());
}

#[test]
fn audit_remove_failure_also_discards_pending_contents() {
    let root = fixture();
    let path = root.join("blocked.bgp.json");
    fs::create_dir(&path).unwrap();
    let recovery = RecoveryManager::default();
    recovery
        .schedule(path.clone(), "must-not-vanish".into())
        .unwrap();
    assert!(recovery.flush().is_err());
    assert!(recovery.remove(path.clone()).is_err());
    // Only remove our empty fixture directory. A retained write could now
    // succeed, but the production worker has already removed it from pending.
    fs::remove_dir(&path).unwrap();
    assert!(recovery.flush().is_ok());
    assert!(!path.exists());
}

#[test]
fn audit_physical_save_keeps_old_snapshot_while_session_advances() {
    let root = fixture();
    let path = root.join("score.bgp.json");
    let workspace = Uuid::new_v4().to_string();
    let mut service = ScoreSessionService::default();
    let before = create(&mut service, &workspace, "before-save", None);
    let (bytes, version) = service.export_snapshot(&workspace).unwrap();
    let edited = service
        .edit(ScoreEditRequest {
            workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(),
            document_id: before.document_id.clone(),
            expected_version: before.document_version,
            action: ScoreEditAction::SetTitle {
                title: "edited-during-save".into(),
            },
        })
        .unwrap();
    atomic_write(&path, bytes.as_bytes()).unwrap();
    let receipt = service
        .mark_saved(&workspace, path.clone(), version)
        .unwrap();
    let mut reader = ScoreSessionService::default();
    let reopened = reader
        .import_document(workspace, &read_document(&path).unwrap())
        .unwrap();
    assert_eq!(receipt.saved_version, before.document_version);
    assert_eq!(receipt.session.document_version, edited.document_version);
    assert_eq!(receipt.session.title, "edited-during-save");
    assert_eq!(reopened.title, "before-save");
}

#[test]
fn audit_old_snapshot_is_marked_on_replacement_document() {
    let root = fixture();
    let path = root.join("old-document.bgp.json");
    let workspace = Uuid::new_v4().to_string();
    let mut service = ScoreSessionService::default();
    let old = create(&mut service, &workspace, "old-document", None);
    let (bytes, version) = service.export_snapshot(&workspace).unwrap();
    let replacement = create(
        &mut service,
        &workspace,
        "replacement-document",
        Some(old.document_id.clone()),
    );
    assert_ne!(old.document_id, replacement.document_id);
    atomic_write(&path, bytes.as_bytes()).unwrap();
    let receipt = service
        .mark_saved(&workspace, path.clone(), version)
        .unwrap();
    let mut reader = ScoreSessionService::default();
    let disk = reader
        .import_document(workspace.clone(), &read_document(&path).unwrap())
        .unwrap();
    assert_eq!(disk.document_id, old.document_id);
    assert_eq!(receipt.session.document_id, replacement.document_id);
    assert_eq!(receipt.saved_version, replacement.document_version);
    assert_eq!(service.file_path(&workspace).unwrap(), Some(path));
}

#[test]
fn audit_import_remains_committed_when_recovery_removal_fails() {
    let root = fixture();
    let source = root.join("import.bgp.json");
    let blocked = root.join("blocked-recovery.bgp.json");
    fs::create_dir(&blocked).unwrap();
    let workspace = Uuid::new_v4().to_string();
    let mut service = ScoreSessionService::default();
    let old = create(&mut service, &workspace, "old", None);
    let mut donor = ScoreSessionService::default();
    let imported = create(&mut donor, &workspace, "imported", None);
    let bytes = donor.export_document(&workspace).unwrap();
    atomic_write(&source, bytes.as_bytes()).unwrap();
    let result = service
        .import_file(workspace.clone(), &read_document(&source).unwrap(), source)
        .unwrap();
    let recovery = RecoveryManager::default();
    assert!(recovery.remove(blocked).is_err());
    assert_ne!(old.document_id, result.session.document_id);
    assert_eq!(result.session.document_id, imported.document_id);
    assert_eq!(
        service.read(&workspace).unwrap().unwrap().document_id,
        imported.document_id
    );
}

#[test]
fn audit_save_remains_committed_when_recovery_removal_fails() {
    let root = fixture();
    let path = root.join("saved.bgp.json");
    let blocked = root.join("blocked-recovery.bgp.json");
    fs::create_dir(&blocked).unwrap();
    let workspace = Uuid::new_v4().to_string();
    let mut service = ScoreSessionService::default();
    let before = create(&mut service, &workspace, "saved-content", None);
    let (bytes, version) = service.export_snapshot(&workspace).unwrap();
    atomic_write(&path, bytes.as_bytes()).unwrap();
    let receipt = service
        .mark_saved(&workspace, path.clone(), version)
        .unwrap();
    let recovery = RecoveryManager::default();
    assert!(recovery.remove(blocked).is_err());
    assert_eq!(read_document(&path).unwrap(), bytes);
    assert_eq!(receipt.session.document_id, before.document_id);
    assert_eq!(service.file_path(&workspace).unwrap(), Some(path));
}

#[test]
fn audit_kernel_undo_restores_clean_identity_at_a_new_version() {
    use brilliant_kernel_contracts::{
        KernelSessionCreateRequestV1, KernelSessionReadResultV1, KernelStage4CommandResultV1,
        KernelStage4MarkPersistedResultV1, KernelStage4OperationResultV1,
    };
    use brilliant_kernel_session::KernelSession;
    use brilliant_score_foundation::{decode_lossless_json, decode_lossless_score_document_value};
    use serde_json::json;

    let workspace = Uuid::new_v4().to_string();
    let mut service = ScoreSessionService::default();
    let initial = create(&mut service, &workspace, "saved", None);
    let bytes = service.export_document(&workspace).unwrap();
    let document =
        decode_lossless_score_document_value(decode_lossless_json(&bytes).unwrap()).unwrap();
    let mut kernel = KernelSession::create(KernelSessionCreateRequestV1 {
        api_version: 1,
        document,
    })
    .unwrap()
    .session;
    let mark = serde_json::to_vec(&json!({
        "apiVersion": 1,
        "operation": { "kind": "mark-persisted", "checkpoint": {
            "documentId": initial.document_id, "documentVersion": 0
        }}
    }))
    .unwrap();
    assert!(matches!(
        kernel.operate_stage4_bytes(&mark),
        KernelStage4OperationResultV1::MarkPersisted(
            KernelStage4MarkPersistedResultV1::Updated { .. }
                | KernelStage4MarkPersistedResultV1::NoOp { .. }
        )
    ));
    let edit = serde_json::to_vec(&json!({
        "apiVersion": 1,
        "operation": { "kind": "submit", "command": {
            "commandVersion": 1, "commandId": "core.document.set-metadata",
            "target": { "kind": "document", "documentId": initial.document_id },
            "payload": { "metadata": {
                "title": "changed", "authors": [], "tempo": { "bpm": 96 }
            }}
        }}
    }))
    .unwrap();
    assert!(matches!(
        kernel.operate_stage4_bytes(&edit),
        KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Committed { .. })
    ));
    let KernelSessionReadResultV1::Ok(changed) = kernel.read_state() else {
        panic!("read edited kernel");
    };
    assert!(changed.dirty);
    assert!(matches!(
        kernel.operate_stage4_bytes(br#"{"apiVersion":1,"operation":{"kind":"undo"}}"#),
        KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Committed { .. })
    ));
    let KernelSessionReadResultV1::Ok(undone) = kernel.read_state() else {
        panic!("read undone kernel");
    };
    assert_eq!(undone.snapshot.document_version.get(), 2);
    assert!(!undone.dirty);
}
