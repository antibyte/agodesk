mod commands;
mod desktop;
mod ws;

use ws::transport::WsTransportState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(WsTransportState::default())
        .invoke_handler(tauri::generate_handler![
            commands::store_shared_key,
            commands::get_shared_key,
            commands::delete_shared_key,
            commands::collect_host_info,
            commands::list_displays,
            commands::list_windows,
            commands::capture_screen,
            commands::control_permission_status,
            commands::inject_input,
            commands::set_input_approval,
            commands::reset_desktop_session,
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
