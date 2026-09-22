#![allow(dead_code)]

// Characterize unchanged production code; passing does not mean repaired.
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
use dto::{CreateScoreRequest, NewScoreInput, ScoreEditRequest};
use serde_json::{Value, json};
use std::{env, fs, path::PathBuf};

fn record(name: &str, value: &Value) {
    let parent = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../.local-evidence/coordinator-stage4")
        .canonicalize()
        .expect("run through stage4/run.mjs");
    let output = PathBuf::from(env::var("AUDIT_STAGE4_OUTPUT").expect("stage4 output directory"))
        .canonicalize()
        .unwrap();
    assert!(output.starts_with(&parent) && output != parent);
    fs::write(output.join(name), serde_json::to_vec_pretty(value).unwrap()).unwrap();
}

#[test]
fn audit_desktop_deserializes_shared_edit_requests() {
    let fixture: Value = serde_json::from_str(include_str!("edit-cases.json")).unwrap();
    let mut results = Vec::new();
    for case in fixture["cases"].as_array().unwrap() {
        let request = json!({
            "workspaceId": fixture["workspaceId"],
            "requestId": fixture["requestId"],
            "documentId": fixture["documentId"],
            "expectedVersion": fixture["expectedVersion"],
            "action": case["action"],
        });
        let result = serde_json::from_value::<ScoreEditRequest>(request.clone());
        let accepts = case["desktopAccepts"].as_bool().unwrap();
        assert_eq!(result.is_ok(), accepts, "{request}: {result:?}");
        let error = result.err().map(|error| error.to_string());
        if let Some(error) = &error {
            let kind = case["action"]["kind"].as_str().unwrap();
            assert!(
                error.contains(&format!("unknown variant `{kind}`")),
                "{error}"
            );
        }
        results.push(json!({ "request": request, "accepted": accepts, "error": error }));
    }
    assert_eq!(results.len(), 10);
    record("desktop-edit-results.json", &json!(results));
}

#[test]
fn audit_metadata_survives_document_but_is_missing_from_session_projection() {
    let workspace = "11111111-1111-4111-8111-111111111111";
    let mut service = ScoreSessionService::default();
    service
        .create(CreateScoreRequest {
            workspace_id: workspace.into(),
            request_id: "22222222-2222-4222-8222-222222222222".into(),
            expected_document_id: None,
            input: NewScoreInput {
                title: "Stage four".into(),
                measure_count: 1,
            },
        })
        .unwrap();
    let mut document: Value =
        serde_json::from_str(&service.export_document(workspace).unwrap()).unwrap();
    document["metadata"]["authors"] = json!(["Audit author"]);
    service
        .import_document(workspace.into(), &document.to_string())
        .unwrap();
    let session = serde_json::to_value(service.read(workspace).unwrap().unwrap()).unwrap();
    let metadata =
        serde_json::to_value(service.read_metadata(workspace).unwrap().unwrap()).unwrap();
    let exported: Value =
        serde_json::from_str(&service.export_document(workspace).unwrap()).unwrap();
    assert_eq!(metadata["authors"], json!(["Audit author"]));
    assert_eq!(exported["metadata"]["authors"], metadata["authors"]);
    assert_eq!(session["documentId"], metadata["documentId"]);
    assert_eq!(session["documentVersion"], metadata["documentVersion"]);
    assert!(session.get("metadata").is_none());
    record(
        "desktop-projection.json",
        &json!({
            "session": session, "metadata": metadata, "exportedMetadata": exported["metadata"],
        }),
    );
}
