mod access_policy;
mod commands;
pub mod computer_use;
mod desktop;
mod files;
mod integration_embed;
mod oauth;
mod openpets;
pub mod speech;
mod shell;
mod tray;
mod window_effects;
mod ws;
mod mistral_realtime;
mod xai_realtime;

use std::sync::atomic::Ordering;

use tauri::{Emitter, Manager, RunEvent, WindowEvent};
use mistral_realtime::MistralRealtimeState;
use commands::{MistralNativePlaybackState, MistralTtsStreamState};
use tray::TrayState;
use ws::transport::WsTransportState;
use xai_realtime::XaiRealtimeState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(WsTransportState::default())
        .manage(XaiRealtimeState::default())
        .manage(MistralRealtimeState::default())
        .manage(MistralTtsStreamState::default())
        .manage(MistralNativePlaybackState::default())
        .manage(TrayState::default())
        .manage(computer_use::browser::BrowserState::default())
        .manage(openpets::OpenPetsState::default())
        .manage(oauth::OAuthListenerState::default())
        .setup(|app| {
            speech::runtime::init_sherpa_runtime();
            if let Ok(dir) = app.path().app_data_dir() {
                let speech_models = dir.join("speech-models");
                if std::env::var("AGODESK_SPEECH_MODELS").is_err() {
                    std::env::set_var("AGODESK_SPEECH_MODELS", &speech_models);
                }
            }
            speech::asr::init_speech_models_from_env();
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
            commands::store_xai_api_key,
            commands::get_xai_api_key,
            commands::delete_xai_api_key,
            commands::has_xai_api_key,
            commands::create_xai_realtime_client_secret,
            commands::test_xai_api_key,
            commands::list_xai_tts_voices,
            commands::xai_tts_synthesize,
            commands::store_mistral_api_key,
            commands::get_mistral_api_key,
            commands::delete_mistral_api_key,
            commands::has_mistral_api_key,
            commands::test_mistral_api_key,
            commands::mistral_transcribe,
            commands::mistral_synthesize,
            commands::mistral_native_playback_cancel,
            commands::mistral_synthesize_stream,
            commands::mistral_synthesize_stream_cancel,
            commands::list_mistral_voices,
            xai_realtime::xai_realtime_connect,
            xai_realtime::xai_realtime_send,
            xai_realtime::xai_realtime_disconnect,
            xai_realtime::test_xai_realtime_connection,
            mistral_realtime::mistral_realtime_connect,
            mistral_realtime::mistral_realtime_send,
            mistral_realtime::mistral_realtime_disconnect,
            commands::collect_host_info,
            commands::list_displays,
            commands::list_windows,
            commands::capture_screen,
            commands::control_permission_status,
            commands::inject_input,
            commands::set_input_approval,
            commands::set_screen_capture_approval,
            commands::reset_desktop_session,
            commands::get_active_window,
            commands::get_ui_tree,
            commands::perform_ui_action,
            commands::browser_connect,
            commands::browser_list_tabs,
            commands::browser_snapshot,
            commands::browser_action,
            commands::browser_disconnect,
            commands::browser_page_agent_enable,
            commands::browser_page_agent_resolve,
            commands::browser_page_agent_execute,
            commands::browser_page_agent_navigate,
            commands::browser_page_agent_ensure,
            commands::browser_page_agent_disable,
            commands::open_external_url,
            commands::open_temp_file,
            files::ops::file_list,
            files::ops::file_read,
            files::ops::file_write,
            files::ops::file_patch,
            files::search::ops::file_search,
            files::search::ops::file_search_sync_roots,
            files::search::ops::file_search_rescan,
            files::ops::pick_folder_path,
            files::ops::canonicalize_folder_path,
            shell::exec::shell_exec,
            shell::session::shell_session_start,
            shell::session::shell_session_read,
            shell::session::shell_session_input,
            shell::session::shell_session_stop,
            shell::session::shell_session_list,
            tray::set_minimize_to_tray,
            tray::update_tray_labels,
            tray::show_main_window,
            ws::transport::fetch_server_asset,
            ws::transport::upload_chat_attachment,
            ws::transport::probe_server_certificate,
            ws::transport::save_trusted_certificate,
            ws::transport::save_trusted_certificate_for_server,
            ws::transport::get_pinned_fingerprint,
            ws::transport::get_pinned_fingerprint_for_http_url,
            ws::transport::get_trusted_certificates,
            ws::transport::agodesk_connect,
            ws::transport::agodesk_send,
            ws::transport::agodesk_disconnect,
            integration_embed::integration_embed_open,
            integration_embed::integration_embed_set_bounds,
            integration_embed::integration_embed_close,
            commands::speech_asr_status,
            commands::speech_tts_status,
            commands::speech_supertonic_status,
            commands::speech_download_asr_model,
            commands::speech_download_tts_model,
            commands::speech_download_piper_voice,
            commands::speech_sidecar_ping,
            commands::speech_sidecar_transcribe,
            commands::speech_sidecar_synthesize,
            openpets::commands::openpets_status,
            openpets::commands::openpets_set_enabled,
            openpets::commands::openpets_react,
            openpets::commands::openpets_say,
            openpets::commands::openpets_list_pets,
            oauth::oauth_start_listener,
            oauth::oauth_stop_listener,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, RunEvent::Exit) {
                tray::prepare_tray_for_exit(app_handle);
                if let Some(state) = app_handle.try_state::<openpets::OpenPetsState>() {
                    tauri::async_runtime::block_on(state.shutdown());
                }
            }
        });
}
