#![allow(dead_code)]

// Compile production commands and state unchanged. Only audit_ tests are run;
// AppState::new uses the existing in-memory credential backend.
#[path = "../../../../apps/desktop/src-tauri/src/agent_credential.rs"]
mod agent_credential;
// Preserve Rust's normal submodule resolution for agent_provider/openai_stream.
#[path = "../../../../apps/desktop/src-tauri/src"]
mod provider_source {
    pub mod agent_provider;
}
use provider_source::agent_provider;
#[path = "../../../../apps/desktop/src-tauri/src/agent_store.rs"]
mod agent_store;
#[path = "../../../../apps/desktop/src-tauri/src/application/mod.rs"]
mod application;
#[path = "../../../../apps/desktop/src-tauri/src/capability.rs"]
mod capability;
#[path = "../../../../apps/desktop/src-tauri/src/capability_receipt.rs"]
mod capability_receipt;
#[path = "../../../../apps/desktop/src-tauri/src/commands.rs"]
mod commands;
#[path = "../../../../apps/desktop/src-tauri/src/diagnostics.rs"]
mod diagnostics;
#[path = "../../../../apps/desktop/src-tauri/src/document_io.rs"]
mod document_io;
#[path = "../../../../apps/desktop/src-tauri/src/dto.rs"]
mod dto;
#[path = "../../../../apps/desktop/src-tauri/src/error.rs"]
mod error;
#[path = "../../../../apps/desktop/src-tauri/src/score_change_set.rs"]
mod score_change_set;
#[path = "../../../../apps/desktop/src-tauri/src/settings.rs"]
mod settings;
#[path = "../../../../apps/desktop/src-tauri/src/state.rs"]
mod state;
#[path = "../../../../apps/desktop/src-tauri/src/workspace_configuration.rs"]
mod workspace_configuration;

use dto::{CreateScoreRequest, NewScoreInput, ScoreEditAction, ScoreEditRequest, ScoreSessionRead};
use state::AppState;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Manager, Runtime};
use uuid::Uuid;

fn fixture() -> PathBuf {
    let parent = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../.local-evidence/coordinator-stage2/fixtures");
    fs::create_dir_all(&parent).unwrap();
    let root = parent
        .canonicalize()
        .unwrap()
        .join(Uuid::new_v4().to_string());
    fs::create_dir(&root).unwrap();
    root
}

fn app_with_state(recovery_root: PathBuf) -> tauri::App<tauri::test::MockRuntime> {
    let app = tauri::test::mock_app();
    assert!(app.manage(AppState::new(recovery_root)));
    app
}

fn create<R: Runtime>(app: &tauri::App<R>, workspace: &str) -> ScoreSessionRead {
    commands::workbench_create_v1(
        app.state(),
        CreateScoreRequest {
            workspace_id: workspace.into(),
            request_id: Uuid::new_v4().to_string(),
            expected_document_id: None,
            input: NewScoreInput {
                title: "stage2-audit".into(),
                measure_count: 1,
            },
        },
    )
    .unwrap()
}

fn read<R: Runtime>(app: &tauri::App<R>, workspace: &str) -> Option<ScoreSessionRead> {
    commands::workbench_read_v1(app.state(), workspace.into()).unwrap()
}

#[test]
fn audit_absent_close_returns_false() {
    let app = app_with_state(fixture().join("recovery"));
    let workspace = Uuid::new_v4().to_string();
    assert!(!commands::workbench_close_v1(app.state(), workspace).unwrap());
}

#[test]
fn audit_create_silently_skips_unavailable_recovery() {
    let root = fixture();
    let blocked = root.join("not-a-directory");
    fs::write(&blocked, b"audit blocker").unwrap();
    let app = app_with_state(blocked.clone());
    let workspace = Uuid::new_v4().to_string();
    let created = create(&app, &workspace);
    let state = app.state::<AppState>();
    assert!(state.recovery.flush().is_ok());
    assert!(!state.recovery_path(&workspace).exists());
    assert_eq!(
        read(&app, &workspace).unwrap().document_id,
        created.document_id
    );
    assert_eq!(fs::read(&blocked).unwrap(), b"audit blocker");
}

#[test]
fn audit_unrelated_recovery_failure_blocks_close() {
    let root = fixture();
    let app = app_with_state(root.join("recovery"));
    let state = app.state::<AppState>();
    let affected = Uuid::new_v4().to_string();
    let unrelated = Uuid::new_v4().to_string();
    create(&app, &affected);
    let other = create(&app, &unrelated);
    state.recovery.flush().unwrap();

    // Replace only this test's recovery file with an empty directory.
    let blocked = state.recovery_path(&affected);
    fs::remove_file(&blocked).unwrap();
    fs::create_dir(&blocked).unwrap();
    commands::workbench_edit_v1(
        app.state(),
        ScoreEditRequest {
            workspace_id: affected.clone(),
            request_id: Uuid::new_v4().to_string(),
            document_id: read(&app, &affected).unwrap().document_id,
            expected_version: 0,
            action: ScoreEditAction::SetTitle {
                title: "blocked-write".into(),
            },
        },
    )
    .unwrap();
    let error = commands::workbench_close_v1(app.state(), unrelated.clone()).unwrap_err();
    assert_eq!(error.issue.unwrap().code, "file.recovery-unavailable");
    assert_eq!(
        read(&app, &unrelated).unwrap().document_id,
        other.document_id
    );

    fs::remove_dir(&blocked).unwrap();
    assert!(commands::workbench_close_v1(app.state(), unrelated).unwrap());
    assert_eq!(read(&app, &affected).unwrap().title, "blocked-write");
    state
        .recovery
        .remove(state.recovery_path(&affected))
        .unwrap();
}

#[test]
fn audit_close_remove_failure_retains_session_and_retry_succeeds() {
    let root = fixture();
    let app = app_with_state(root.join("recovery"));
    let state = app.state::<AppState>();
    let workspace = Uuid::new_v4().to_string();
    let created = create(&app, &workspace);
    state.recovery.flush().unwrap();
    let blocked = state.recovery_path(&workspace);
    fs::remove_file(&blocked).unwrap();
    fs::create_dir(&blocked).unwrap();
    assert!(commands::workbench_close_v1(app.state(), workspace.clone()).is_err());
    assert_eq!(
        read(&app, &workspace).unwrap().document_id,
        created.document_id
    );
    fs::remove_dir(&blocked).unwrap();
    assert!(commands::workbench_close_v1(app.state(), workspace.clone()).unwrap());
    assert!(!commands::workbench_close_v1(app.state(), workspace.clone()).unwrap());
    assert!(read(&app, &workspace).is_none());
}

#[test]
fn audit_import_command_succeeds_despite_failed_recovery() {
    let root = fixture();
    let blocked = root.join("not-a-directory");
    fs::write(&blocked, b"audit blocker").unwrap();
    let app = app_with_state(blocked);
    let workspace = Uuid::new_v4().to_string();
    let original = create(&app, &workspace);
    let donor = app_with_state(root.join("donor-recovery"));
    let imported = create(&donor, &workspace);
    let json = commands::workbench_export_v1(donor.state(), workspace.clone()).unwrap();
    let result = commands::workbench_import_v1(app.state(), workspace.clone(), json).unwrap();
    assert_ne!(result.document_id, original.document_id);
    assert_eq!(result.document_id, imported.document_id);
    let state = app.state::<AppState>();
    assert!(state.recovery.flush().is_ok());
    assert!(!state.recovery_path(&workspace).exists());
    assert_eq!(
        read(&app, &workspace).unwrap().document_id,
        imported.document_id
    );
    donor.state::<AppState>().recovery.flush().unwrap();
}

// Only a bounded test loop uses this API. It records native events without
// launching a WebView, loading the product UI or accessing normal AppData.
#[allow(deprecated)]
fn pump_until(app: &mut tauri::App, mut ready: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(5);
    while !ready() && Instant::now() < deadline {
        app.run_iteration(|_, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(ready(), "native event not observed before bounded deadline");
}

#[test]
#[cfg(windows)]
fn audit_native_save_command_and_window_lifecycle() {
    let root = fixture();
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.config_mut().identifier = "com.brilliantguitar.audit.stage2".into();
    let mut app = tauri::Builder::default()
        .any_thread()
        .manage(AppState::new(root.join("recovery")))
        .build(context)
        .unwrap();

    let workspace = Uuid::new_v4().to_string();
    let created = create(&app, &workspace);
    let state = app.state::<AppState>();
    let path = root.join("saved.bgp.json");
    let json = commands::workbench_export_v1(app.state(), workspace.clone()).unwrap();
    state
        .service
        .lock()
        .unwrap()
        .import_file(workspace.clone(), &json, path.clone())
        .unwrap();
    assert_eq!(
        state.service.lock().unwrap().file_path(&workspace).unwrap(),
        Some(path.clone())
    );
    state.recovery.flush().unwrap();
    let blocked = state.recovery_path(&workspace);
    fs::remove_file(&blocked).unwrap();
    fs::create_dir(&blocked).unwrap();
    let edited = commands::workbench_edit_v1(
        app.state(),
        ScoreEditRequest {
            workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(),
            document_id: created.document_id.clone(),
            expected_version: 0,
            action: ScoreEditAction::SetTitle {
                title: "saved-before-cleanup-error".into(),
            },
        },
    )
    .unwrap();
    let expected = commands::workbench_export_v1(app.state(), workspace.clone()).unwrap();
    let error = tauri::async_runtime::block_on(commands::workbench_save_file_v1(
        app.handle().clone(),
        app.state(),
        workspace.clone(),
        "unused".into(),
        false,
    ))
    .unwrap_err();
    assert_eq!(error.issue.unwrap().code, "file.recovery-unavailable");
    assert_eq!(document_io::read_document(&path).unwrap(), expected);
    assert_eq!(
        read(&app, &workspace).unwrap().document_version,
        edited.document_version
    );
    assert_eq!(
        state.service.lock().unwrap().file_path(&workspace).unwrap(),
        Some(path)
    );
    fs::remove_dir(&blocked).unwrap();
    let receipt = tauri::async_runtime::block_on(commands::workbench_save_file_v1(
        app.handle().clone(),
        app.state(),
        workspace.clone(),
        "unused".into(),
        false,
    ))
    .unwrap()
    .unwrap();
    assert_eq!(receipt.session.document_id, created.document_id);
    assert_eq!(receipt.saved_version, edited.document_version);
    assert!(commands::workbench_close_v1(app.state(), workspace).unwrap());
    println!("native-save: physical file committed -> recovery error -> retry succeeds");

    // A hidden native window has real Wry/Tao events, but no JS listener or ACL.
    let window = tauri::window::WindowBuilder::new(&app, "audit-close")
        .title("Brilliant Guitar isolated audit")
        .visible(false)
        .skip_taskbar(true)
        .build()
        .unwrap();
    let events = Arc::new(Mutex::new(Vec::new()));
    let observed = events.clone();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            observed.lock().unwrap().push("close-requested");
            api.prevent_close();
        }
        tauri::WindowEvent::Destroyed => observed.lock().unwrap().push("destroyed"),
        _ => {}
    });
    window.close().unwrap();
    pump_until(&mut app, || !events.lock().unwrap().is_empty());
    assert!(app.get_window("audit-close").is_some());
    assert_eq!(*events.lock().unwrap(), vec!["close-requested"]);
    window.destroy().unwrap();
    pump_until(&mut app, || events.lock().unwrap().contains(&"destroyed"));
    assert!(app.get_window("audit-close").is_none());
    assert_eq!(
        *events.lock().unwrap(),
        vec!["close-requested", "destroyed"]
    );
    println!(
        "native-window: close accepted -> close-requested veto -> window remains -> destroy -> destroyed"
    );
    app.cleanup_before_exit();
}
