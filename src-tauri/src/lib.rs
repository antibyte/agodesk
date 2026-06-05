mod commands;
pub mod computer_use;
mod desktop;
mod files;
mod tray;
mod window_effects;
mod ws;

use tauri::Manager;
use tray::TrayState;
use ws::transport::WsTransportState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(WsTransportState::default())
        .manage(TrayState::default())
        .manage(computer_use::browser::BrowserState::default())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window_effects::apply_main_window_effects(&window);
            }
            let state = app.state::<TrayState>();
            tray::setup_tray(app.handle(), state.inner())?;
            Ok(())
        })
        .on_window_event(|window, event| {
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
            files::ops::pick_folder_path,
            files::ops::canonicalize_folder_path,
            tray::set_minimize_to_tray,
            ws::transport::fetch_server_asset,
            ws::transport::probe_server_certificate,
            ws::transport::save_trusted_certificate,
            ws::transport::get_trusted_certificates,
            ws::transport::agodesk_connect,
            ws::transport::agodesk_send,
            ws::transport::agodesk_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
