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

const XAI_KEY_ID: &str = "xai_api_key";

fn xai_keyring_entry() -> Result<Entry, String> {
    Entry::new("agodesk", XAI_KEY_ID).map_err(|error| error.to_string())
}

fn xai_fallback_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    Ok(dir.join("xai_api.key"))
}

fn write_xai_fallback_key(app: &AppHandle, api_key: &str) -> Result<(), String> {
    let path = xai_fallback_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, api_key).map_err(|error| error.to_string())?;
    restrict_secret_file_permissions(&path);
    Ok(())
}

fn read_xai_fallback_key(app: &AppHandle) -> Option<String> {
    let path = xai_fallback_path(app).ok()?;
    if path.exists() {
        fs::read_to_string(path).ok()
    } else {
        None
    }
}

fn delete_xai_fallback_key(app: &AppHandle) -> Result<(), String> {
    if let Ok(path) = xai_fallback_path(app) {
        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn store_xai_api_key(app: AppHandle, api_key: String) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("API key is empty.".to_string());
    }
    write_xai_fallback_key(&app, trimmed)?;
    if let Ok(entry) = xai_keyring_entry() {
        let _ = entry.set_password(trimmed);
    }
    Ok(())
}

#[tauri::command]
pub fn get_xai_api_key(app: AppHandle) -> Result<Option<String>, String> {
    if let Ok(entry) = xai_keyring_entry() {
        if let Ok(password) = entry.get_password() {
            if !password.trim().is_empty() {
                return Ok(Some(password));
            }
        }
    }
    Ok(read_xai_fallback_key(&app))
}

#[tauri::command]
pub fn delete_xai_api_key(app: AppHandle) -> Result<(), String> {
    if let Ok(entry) = xai_keyring_entry() {
        let _ = entry.delete_credential();
    }
    delete_xai_fallback_key(&app)
}

#[tauri::command]
pub fn has_xai_api_key(app: AppHandle) -> Result<bool, String> {
    Ok(get_xai_api_key(app)?.is_some())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XaiTtsVoice {
    pub voice_id: String,
    pub name: String,
    pub language: Option<String>,
    pub custom: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XaiTtsSynthesis {
    pub audio_base64: String,
    pub content_type: String,
}

/// Unary Grok TTS for chat replies when the live Voice session is not recording.
/// Uses the same voice_id catalog as Voice Agent / console.
#[tauri::command]
pub fn xai_tts_synthesize(
    app: AppHandle,
    text: String,
    voice_id: String,
    language: Option<String>,
) -> Result<XaiTtsSynthesis, String> {
    let api_key = get_xai_api_key(app)?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "xAI API key is not stored.".to_string())?;
    let api_key = api_key.trim();

    let spoken = text.trim();
    if spoken.is_empty() {
        return Err("TTS text is empty.".to_string());
    }
    // Match API unary limit (15_000 chars).
    let spoken = if spoken.chars().count() > 15_000 {
        spoken.chars().take(14_999).collect::<String>() + "…"
    } else {
        spoken.to_string()
    };

    let voice = {
        let trimmed = voice_id.trim();
        if trimmed.is_empty() {
            "eve".to_string()
        } else {
            trimmed.to_ascii_lowercase()
        }
    };
    let lang = language
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("de");

    // Map de-DE → de for TTS language codes where a bare primary works.
    let lang = if lang.eq_ignore_ascii_case("auto") {
        "auto".to_string()
    } else if lang.len() > 2 && lang.contains('-') {
        // Keep regional variants required by API (es-MX, pt-BR, …).
        let lower = lang.to_ascii_lowercase();
        if lower.starts_with("es-") || lower.starts_with("pt-") || lower.starts_with("ar-") {
            // Normalize casing for regional tags.
            let parts: Vec<&str> = lang.split('-').collect();
            if parts.len() >= 2 {
                format!("{}-{}", parts[0].to_ascii_lowercase(), parts[1].to_ascii_uppercase())
            } else {
                lang.to_string()
            }
        } else {
            parts_primary_lang(lang)
        }
    } else {
        lang.to_ascii_lowercase()
    };

    let body = serde_json::json!({
        "text": spoken,
        "voice_id": voice,
        "language": lang,
        "output_format": {
            "codec": "mp3",
            "sample_rate": 24000,
            "bit_rate": 128000
        }
    });

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|error| format!("HTTP client error: {error}"))?;

    let response = client
        .post("https://api.x.ai/v1/tts")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .header("Accept", "audio/mpeg, application/json, */*")
        .body(body.to_string())
        .send()
        .map_err(|error| format!("xAI TTS request failed: {error}"))?;

    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("audio/mpeg")
        .to_string();

    if !status.is_success() {
        let text = response.text().unwrap_or_default();
        let code = status.as_u16();
        if code == 429 {
            return Err(
                "xAI Rate-Limit (HTTP 429) bei TTS. Bitte kurz warten, dann erneut versuchen."
                    .to_string(),
            );
        }
        let snippet: String = text.chars().take(240).collect();
        return Err(format!("xAI TTS failed (HTTP {code}): {snippet}"));
    }

    // JSON envelope (with_timestamps) is not used; expect raw audio bytes.
    let bytes = response
        .bytes()
        .map_err(|error| format!("xAI TTS body read failed: {error}"))?;
    if bytes.is_empty() {
        return Err("xAI TTS returned empty audio.".to_string());
    }

    use base64::Engine as _;
    let audio_base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(XaiTtsSynthesis {
        audio_base64,
        content_type,
    })
}

fn parts_primary_lang(lang: &str) -> String {
    lang.split('-')
        .next()
        .unwrap_or(lang)
        .to_ascii_lowercase()
}

/// List built-in TTS/Voice Agent voices (+ optional custom voices) for the settings UI.
#[tauri::command]
pub fn list_xai_tts_voices(app: AppHandle) -> Result<Vec<XaiTtsVoice>, String> {
    let api_key = get_xai_api_key(app)?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "xAI API key is not stored.".to_string())?;
    let api_key = api_key.trim();

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| format!("HTTP client error: {error}"))?;

    let mut voices: Vec<XaiTtsVoice> = Vec::new();

    let built_in = client
        .get("https://api.x.ai/v1/tts/voices")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Accept", "application/json")
        .send()
        .map_err(|error| format!("xAI list voices failed: {error}"))?;

    let built_status = built_in.status();
    let built_text = built_in
        .text()
        .map_err(|error| format!("xAI list voices read failed: {error}"))?;
    if !built_status.is_success() {
        let code = built_status.as_u16();
        if code == 429 {
            return Err(
                "xAI Rate-Limit (HTTP 429) beim Laden der Stimmen. Bitte später erneut versuchen."
                    .to_string(),
            );
        }
        let snippet: String = built_text.chars().take(200).collect();
        return Err(format!("xAI list voices failed (HTTP {code}): {snippet}"));
    }

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&built_text) {
        if let Some(arr) = parsed.get("voices").and_then(|v| v.as_array()) {
            for entry in arr {
                let id = entry
                    .get("voice_id")
                    .or_else(|| entry.get("id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                if id.is_empty() {
                    continue;
                }
                let name = entry
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or(id)
                    .trim()
                    .to_string();
                let language = entry
                    .get("language")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                voices.push(XaiTtsVoice {
                    voice_id: id.to_ascii_lowercase(),
                    name,
                    language,
                    custom: false,
                });
            }
        }
    }

    // Best-effort custom voice catalog (console clones).
    if let Ok(custom_resp) = client
        .get("https://api.x.ai/v1/custom-voices")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Accept", "application/json")
        .send()
    {
        if custom_resp.status().is_success() {
            if let Ok(text) = custom_resp.text() {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(arr) = parsed.get("voices").and_then(|v| v.as_array()) {
                        for entry in arr {
                            let id = entry
                                .get("voice_id")
                                .or_else(|| entry.get("id"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .trim();
                            if id.is_empty() {
                                continue;
                            }
                            let name = entry
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or(id)
                                .trim()
                                .to_string();
                            let language = entry
                                .get("language")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            voices.push(XaiTtsVoice {
                                voice_id: id.to_ascii_lowercase(),
                                name: if name.is_empty() {
                                    id.to_string()
                                } else {
                                    format!("{name} (custom)")
                                },
                                language,
                                custom: true,
                            });
                        }
                    }
                }
            }
        }
    }

    if voices.is_empty() {
        return Err("xAI returned an empty voice list.".to_string());
    }

    Ok(voices)
}

/// Local + optional network key check.
///
/// Default (`network: false` / omitted): only verifies a non-empty stored key
/// (no xAI HTTP call — does not burn rate limit).
/// With `network: true`: `GET /v1/tts/voices` with Bearer auth.
#[tauri::command]
pub fn test_xai_api_key(app: AppHandle, network: Option<bool>) -> Result<String, String> {
    let api_key = get_xai_api_key(app)?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "xAI API key is not stored.".to_string())?;
    let api_key = api_key.trim();

    if api_key.len() < 8 {
        return Err("Gespeicherter xAI API-Key ist zu kurz / ungültig.".to_string());
    }

    if !network.unwrap_or(false) {
        return Ok(
            "xAI API-Key ist lokal gespeichert. Kein Netzwerk-Call (schont Rate-Limits). Mic startet die echte Voice-Session."
                .to_string(),
        );
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| format!("HTTP client error: {error}"))?;

    let response = client
        .get("https://api.x.ai/v1/tts/voices")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Accept", "application/json")
        .send()
        .map_err(|error| format!("xAI voices request failed: {error}"))?;

    let status = response.status();
    let text = response
        .text()
        .map_err(|error| format!("xAI voices response read failed: {error}"))?;

    if status.is_success() {
        return Ok(
            "xAI API-Key ist gültig (GET /v1/tts/voices OK). Realtime Voice kann eigene Limits haben."
                .to_string(),
        );
    }

    let code = status.as_u16();
    let snippet: String = text.chars().take(200).collect();
    if code == 429 {
        return Err(concat!(
            "xAI Rate-Limit (HTTP 429) beim Voice/TTS-Endpoint. ",
            "Key-Format ist i.d.R. ok — Team-Limit erreicht. ",
            "5–15 Min warten, Console Rate Limits prüfen, nicht erneut klicken. ",
            "Voice-Limits: sales@x.ai / console.x.ai"
        )
        .to_string());
    }
    if code == 401 {
        return Err(
            "xAI Auth fehlgeschlagen (HTTP 401): API-Key ungültig oder abgelaufen.".to_string(),
        );
    }
    if code == 403 {
        return Err(
            "xAI Zugriff verweigert (HTTP 403): Kein Zugriff für diesen Key/Account.".to_string(),
        );
    }
    if snippet.is_empty() {
        return Err(format!("xAI API key test failed (HTTP {code})."));
    }
    Err(format!("xAI API key test failed (HTTP {code}): {snippet}"))
}

/// Mint a short-lived xAI realtime client secret so the WebView can connect
/// without exposing the long-lived API key (browser WS cannot set Authorization).
#[tauri::command]
pub fn create_xai_realtime_client_secret(
    app: AppHandle,
    expires_seconds: Option<u64>,
) -> Result<String, String> {
    let api_key = get_xai_api_key(app)?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "xAI API key is not stored.".to_string())?;

    let seconds = expires_seconds.unwrap_or(300).clamp(30, 3600);
    let body = serde_json::json!({
        "expires_after": {
            "seconds": seconds
        }
    });

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| format!("HTTP client error: {error}"))?;

    let response = client
        .post("https://api.x.ai/v1/realtime/client_secrets")
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .body(body.to_string())
        .send()
        .map_err(|error| format!("xAI client_secrets request failed: {error}"))?;

    let status = response.status();
    let text = response
        .text()
        .map_err(|error| format!("xAI client_secrets response read failed: {error}"))?;

    if !status.is_success() {
        let code = status.as_u16();
        let snippet: String = text.chars().take(240).collect();
        if code == 429 {
            return Err(concat!(
                "xAI Rate-Limit (HTTP 429) bei client_secrets. ",
                "Nicht erneut anfragen — warten und Console Rate Limits prüfen."
            )
            .to_string());
        }
        if code == 401 {
            return Err(
                "xAI Auth fehlgeschlagen (HTTP 401): API-Key ungültig oder abgelaufen.".to_string(),
            );
        }
        return Err(format!("xAI client_secrets failed (HTTP {code}): {snippet}"));
    }

    let parsed: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| format!("xAI client_secrets JSON parse failed: {error}"))?;

    extract_xai_client_secret(&parsed).ok_or_else(|| {
        "xAI client_secrets response did not include a token value.".to_string()
    })
}

fn extract_xai_client_secret(value: &serde_json::Value) -> Option<String> {
    if let Some(s) = value.get("value").and_then(|v| v.as_str()) {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    if let Some(s) = value.get("client_secret").and_then(|v| v.as_str()) {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    if let Some(nested) = value.get("client_secret") {
        if let Some(s) = nested.get("value").and_then(|v| v.as_str()) {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    if let Some(s) = value.get("secret").and_then(|v| v.as_str()) {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    if let Some(s) = value.get("token").and_then(|v| v.as_str()) {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    None
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
pub fn open_temp_file(filename: String, bytes: Vec<u8>) -> Result<(), String> {
    let safe: String = filename
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let safe = if safe.is_empty() {
        "attachment.bin".to_string()
    } else {
        safe
    };

    let dir = std::env::temp_dir().join("agodesk-media");
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = dir.join(format!("{}-{}", uuid::Uuid::new_v4(), safe));
    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
    open::that(&path).map_err(|error| error.to_string())
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
pub async fn browser_page_agent_enable(
    app: AppHandle,
    state: State<'_, BrowserState>,
    bundle: String,
    bootstrap: String,
) -> Result<(), String> {
    browser::page_agent_enable(&state, app, bundle, bootstrap).await
}

#[tauri::command]
pub async fn browser_page_agent_resolve(
    state: State<'_, BrowserState>,
    request_id: String,
    ok: bool,
    payload: String,
) -> Result<(), String> {
    browser::page_agent_resolve(&state, request_id, ok, payload).await
}

#[tauri::command]
pub async fn browser_page_agent_disable(state: State<'_, BrowserState>) -> Result<(), String> {
    browser::page_agent_disable(&state).await
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
pub async fn speech_supertonic_status() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(|| dispatch_speech_op("supertonic_status", serde_json::json!({})))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn speech_download_tts_model(
    app: tauri::AppHandle,
    model: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::speech::model_download::download_supertonic_model(&app, &model)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn speech_download_piper_voice(
    app: tauri::AppHandle,
    voice: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::speech::model_download::download_piper_voice(&app, &voice)
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
    lang: Option<String>,
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
                "lang": lang,
            }),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

