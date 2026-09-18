mod agent_store;
mod application;
mod capability;
mod commands;
mod diagnostics;
mod document_io;
mod dto;
mod error;
mod settings;
mod state;
mod workspace_configuration;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let recovery_root = app.path().app_data_dir()?.join("recovery");
            let settings_path = app.path().app_config_dir()?.join("settings.v1.json");
            let workspace_configuration_root = app.path().app_config_dir()?.join("workspaces");
            let agent_run_root = app.path().app_data_dir()?.join("agent").join("runs");
            app.manage(state::AppState::with_paths(
                recovery_root,
                settings_path,
                workspace_configuration_root,
                agent_run_root,
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::workbench_invoke_capability_v1,
            commands::workbench_read_v1,
            commands::workbench_create_v1,
            commands::workbench_edit_v1,
            commands::workbench_export_v1,
            commands::workbench_import_v1,
            commands::workbench_close_v1,
            commands::workbench_open_file_v1,
            commands::workbench_save_file_v1,
            commands::workbench_plugin_diagnostic_v1,
            commands::workbench_read_plugin_diagnostics_v1,
            commands::workbench_read_settings_v1,
            commands::workbench_write_settings_v1,
            commands::workbench_reset_settings_v1,
            commands::workbench_read_workspace_configuration_v1,
            commands::workbench_write_workspace_configuration_v1,
            commands::workbench_reset_workspace_configuration_v1,
            commands::workbench_agent_run_load_v1,
            commands::workbench_agent_run_commit_v1,
            commands::workbench_agent_run_list_recoverable_v1,
            commands::workbench_agent_run_quarantine_v1,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run desktop workbench");
}
