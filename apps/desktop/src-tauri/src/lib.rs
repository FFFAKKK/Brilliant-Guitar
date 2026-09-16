mod application;
mod commands;
mod diagnostics;
mod document_io;
mod dto;
mod error;
mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let recovery_root = app.path().app_data_dir()?.join("recovery");
            app.manage(state::AppState::new(recovery_root));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
        ])
        .run(tauri::generate_context!())
        .expect("failed to run desktop workbench");
}
