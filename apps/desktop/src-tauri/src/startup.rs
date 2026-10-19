use std::error::Error;

use tauri::{App, Manager, WebviewWindowBuilder, utils::config::WindowConfig};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::state::AppState;

/// Tauri normally opens configured webviews before setup. Defer only the windows
/// requested by the configuration, so no frontend can run before state is ready.
pub fn defer_windows(windows: &mut [WindowConfig]) -> Vec<WindowConfig> {
    windows
        .iter_mut()
        .filter(|window| window.create)
        .map(|window| {
            let requested = window.clone();
            window.create = false;
            requested
        })
        .collect()
}

pub fn initialize(app: &mut App, windows: &[WindowConfig]) -> Result<(), Box<dyn Error>> {
    let data_root = app.path().app_data_dir()?;
    let config_root = app.path().app_config_dir()?;
    let state = AppState::with_paths(
        data_root.join("recovery"),
        config_root.join("settings.v1.json"),
        config_root.join("workspaces"),
        data_root.join("agent").join("runs"),
        data_root.join("agent").join("receipts"),
    )?;
    app.manage(state);
    for window in windows {
        WebviewWindowBuilder::from_config(app.handle(), window)?.build()?;
    }
    Ok(())
}

pub fn show_failure(app: &App, error: &dyn Error) {
    let message = format!("无法启动 Brilliant Guitar\n\n{error}");
    eprintln!("{message}");
    let handle = app.handle().clone();
    // The asynchronous dialog keeps the event loop responsive. blocking_show
    // must not run on setup's main thread. Rejected configuration never
    // registers an AppState or opens a frontend window.
    app.dialog()
        .message(message)
        .title("Brilliant Guitar")
        .kind(MessageDialogKind::Error)
        .show(move |_| handle.exit(1));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deferred_windows_preserve_the_requested_configuration_and_explicit_opt_out() {
        let requested = WindowConfig {
            label: "main".into(),
            title: "Brilliant Guitar".into(),
            width: 1440.0,
            height: 900.0,
            min_width: Some(960.0),
            min_height: Some(640.0),
            center: true,
            ..WindowConfig::default()
        };
        let skipped = WindowConfig {
            label: "optional".into(),
            create: false,
            ..WindowConfig::default()
        };
        let mut configs = vec![requested.clone(), skipped.clone()];
        let deferred = defer_windows(&mut configs);
        assert_eq!(deferred.len(), 1);
        assert_eq!(
            serde_json::to_value(&deferred[0]).unwrap(),
            serde_json::to_value(&requested).unwrap(),
            "deferred creation must not alter window geometry, URL or other options"
        );
        assert!(configs.iter().all(|window| !window.create));
        assert_eq!(
            serde_json::to_value(&configs[1]).unwrap(),
            serde_json::to_value(&skipped).unwrap()
        );
        assert!(defer_windows(&mut configs).is_empty());
    }

    #[test]
    fn empty_window_configuration_remains_empty() {
        assert!(defer_windows(&mut []).is_empty());
    }
}
