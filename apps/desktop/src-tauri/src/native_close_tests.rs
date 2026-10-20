use super::*;
use std::path::Path;
use std::process::Command;
use std::sync::mpsc;
use std::time::{Duration, Instant};

const NATIVE_TEST: &str =
    "native_close_tests::native_close_keeps_data_until_real_destroyed_without_a_js_listener";
const CHILD_ENV: &str = "BRILLIANT_NATIVE_CLOSE_TEST_CHILD";
const EVENT_TIMEOUT: Duration = Duration::from_secs(10);

#[test]
#[ignore = "creates isolated hidden WebViews; run explicitly on Windows"]
fn native_close_keeps_data_until_real_destroyed_without_a_js_listener() {
    if let Some(root) = std::env::var_os(CHILD_ENV) {
        run_native_close(Path::new(&root));
        return;
    }

    let root =
        std::env::temp_dir().join(format!("brilliant-native-close-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    // The parent owns teardown, including when the GUI runner fails or times out.
    let result = (|| -> std::io::Result<_> {
        let mut child = Command::new(std::env::current_exe()?)
            .args(["--exact", NATIVE_TEST, "--ignored", "--nocapture"])
            .env(CHILD_ENV, &root)
            .spawn()?;
        let deadline = Instant::now() + Duration::from_secs(45);
        loop {
            if let Some(status) = child.try_wait()? {
                return Ok(status);
            }
            if Instant::now() >= deadline {
                child.kill()?;
                child.wait()?;
                return Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "native close runner exceeded 45 seconds",
                ));
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    })();
    // WebView2 may briefly retain profile handles after the runner exits.
    let cleanup_deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match std::fs::remove_dir_all(&root) {
            Ok(()) => break,
            Err(_) if Instant::now() < cleanup_deadline => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(error) => panic!(
                "native close fixture cleanup failed at {}: {error}",
                root.display()
            ),
        }
    }
    eprintln!("native-close: fixture removed {}", root.display());
    let status = result.expect("native close runner failed");
    assert!(status.success(), "native close runner failed: {status}");
}

fn run_native_close(root: &Path) {
    eprintln!("native-close: fixture {}", root.display());
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = "com.brilliantguitar.test.native-close".into();
    context.config_mut().app.windows.clear();

    let (event_sender, event_receiver) = mpsc::channel();
    let app = tauri::Builder::default()
        .any_thread()
        .manage(state::AppState::new(root.join("recovery")))
        .on_window_event(move |window, event| {
            on_window_event(window, event);
            let name = match event {
                tauri::WindowEvent::CloseRequested { .. } => "close-requested",
                tauri::WindowEvent::Destroyed => "destroyed",
                _ => return,
            };
            eprintln!("native-close: {name}");
            event_sender.send(name).unwrap();
        })
        .build(context)
        .unwrap();

    let handle = app.handle().clone();
    let root = root.to_path_buf();
    let driver = std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            exercise_native_close(&handle, &root, event_receiver);
        }));
        handle.exit(i32::from(result.is_err()));
        result
    });

    let exit_code = app.run_return(|_, event| {
        if let tauri::RunEvent::ExitRequested {
            code: None, api, ..
        } = event
        {
            // Keep one event loop across both windows. Only the driver exits it,
            // after all assertions or on failure; explicit exit must not be blocked.
            api.prevent_exit();
        }
    });
    driver.join().unwrap().unwrap();
    assert_eq!(exit_code, 0);
}

fn build_hidden_webview(handle: &tauri::AppHandle, root: &Path) -> tauri::WebviewWindow {
    eprintln!("native-close: building main");
    tauri::WebviewWindowBuilder::new(
        handle,
        "main",
        tauri::WebviewUrl::External("about:blank".parse().unwrap()),
    )
    .visible(false)
    .skip_taskbar(true)
    .data_directory(root.join("webview"))
    .build()
    .unwrap()
}

fn exercise_native_close(
    handle: &tauri::AppHandle,
    root: &Path,
    events: mpsc::Receiver<&'static str>,
) {
    let empty = build_hidden_webview(handle, root);
    eprintln!("native-close: empty built, sending close");
    empty.close().unwrap();
    assert_eq!(
        events.recv_timeout(EVENT_TIMEOUT).unwrap(),
        "close-requested"
    );
    assert_eq!(events.recv_timeout(EVENT_TIMEOUT).unwrap(), "destroyed");
    assert!(handle.get_webview_window("main").is_none());
    drop(empty);

    let window = build_hidden_webview(handle, root);
    let workspace = uuid::Uuid::new_v4().to_string();
    let created = commands::workbench_create_v1(
        handle.state(),
        dto::CreateScoreRequest {
            workspace_id: workspace.clone(),
            request_id: uuid::Uuid::new_v4().to_string(),
            expected_document_id: None,
            input: dto::NewScoreInput {
                title: "synthetic close".into(),
                measure_count: 1,
            },
        },
    )
    .unwrap();
    let state = handle.state::<state::AppState>();
    let path = state.recovery_path(&workspace);
    {
        // The real command can run without a modal on the UI-thread assertion
        // barrier once the original snapshot has actually been saved.
        let mut service = state.service.lock().unwrap();
        let snapshot = service.export_snapshot(&workspace).unwrap();
        service
            .save_file(&workspace, root.join("saved.bgp.json"), &snapshot)
            .unwrap();
    }

    {
        let _busy_service = state.service.lock().unwrap();
        window.close().unwrap();
        assert_eq!(
            events.recv_timeout(EVENT_TIMEOUT).unwrap(),
            "close-requested"
        );
        assert!(handle.get_webview_window("main").is_some());
    }

    let expected: native_close::NativeClosePrecondition =
        serde_json::from_value(serde_json::json!({
            "kind": "document",
            "sessionId": created.persistence.unwrap().session_id,
            "documentId": created.document_id,
            "documentVersion": created.document_version,
        }))
        .unwrap();
    let request = dto::CapabilityTransportRequest {
        invocation_id: uuid::Uuid::new_v4().to_string(),
        capability_id: "score.update-title".into(),
        contract_version: 1,
        workspace_id: workspace.clone(),
        document_precondition: Some(dto::CapabilityDocumentPrecondition {
            document_id: created.document_id,
            document_version: created.document_version,
        }),
        input: serde_json::json!({ "title": "too late" }),
    };

    let native_window = window.as_ref().window().clone();
    let task_handle = handle.clone();
    let task_workspace = workspace.clone();
    let task_path = path.clone();
    let (checked_sender, checked_receiver) = mpsc::channel();
    let receipt_request = request.clone();
    handle
        .run_on_main_thread(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                native_close::workbench_close_window_guarded_v1(
                    task_handle.clone(),
                    native_window,
                    task_handle.state(),
                    task_workspace.clone(),
                    expected,
                )
                .unwrap();
                assert!(task_path.is_file(), "dispatch must retain recovery");
                assert!(
                    task_handle
                        .state::<state::AppState>()
                        .service
                        .lock()
                        .unwrap()
                        .read(&task_workspace)
                        .unwrap()
                        .is_some()
                );

                let result =
                    commands::workbench_agent_invoke_capability_v1(task_handle.state(), request)
                        .unwrap();
                assert!(
                    matches!(&result, capability::CapabilityResult::Unavailable { code, .. }
                    if code == "capability.workspace-closing")
                );
                assert_eq!(
                    commands::workbench_agent_invocation_receipt_v1(
                        task_handle.state(),
                        receipt_request,
                    )
                    .unwrap(),
                    capability_receipt::CapabilityReceiptLookupV1::Resolved { result }
                );
            }));
            checked_sender.send(result).unwrap();
        })
        .unwrap();
    checked_receiver
        .recv_timeout(EVENT_TIMEOUT)
        .unwrap()
        .unwrap();
    assert_eq!(events.recv_timeout(EVENT_TIMEOUT).unwrap(), "destroyed");
    assert!(handle.get_webview_window("main").is_none());
    assert!(!path.exists(), "Destroyed must finalize recovery cleanup");
    assert!(
        state
            .service
            .lock()
            .unwrap()
            .read(&workspace)
            .unwrap()
            .is_none()
    );
    println!("isolated native evidence: {}", root.display());
}
