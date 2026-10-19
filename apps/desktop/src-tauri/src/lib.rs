mod agent_credential;
mod agent_provider;
mod agent_store;
mod application;
mod capability;
mod capability_receipt;
mod commands;
mod config_writer;
mod diagnostics;
mod document_io;
mod dto;
mod error;
mod json_store;
mod recent_documents;
mod score_change_set;
mod settings;
mod startup;
mod state;
mod workspace_configuration;

use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    let windows = startup::defer_windows(&mut context.config_mut().app.windows);
    let startup_rejected = Arc::new(AtomicBool::new(false));
    let setup_rejected = Arc::clone(&startup_rejected);
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            if let Err(error) = startup::initialize(app, &windows) {
                setup_rejected.store(true, Ordering::Release);
                // Returning Err here makes Tauri panic inside its event loop.
                // Keep the failed process alive only until its native notice is dismissed.
                startup::show_failure(app, error.as_ref());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::workbench_invoke_capability_v1,
            commands::workbench_agent_invoke_capability_v1,
            commands::workbench_read_v1,
            commands::workbench_score_read_summary_v1,
            commands::workbench_score_read_metadata_v1,
            commands::workbench_score_read_structure_v1,
            commands::workbench_score_read_measure_index_v1,
            commands::workbench_score_read_measure_range_v1,
            commands::workbench_score_prepare_tempo_change_v1,
            commands::workbench_score_prepare_metadata_transaction_v1,
            commands::workbench_create_v1,
            commands::workbench_create_guarded_v1,
            commands::workbench_edit_v1,
            commands::workbench_export_v1,
            commands::workbench_import_v1,
            commands::workbench_close_v1,
            commands::workbench_open_file_v1,
            commands::workbench_open_file_guarded_v1,
            commands::workbench_list_recent_documents_v1,
            commands::workbench_remove_recent_document_v1,
            commands::workbench_open_recent_document_guarded_v1,
            commands::workbench_record_current_file_v1,
            commands::workbench_save_file_v1,
            commands::workbench_save_file_guarded_v1,
            commands::workbench_plugin_diagnostic_v1,
            commands::workbench_read_plugin_diagnostics_v1,
            commands::workbench_read_settings_v1,
            commands::workbench_write_settings_v1,
            commands::workbench_reset_settings_v1,
            commands::workbench_read_plugin_activation_v1,
            commands::workbench_write_plugin_activation_v1,
            commands::workbench_read_plugin_settings_v1,
            commands::workbench_write_plugin_settings_v1,
            commands::workbench_read_plugin_startup_recovery_v1,
            commands::workbench_write_plugin_startup_recovery_v1,
            commands::workbench_read_workspace_configuration_v1,
            commands::workbench_write_workspace_configuration_v1,
            commands::workbench_reset_workspace_configuration_v1,
            commands::workbench_agent_run_load_v1,
            commands::workbench_agent_run_commit_v1,
            commands::workbench_agent_run_list_recoverable_v1,
            commands::workbench_agent_run_quarantine_v1,
            commands::workbench_agent_invocation_receipt_v1,
            commands::workbench_agent_provider_credential_status_v1,
            commands::workbench_agent_provider_set_credential_v1,
            commands::workbench_agent_provider_delete_credential_v1,
            commands::workbench_agent_provider_decide_v1,
            commands::workbench_agent_model_stream_v1,
            commands::workbench_agent_provider_cancel_v1,
        ])
        .build(context)
        .expect("failed to build desktop workbench");
    // Closing the only native dialog can end a zero-webview event loop before
    // its async callback requests exit. Startup rejection is already decisive.
    let runtime_exit_code = app.run_return(|_, _| {});
    let exit_code = if startup_rejected.load(Ordering::Acquire) {
        1
    } else {
        runtime_exit_code
    };
    std::process::exit(exit_code);
}
