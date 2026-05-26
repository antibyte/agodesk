use crate::desktop::{
    capture_screen as desktop_capture_screen, inject_input_checked, list_displays as desktop_list_displays,
    list_windows as desktop_list_windows, permission_status as desktop_permission_status,
    set_input_approved, CaptureResult, CaptureScreenOptions, ControlPermissionStatus, DisplayInfo,
    InputEvent, WindowInfo,
};
use keyring::Entry;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

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
    fs::write(path, shared_key).map_err(|error| error.to_string())
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
        hostname: whoami::fallible::hostname().unwrap_or_else(|_| "unknown".to_string()),
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
