use crate::computer_use::types::{
    ActiveWindowInfo, BrowserActionParams, BrowserConnectParams, BrowserSessionInfo,
    BrowserSnapshotParams, BrowserSnapshotResult, BrowserTabListResult, UiActionParams,
    UiActionResult, UiTreeResult,
};
use crate::computer_use::{
    browser::{self, BrowserState}, get_active_window as computer_use_active_window,
    perform_ui_action as computer_use_ui_action, ui_tree_for_window as computer_use_ui_tree,
};
use crate::desktop::{
    capture_screen as desktop_capture_screen, inject_input_checked,
    list_displays as desktop_list_displays, list_windows as desktop_list_windows,
    permission_status as desktop_permission_status, set_input_approved, CaptureResult,
    CaptureScreenOptions, ControlPermissionStatus, DisplayInfo, InputEvent, WindowInfo,
};
use crate::speech::sidecar_client::dispatch_speech_op;
use keyring::Entry;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

/// Restrict fallback secret files to owner-read/write on Unix (0600).
#[cfg(unix)]
fn restrict_secret_file_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(metadata) = fs::metadata(path) {
        let mut perms = metadata.permissions();
        perms.set_mode(0o600);
        let _ = fs::set_permissions(path, perms);
    }
}

#[cfg(not(unix))]
fn restrict_secret_file_permissions(_path: &Path) {}

#[derive(Serialize)]
pub struct HostInfo {
    pub hostname: String,
    pub platform: String,
    pub arch: String,
}

fn keyring_entry(device_id: &str) -> Result<Entry, String> {
    Entry::new("agodesk", device_id).map_err(|error| error.to_string())
}

fn fallback_key_path(app: &AppHandle, device_id: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    let keys_dir = dir.join("shared_keys");
    fs::create_dir_all(&keys_dir).map_err(|error| error.to_string())?;
    Ok(keys_dir.join(format!("{device_id}.key")))
}

fn write_fallback_key(app: &AppHandle, device_id: &str, shared_key: &str) -> Result<(), String> {
    let path = fallback_key_path(app, device_id)?;
    fs::write(&path, shared_key).map_err(|error| error.to_string())?;
    restrict_secret_file_permissions(&path);
    Ok(())
}

fn read_fallback_key(app: &AppHandle, device_id: &str) -> Option<String> {
    let path = fallback_key_path(app, device_id).ok()?;
    if path.exists() {
        fs::read_to_string(path).ok()
    } else {
        None
    }
}

fn delete_fallback_key(app: &AppHandle, device_id: &str) -> Result<(), String> {
    if let Ok(path) = fallback_key_path(app, device_id) {
        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

const GEMINI_KEY_ID: &str = "gemini_api_key";

fn gemini_keyring_entry() -> Result<Entry, String> {
    Entry::new("agodesk", GEMINI_KEY_ID).map_err(|error| error.to_string())
}

fn gemini_fallback_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    Ok(dir.join("gemini_api.key"))
}

fn write_gemini_fallback_key(app: &AppHandle, api_key: &str) -> Result<(), String> {
    let path = gemini_fallback_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, api_key).map_err(|error| error.to_string())?;
    restrict_secret_file_permissions(&path);
    Ok(())
}

fn read_gemini_fallback_key(app: &AppHandle) -> Option<String> {
    let path = gemini_fallback_path(app).ok()?;
    if path.exists() {
        fs::read_to_string(path).ok()
    } else {
        None
    }
}

fn delete_gemini_fallback_key(app: &AppHandle) -> Result<(), String> {
    if let Ok(path) = gemini_fallback_path(app) {
        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn store_gemini_api_key(app: AppHandle, api_key: String) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("API key is empty.".to_string());
    }
    write_gemini_fallback_key(&app, trimmed)?;
    if let Ok(entry) = gemini_keyring_entry() {
        let _ = entry.set_password(trimmed);
    }
    Ok(())
}

#[tauri::command]
pub fn get_gemini_api_key(app: AppHandle) -> Result<Option<String>, String> {
    if let Ok(entry) = gemini_keyring_entry() {
        if let Ok(password) = entry.get_password() {
            if !password.trim().is_empty() {
                return Ok(Some(password));
            }
        }
    }
    Ok(read_gemini_fallback_key(&app))
}

#[tauri::command]
pub fn delete_gemini_api_key(app: AppHandle) -> Result<(), String> {
    if let Ok(entry) = gemini_keyring_entry() {
        let _ = entry.delete_credential();
    }
    delete_gemini_fallback_key(&app)
}

#[tauri::command]
pub fn has_gemini_api_key(app: AppHandle) -> Result<bool, String> {
    Ok(get_gemini_api_key(app)?.is_some())
}

#[tauri::command]
pub fn store_shared_key(
    app: AppHandle,
    device_id: String,
    shared_key: String,
) -> Result<(), String> {
    write_fallback_key(&app, &device_id, &shared_key)?;
    if let Ok(entry) = keyring_entry(&device_id) {
        let _ = entry.set_password(&shared_key);
    }
    Ok(())
}

#[tauri::command]
pub fn get_shared_key(app: AppHandle, device_id: String) -> Result<Option<String>, String> {
    if let Ok(entry) = keyring_entry(&device_id) {
        if let Ok(password) = entry.get_password() {
            return Ok(Some(password));
        }
    }
    Ok(read_fallback_key(&app, &device_id))
}

#[tauri::command]
pub fn delete_shared_key(app: AppHandle, device_id: String) -> Result<(), String> {
    if let Ok(entry) = keyring_entry(&device_id) {
        let _ = entry.delete_credential();
    }
    delete_fallback_key(&app, &device_id)
}

#[tauri::command]
pub fn collect_host_info() -> Result<HostInfo, String> {
    Ok(HostInfo {
        hostname: whoami::hostname().unwrap_or_else(|_| "unknown".to_string()),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    })
}

#[tauri::command]
pub fn list_displays() -> Result<Vec<DisplayInfo>, String> {
    desktop_list_displays()
}

#[tauri::command]
pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    desktop_list_windows()
}

#[tauri::command]
pub fn capture_screen(options: CaptureScreenOptions) -> Result<CaptureResult, String> {
    desktop_capture_screen(options)
}

#[tauri::command]
pub fn control_permission_status() -> Result<ControlPermissionStatus, String> {
    desktop_permission_status()
}

#[tauri::command]
pub fn inject_input(event: InputEvent) -> Result<(), String> {
    inject_input_checked(event)
}

#[tauri::command]
pub fn set_input_approval(approved: bool) -> Result<(), String> {
    set_input_approved(approved)
}

#[tauri::command]
pub fn reset_desktop_session() -> Result<(), String> {
    set_input_approved(false)
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_active_window() -> Result<ActiveWindowInfo, String> {
    computer_use_active_window()
}

#[tauri::command]
pub fn get_ui_tree(window_id: Option<String>) -> Result<UiTreeResult, String> {
    computer_use_ui_tree(window_id.as_deref())
}

#[tauri::command]
pub fn perform_ui_action(params: UiActionParams) -> Result<UiActionResult, String> {
    computer_use_ui_action(&params)
}

#[tauri::command]
pub async fn browser_list_tabs(
    state: State<'_, BrowserState>,
) -> Result<BrowserTabListResult, String> {
    browser::list_tabs(&state).await
}

#[tauri::command]
pub async fn browser_connect(
    state: State<'_, BrowserState>,
    params: BrowserConnectParams,
) -> Result<BrowserSessionInfo, String> {
    browser::connect(&state, params).await
}

#[tauri::command]
pub async fn browser_snapshot(
    state: State<'_, BrowserState>,
    params: BrowserSnapshotParams,
) -> Result<BrowserSnapshotResult, String> {
    browser::snapshot(&state, params).await
}

#[tauri::command]
pub async fn browser_action(
    state: State<'_, BrowserState>,
    params: BrowserActionParams,
) -> Result<serde_json::Value, String> {
    browser::action(&state, params).await
}

#[tauri::command]
pub async fn browser_disconnect(state: State<'_, BrowserState>) -> Result<(), String> {
    browser::disconnect(&state).await
}

#[tauri::command]
pub fn speech_asr_status(model: Option<String>) -> Result<serde_json::Value, String> {
    let status = crate::speech::asr::asr_status(model.as_deref());
    serde_json::to_value(status).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn speech_tts_status(voice: Option<String>) -> Result<serde_json::Value, String> {
    let status = crate::speech::tts::tts_status(voice.as_deref());
    serde_json::to_value(status).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn speech_download_asr_model(
    app: tauri::AppHandle,
    model: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::speech::model_download::download_asr_model(&app, &model)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn speech_sidecar_ping() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(|| dispatch_speech_op("ping", serde_json::json!({})))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn speech_sidecar_transcribe(
    pcm_base64: String,
    sample_rate: Option<u32>,
    language: Option<String>,
    model: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        dispatch_speech_op(
            "transcribe",
            serde_json::json!({
                "pcm_base64": pcm_base64,
                "sample_rate": sample_rate.unwrap_or(16_000),
                "language": language,
                "model": model,
            }),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn speech_sidecar_synthesize(
    text: String,
    voice: String,
    backend: String,
    rate: Option<f32>,
    pitch: Option<f32>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        dispatch_speech_op(
            "synthesize",
            serde_json::json!({
                "text": text,
                "voice": voice,
                "backend": backend,
                "rate": rate,
                "pitch": pitch,
            }),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

