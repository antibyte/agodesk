mod commands;
pub mod computer_use;
mod desktop;
mod files;
mod integration_embed;
pub mod speech;
mod tray;
mod window_effects;
mod ws;

use std::sync::atomic::Ordering;

use tauri::{Emitter, Manager, RunEvent, WindowEvent};
use tray::TrayState;
use ws::transport::WsTransportState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(WsTransportState::default())
        .manage(TrayState::default())
        .manage(computer_use::browser::BrowserState::default())
        .setup(|app| {
            speech::runtime::init_sherpa_runtime();
            speech::asr::normalize_legacy_model_layouts();
            if let Ok(dir) = app.path().app_data_dir() {
                speech::asr::register_models_search_root(dir.join("speech-models"));
            }
            let app_data = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("agodesk"));
            app.manage(files::search::FileSearchState::new(app_data));
            if let Some(window) = app.get_webview_window("main") {
                window_effects::apply_main_window_effects(&window);
            }
            let state = app.state::<TrayState>();
            tray::setup_tray(app.handle(), state.inner())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == integration_embed::EMBED_LABEL {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let app = window.app_handle();
                    let _ = integration_embed::integration_embed_hide_impl(app);
                    let _ = app.emit("integration-embed-closed", ());
                }
                return;
            }

            if window.label() == "main" {
                let state = window.state::<TrayState>();
                let tray_state = state.inner();
                if !tray_state.minimize_to_tray.load(Ordering::Relaxed)
                    && matches!(event, WindowEvent::CloseRequested { .. })
                {
                    tray::request_app_exit(window.app_handle());
                    return;
                }
                tray::handle_window_event(window, event, tray_state);
                return;
            }

            let state = window.state::<TrayState>();
            tray::handle_window_event(window, event, state.inner());
        })
        .invoke_handler(tauri::generate_handler![
            commands::store_shared_key,
            commands::get_shared_key,
            commands::delete_shared_key,
            commands::store_gemini_api_key,
            commands::get_gemini_api_key,
            commands::delete_gemini_api_key,
            commands::has_gemini_api_key,
            commands::collect_host_info,
            commands::list_displays,
            commands::list_windows,
            commands::capture_screen,
            commands::control_permission_status,
            commands::inject_input,
            commands::set_input_approval,
            commands::reset_desktop_session,
            commands::get_active_window,
            commands::get_ui_tree,
            commands::perform_ui_action,
            commands::browser_connect,
            commands::browser_list_tabs,
            commands::browser_snapshot,
            commands::browser_action,
            commands::browser_disconnect,
            commands::open_external_url,
            files::ops::file_list,
            files::ops::file_read,
            files::ops::file_write,
            files::search::ops::file_search,
            files::search::ops::file_search_sync_roots,
            files::search::ops::file_search_rescan,
            files::ops::pick_folder_path,
            files::ops::canonicalize_folder_path,
            tray::set_minimize_to_tray,
            tray::update_tray_labels,
            tray::show_main_window,
            ws::transport::fetch_server_asset,
            ws::transport::upload_chat_attachment,
            ws::transport::probe_server_certificate,
            ws::transport::save_trusted_certificate,
            ws::transport::get_trusted_certificates,
            ws::transport::agodesk_connect,
            ws::transport::agodesk_send,
            ws::transport::agodesk_disconnect,
            integration_embed::integration_embed_open,
            integration_embed::integration_embed_set_bounds,
            integration_embed::integration_embed_close,
            commands::speech_asr_status,
            commands::speech_tts_status,
            commands::speech_download_asr_model,
            commands::speech_sidecar_ping,
            commands::speech_sidecar_transcribe,
            commands::speech_sidecar_synthesize,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, RunEvent::Exit) {
                tray::prepare_tray_for_exit(app_handle);
            }
        });
}
