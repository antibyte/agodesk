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
    capture_screen as desktop_capture_screen, clear_desktop_approvals, inject_input_checked,
    is_screen_capture_approved, list_displays as desktop_list_displays,
    list_windows as desktop_list_windows, permission_status as desktop_permission_status,
    set_input_approved, set_screen_capture_approved, CaptureResult, CaptureScreenOptions,
    ControlPermissionStatus, DisplayInfo, InputEvent, WindowInfo,
};
use crate::speech::sidecar_client::dispatch_speech_op;
use base64::Engine as _;
use futures_util::StreamExt;
use keyring::Entry;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

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

const MISTRAL_KEY_ID: &str = "mistral_api_key";

/// Fallback Voxtral voice when the user has not picked one (stable preset slug).
const DEFAULT_MISTRAL_VOICE: &str = "en_paul_neutral";

fn mistral_keyring_entry() -> Result<Entry, String> {
    Entry::new("agodesk", MISTRAL_KEY_ID).map_err(|error| error.to_string())
}

fn mistral_fallback_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    Ok(dir.join("mistral_api.key"))
}

fn write_mistral_fallback_key(app: &AppHandle, api_key: &str) -> Result<(), String> {
    let path = mistral_fallback_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, api_key).map_err(|error| error.to_string())?;
    restrict_secret_file_permissions(&path);
    Ok(())
}

fn read_mistral_fallback_key(app: &AppHandle) -> Option<String> {
    let path = mistral_fallback_path(app).ok()?;
    if path.exists() {
        fs::read_to_string(path).ok()
    } else {
        None
    }
}

fn delete_mistral_fallback_key(app: &AppHandle) -> Result<(), String> {
    if let Ok(path) = mistral_fallback_path(app) {
        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn store_mistral_api_key(app: AppHandle, api_key: String) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("API key is empty.".to_string());
    }
    write_mistral_fallback_key(&app, trimmed)?;
    if let Ok(entry) = mistral_keyring_entry() {
        let _ = entry.set_password(trimmed);
    }
    Ok(())
}

#[tauri::command]
pub fn get_mistral_api_key(app: AppHandle) -> Result<Option<String>, String> {
    if let Ok(entry) = mistral_keyring_entry() {
        if let Ok(password) = entry.get_password() {
            if !password.trim().is_empty() {
                return Ok(Some(password));
            }
        }
    }
    Ok(read_mistral_fallback_key(&app))
}

#[tauri::command]
pub fn delete_mistral_api_key(app: AppHandle) -> Result<(), String> {
    if let Ok(entry) = mistral_keyring_entry() {
        let _ = entry.delete_credential();
    }
    delete_mistral_fallback_key(&app)
}

#[tauri::command]
pub fn has_mistral_api_key(app: AppHandle) -> Result<bool, String> {
    Ok(get_mistral_api_key(app)?.is_some())
}

/// Wrap raw 16-bit mono PCM samples in a minimal WAV container so the
/// OpenAI-compatible multipart transcription endpoint accepts them as a file.
fn pcm_s16le_to_wav(pcm: &[u8], sample_rate: u32) -> Vec<u8> {
    let channels: u16 = 1;
    let bits_per_sample: u16 = 16;
    let byte_rate = sample_rate * channels as u32 * (bits_per_sample as u32 / 8);
    let block_align = channels * (bits_per_sample / 8);
    let data_len = pcm.len() as u32;
    let riff_len = 36 + data_len;

    let mut wav = Vec::with_capacity(44 + pcm.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&riff_len.to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(pcm);
    wav
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MistralTranscription {
    pub text: String,
}

/// Transcribe one captured utterance (16-bit mono PCM @ `sample_rate`) via the
/// Voxtral batch ASR endpoint (`POST /v1/audio/transcriptions`, multipart).
#[tauri::command]
pub fn mistral_transcribe(
    app: AppHandle,
    pcm_base64: String,
    sample_rate: Option<u32>,
    model: Option<String>,
    language: Option<String>,
) -> Result<MistralTranscription, String> {
    let api_key = get_mistral_api_key(app)?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Mistral API key is not stored.".to_string())?;
    let api_key = api_key.trim().to_string();

    use base64::Engine as _;
    let pcm = base64::engine::general_purpose::STANDARD
        .decode(pcm_base64.trim())
        .map_err(|error| format!("Invalid PCM base64: {error}"))?;
    if pcm.is_empty() {
        return Err("Transcription audio is empty.".to_string());
    }

    let rate = sample_rate.filter(|value| *value >= 8000).unwrap_or(16_000);
    let wav = pcm_s16le_to_wav(&pcm, rate);

    let model = model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("voxtral-mini-latest")
        .to_string();

    let file_part = reqwest::blocking::multipart::Part::bytes(wav)
        .file_name("utterance.wav")
        .mime_str("audio/wav")
        .map_err(|error| format!("Multipart error: {error}"))?;

    let mut form = reqwest::blocking::multipart::Form::new()
        .text("model", model)
        .part("file", file_part);
    if let Some(lang) = language
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty() && !value.eq_ignore_ascii_case("auto"))
    {
        // Voxtral accepts an ISO primary language hint (e.g. "de", "en").
        form = form.text("language", parts_primary_lang(lang));
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|error| format!("HTTP client error: {error}"))?;

    let response = client
        .post("https://api.mistral.ai/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Accept", "application/json")
        .multipart(form)
        .send()
        .map_err(|error| format!("Mistral transcribe request failed: {error}"))?;

    let status = response.status();
    let text = response
        .text()
        .map_err(|error| format!("Mistral transcribe read failed: {error}"))?;

    if !status.is_success() {
        let code = status.as_u16();
        if code == 429 {
            return Err(
                "Mistral Rate-Limit (HTTP 429) bei Transcribe. Bitte kurz warten.".to_string(),
            );
        }
        let snippet: String = text.chars().take(240).collect();
        return Err(format!("Mistral transcribe failed (HTTP {code}): {snippet}"));
    }

    let transcript = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|value| {
            value
                .get("text")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_default();

    Ok(MistralTranscription {
        text: transcript.trim().to_string(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MistralSynthesis {
    pub audio_base64: String,
    /// Raw float32 little-endian PCM sample rate (Voxtral outputs 24 kHz mono).
    pub sample_rate: u32,
    pub encoding: String,
    /// True when Rust already played the audio via the OS (WebView playback not needed).
    pub played_natively: bool,
}

/// OS-level playback cancel flag (WinMM PlaySound).
pub struct MistralNativePlaybackState {
    cancel: Arc<AtomicBool>,
}

impl Default for MistralNativePlaybackState {
    fn default() -> Self {
        Self {
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }
}

fn stop_mistral_native_playback(state: &MistralNativePlaybackState) {
    state.cancel.store(true, Ordering::SeqCst);
    #[cfg(target_os = "windows")]
    unsafe {
        // Stops any in-process PlaySound playback (including SND_SYNC on another thread).
        PlaySoundW(std::ptr::null(), std::ptr::null_mut(), SND_PURGE);
    }
}

#[cfg(target_os = "windows")]
#[link(name = "winmm")]
extern "system" {
    fn PlaySoundW(
        psz_sound: *const u16,
        hmod: *mut core::ffi::c_void,
        fdw_sound: u32,
    ) -> i32;
}

#[cfg(target_os = "windows")]
const SND_SYNC: u32 = 0x0000;
#[cfg(target_os = "windows")]
const SND_NODEFAULT: u32 = 0x0002;
#[cfg(target_os = "windows")]
const SND_FILENAME: u32 = 0x0002_0000;
#[cfg(target_os = "windows")]
const SND_PURGE: u32 = 0x0040;

/// Convert Voxtral float32 LE PCM into a mono 16-bit WAV buffer.
fn f32le_pcm_to_wav(pcm: &[u8], sample_rate: u32) -> Result<Vec<u8>, String> {
    if pcm.len() < 4 || !pcm.len().is_multiple_of(4) {
        return Err(format!("invalid float32 PCM length: {}", pcm.len()));
    }
    let sample_count = pcm.len() / 4;
    let mut i16_samples = Vec::with_capacity(sample_count);
    for chunk in pcm.chunks_exact(4) {
        let sample = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        let clipped = sample.clamp(-1.0, 1.0);
        let amplified = (clipped * 1.8).clamp(-1.0, 1.0); // Voxtral PCM is often quiet
        i16_samples.push((amplified * 32767.0).round() as i16);
    }

    let data_bytes = sample_count * 2;
    let mut wav = Vec::with_capacity(44 + data_bytes);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_bytes as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes()); // PCM fmt chunk size
    wav.extend_from_slice(&1u16.to_le_bytes()); // audio format = PCM
    wav.extend_from_slice(&1u16.to_le_bytes()); // mono
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&(sample_rate * 2).to_le_bytes()); // byte rate
    wav.extend_from_slice(&2u16.to_le_bytes()); // block align
    wav.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(data_bytes as u32).to_le_bytes());
    for sample in i16_samples {
        wav.extend_from_slice(&sample.to_le_bytes());
    }
    Ok(wav)
}

/// Play WAV via WinMM PlaySoundW — reliable on Windows without WebView/WPF.
fn play_wav_bytes_native(
    state: &MistralNativePlaybackState,
    wav: &[u8],
) -> Result<(), String> {
    state.cancel.store(false, Ordering::SeqCst);
    stop_mistral_native_playback(state);
    state.cancel.store(false, Ordering::SeqCst);

    let dir = std::env::temp_dir().join("agodesk-tts");
    fs::create_dir_all(&dir).map_err(|error| format!("temp dir error: {error}"))?;
    let path = dir.join(format!("mistral-{}.wav", uuid::Uuid::new_v4()));
    fs::write(&path, wav).map_err(|error| format!("temp wav write failed: {error}"))?;

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let path_for_cleanup = path.clone();
        let cancel = state.cancel.clone();
        // PlaySoundW is blocking with SND_SYNC; run it and allow PURGE from barge-in.
        std::thread::spawn(move || -> Result<(), String> {
            let ok = unsafe {
                PlaySoundW(
                    wide.as_ptr(),
                    std::ptr::null_mut(),
                    SND_FILENAME | SND_SYNC | SND_NODEFAULT,
                )
            };
            let _ = fs::remove_file(&path_for_cleanup);
            if cancel.load(Ordering::SeqCst) {
                return Err("native WAV playback was interrupted".to_string());
            }
            if ok == 0 {
                return Err("PlaySoundW failed (WinMM)".to_string());
            }
            Ok(())
        })
        .join()
        .map_err(|_| "native WAV playback thread panicked".to_string())?
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (state, path);
        Err("native Mistral TTS playback is only implemented on Windows".to_string())
    }
}

/// Synthesize `text` via the Voxtral TTS endpoint (`POST /v1/audio/speech`).
/// Downloads float32 PCM, converts to WAV, and plays via WinMM PlaySoundW
/// (WebView and PowerShell MediaPlayer were both silent in practice).
#[tauri::command(rename_all = "camelCase")]
pub fn mistral_synthesize(
    app: AppHandle,
    playback: State<'_, MistralNativePlaybackState>,
    text: String,
    voice_id: Option<String>,
    model: Option<String>,
    // When true (default), play via WinMM after download.
    play: Option<bool>,
) -> Result<MistralSynthesis, String> {
    let api_key = get_mistral_api_key(app.clone())?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Mistral API key is not stored.".to_string())?;
    let api_key = api_key.trim().to_string();

    let spoken = text.trim();
    if spoken.is_empty() {
        return Err("TTS text is empty.".to_string());
    }
    // Voxtral generates up to ~2 min per pass; keep unary requests bounded.
    let spoken = if spoken.chars().count() > 8_000 {
        spoken.chars().take(7_999).collect::<String>() + "…"
    } else {
        spoken.to_string()
    };

    let model = model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("voxtral-mini-tts-2603")
        .to_string();

    // `voice` (preset slug, custom voice id, or name) is required by the API.
    let voice = voice_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_MISTRAL_VOICE)
        .to_string();

    // PCM float32 @ 24 kHz — convert to WAV and PlaySoundW (no WebView/WPF).
    let body = serde_json::json!({
        "model": model,
        "input": spoken,
        "voice": voice,
        "response_format": "pcm",
    });

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|error| format!("HTTP client error: {error}"))?;

    let response = client
        .post("https://api.mistral.ai/v1/audio/speech")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, */*")
        .body(body.to_string())
        .send()
        .map_err(|error| format!("Mistral TTS request failed: {error}"))?;

    let status = response.status();
    let text = response
        .text()
        .map_err(|error| format!("Mistral TTS body read failed: {error}"))?;

    if !status.is_success() {
        let code = status.as_u16();
        if code == 429 {
            return Err("Mistral Rate-Limit (HTTP 429) bei TTS. Bitte kurz warten.".to_string());
        }
        let snippet: String = text.chars().take(240).collect();
        return Err(format!("Mistral TTS failed (HTTP {code}): {snippet}"));
    }

    // The endpoint returns a JSON envelope: { "audio_data": "<base64>" }.
    let audio_base64 = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|value| {
            value
                .get("audio_data")
                .or_else(|| value.get("audio"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Mistral TTS returned no audio_data.".to_string())?;

    let pcm_bytes = base64::engine::general_purpose::STANDARD
        .decode(audio_base64.as_bytes())
        .map_err(|error| format!("audio_data base64 decode failed: {error}"))?;

    let wav = f32le_pcm_to_wav(&pcm_bytes, 24_000)?;
    let wav_base64 = base64::engine::general_purpose::STANDARD.encode(&wav);

    let should_play = play.unwrap_or(true);
    let mut played_natively = false;
    if should_play {
        play_wav_bytes_native(playback.inner(), &wav)?;
        played_natively = true;
    }

    Ok(MistralSynthesis {
        audio_base64: wav_base64,
        sample_rate: 24_000,
        encoding: "wav".to_string(),
        played_natively,
    })
}

#[tauri::command]
pub fn mistral_native_playback_cancel(
    playback: State<'_, MistralNativePlaybackState>,
) -> Result<(), String> {
    stop_mistral_native_playback(playback.inner());
    Ok(())
}

const MISTRAL_TTS_CHUNK_EVENT: &str = "mistral-tts:chunk";
const MISTRAL_TTS_DONE_EVENT: &str = "mistral-tts:done";
const MISTRAL_TTS_ERROR_EVENT: &str = "mistral-tts:error";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MistralTtsChunkEvent {
    audio_base64: String,
    sample_rate: u32,
    encoding: String,
}

#[derive(Clone, Serialize)]
struct MistralTtsErrorEvent {
    message: String,
}

struct ParsedMistralTtsSseBlock {
    event: String,
    audio_base64: Option<String>,
}

fn parse_mistral_tts_sse_block(block: &str) -> Option<ParsedMistralTtsSseBlock> {
    let mut event = "message".to_string();
    let mut data = String::new();
    for line in block.split('\n') {
        let line = line.trim_end_matches('\r');
        if let Some(rest) = line.strip_prefix("event:") {
            event = rest.trim().to_string();
        } else if let Some(rest) = line.strip_prefix("data:") {
            data.push_str(rest.trim());
        }
    }
    if data.is_empty() {
        return None;
    }
    let parsed = serde_json::from_str::<serde_json::Value>(&data).ok()?;
    let audio_base64 = parsed
        .get("audio_data")
        .or_else(|| parsed.get("audioData"))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());
    Some(ParsedMistralTtsSseBlock { event, audio_base64 })
}

fn prepare_mistral_tts_request(
    app: &AppHandle,
    text: String,
    voice_id: Option<String>,
    model: Option<String>,
) -> Result<(String, String, String, String), String> {
    let api_key = get_mistral_api_key(app.clone())?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Mistral API key is not stored.".to_string())?;
    let api_key = api_key.trim().to_string();

    let spoken = text.trim();
    if spoken.is_empty() {
        return Err("TTS text is empty.".to_string());
    }
    let spoken = if spoken.chars().count() > 8_000 {
        spoken.chars().take(7_999).collect::<String>() + "…"
    } else {
        spoken.to_string()
    };

    let model = model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("voxtral-mini-tts-2603")
        .to_string();

    let voice = voice_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_MISTRAL_VOICE)
        .to_string();

    Ok((api_key, spoken, model, voice))
}

fn emit_mistral_tts_error(app: &AppHandle, message: impl Into<String>) {
    let _ = app.emit(
        MISTRAL_TTS_ERROR_EVENT,
        MistralTtsErrorEvent {
            message: message.into(),
        },
    );
}

pub struct MistralTtsStreamState {
    cancel: Arc<AtomicBool>,
    task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl Default for MistralTtsStreamState {
    fn default() -> Self {
        Self {
            cancel: Arc::new(AtomicBool::new(false)),
            task: Mutex::new(None),
        }
    }
}

async fn cancel_mistral_tts_stream(state: &MistralTtsStreamState) {
    state.cancel.store(true, Ordering::SeqCst);
    let handle = {
        let mut task = state.task.lock().await;
        task.take()
    };
    if let Some(handle) = handle {
        handle.abort();
        let _ = handle.await;
    }
    state.cancel.store(false, Ordering::SeqCst);
}

async fn run_mistral_tts_stream(
    app: AppHandle,
    cancel: Arc<AtomicBool>,
    api_key: String,
    spoken: String,
    model: String,
    voice: String,
) -> Result<(), String> {
    // Prefer MP3 frames over raw float32 PCM: WebView `decodeAudioData` is more
    // reliable than per-chunk f32le playback. The FE buffers deltas and decodes once.
    let body = serde_json::json!({
        "model": model,
        "input": spoken,
        "voice": voice,
        "response_format": "mp3",
        "stream": true,
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| format!("HTTP client error: {error}"))?;

    let response = client
        .post("https://api.mistral.ai/v1/audio/speech")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .body(body.to_string())
        .send()
        .await
        .map_err(|error| format!("Mistral TTS stream request failed: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        let code = status.as_u16();
        let text = response
            .text()
            .await
            .unwrap_or_default();
        let message = if code == 429 {
            "Mistral Rate-Limit (HTTP 429) bei TTS. Bitte kurz warten.".to_string()
        } else {
            let snippet: String = text.chars().take(240).collect();
            format!("Mistral TTS stream failed (HTTP {code}): {snippet}")
        };
        emit_mistral_tts_error(&app, &message);
        return Err(message);
    }

    let mut buffer = String::new();
    let mut stream = response.bytes_stream();
    let mut saw_done = false;

    while let Some(chunk_result) = stream.next().await {
        if cancel.load(Ordering::SeqCst) {
            return Ok(());
        }
        let chunk = chunk_result.map_err(|error| format!("Mistral TTS stream read failed: {error}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find("\n\n") {
            let block = buffer[..pos].to_string();
            buffer = buffer[pos + 2..].to_string();
            if let Some(parsed) = parse_mistral_tts_sse_block(&block) {
                match parsed.event.as_str() {
                    "speech.audio.delta" => {
                        if let Some(audio_base64) = parsed
                            .audio_base64
                            .filter(|value| !value.is_empty())
                        {
                            let _ = app.emit(
                                MISTRAL_TTS_CHUNK_EVENT,
                                MistralTtsChunkEvent {
                                    audio_base64,
                                    sample_rate: 24_000,
                                    encoding: "mp3".to_string(),
                                },
                            );
                        }
                    }
                    "speech.audio.done" => {
                        saw_done = true;
                        let _ = app.emit(MISTRAL_TTS_DONE_EVENT, serde_json::json!({}));
                    }
                    _ => {}
                }
            }
        }
    }

    if !buffer.trim().is_empty() {
        if let Some(parsed) = parse_mistral_tts_sse_block(buffer.trim()) {
            match parsed.event.as_str() {
                "speech.audio.delta" => {
                    if let Some(audio_base64) = parsed
                        .audio_base64
                        .filter(|value| !value.is_empty())
                    {
                        let _ = app.emit(
                            MISTRAL_TTS_CHUNK_EVENT,
                            MistralTtsChunkEvent {
                                audio_base64,
                                sample_rate: 24_000,
                                encoding: "mp3".to_string(),
                            },
                        );
                    }
                }
                "speech.audio.done" => {
                    saw_done = true;
                    let _ = app.emit(MISTRAL_TTS_DONE_EVENT, serde_json::json!({}));
                }
                _ => {}
            }
        }
    }

    if !saw_done && !cancel.load(Ordering::SeqCst) {
        let _ = app.emit(MISTRAL_TTS_DONE_EVENT, serde_json::json!({}));
    }

    Ok(())
}

/// Stream TTS audio via SSE; emits `mistral-tts:chunk`, `mistral-tts:done`, `mistral-tts:error`.
#[tauri::command(rename_all = "camelCase")]
pub async fn mistral_synthesize_stream(
    app: AppHandle,
    state: State<'_, MistralTtsStreamState>,
    text: String,
    voice_id: Option<String>,
    model: Option<String>,
) -> Result<(), String> {
    cancel_mistral_tts_stream(state.inner()).await;

    let (api_key, spoken, model, voice) =
        prepare_mistral_tts_request(&app, text, voice_id, model)?;

    let cancel = state.inner().cancel.clone();
    cancel.store(false, Ordering::SeqCst);
    let app_for_task = app.clone();

    let (done_tx, done_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();

    let handle = tauri::async_runtime::spawn(async move {
        let result =
            run_mistral_tts_stream(app_for_task, cancel, api_key, spoken, model, voice).await;
        let _ = done_tx.send(result);
    });

    {
        let mut task = state.task.lock().await;
        *task = Some(handle);
    }

    let result = match done_rx.await {
        Ok(result) => result,
        Err(_) => Ok(()),
    };

    {
        let mut task = state.task.lock().await;
        if let Some(handle) = task.take() {
            let _ = handle.await;
        }
    }

    if let Err(message) = &result {
        emit_mistral_tts_error(&app, message);
    }

    result
}

#[tauri::command]
pub async fn mistral_synthesize_stream_cancel(
    state: State<'_, MistralTtsStreamState>,
) -> Result<(), String> {
    cancel_mistral_tts_stream(state.inner()).await;
    Ok(())
}

#[cfg(test)]
mod mistral_tts_sse_tests {
    use super::parse_mistral_tts_sse_block;

    #[test]
    fn parse_mistral_tts_sse_block_reads_speech_audio_delta() {
        let parsed = parse_mistral_tts_sse_block(
            "event: speech.audio.delta\ndata: {\"audio_data\":\"AAAA\"}\n",
        )
        .expect("block should parse");
        assert_eq!(parsed.event, "speech.audio.delta");
        assert_eq!(parsed.audio_base64.as_deref(), Some("AAAA"));
    }

    #[test]
    fn parse_mistral_tts_sse_block_reads_done_without_audio() {
        let parsed = parse_mistral_tts_sse_block(
            "event: speech.audio.done\ndata: {}\n",
        )
        .expect("block should parse");
        assert_eq!(parsed.event, "speech.audio.done");
        assert!(parsed.audio_base64.is_none());
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MistralVoice {
    pub id: String,
    pub name: String,
    pub slug: Option<String>,
    pub language: Option<String>,
}

/// List available Voxtral voices (presets + account custom voices) for the settings UI.
#[tauri::command]
pub fn list_mistral_voices(app: AppHandle) -> Result<Vec<MistralVoice>, String> {
    let api_key = get_mistral_api_key(app)?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Mistral API key is not stored.".to_string())?;
    let api_key = api_key.trim().to_string();

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| format!("HTTP client error: {error}"))?;

    let response = client
        .get("https://api.mistral.ai/v1/audio/voices")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Accept", "application/json")
        .send()
        .map_err(|error| format!("Mistral list voices failed: {error}"))?;

    let status = response.status();
    let text = response
        .text()
        .map_err(|error| format!("Mistral list voices read failed: {error}"))?;
    if !status.is_success() {
        let code = status.as_u16();
        let snippet: String = text.chars().take(200).collect();
        return Err(format!("Mistral list voices failed (HTTP {code}): {snippet}"));
    }

    let parsed = serde_json::from_str::<serde_json::Value>(&text)
        .map_err(|error| format!("Mistral list voices parse failed: {error}"))?;
    let items = parsed
        .get("items")
        .or_else(|| parsed.get("data"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut voices: Vec<MistralVoice> = Vec::new();
    for entry in items {
        let id = entry
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let slug = entry
            .get("slug")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        // Prefer the stable slug as the usable voice identifier, fall back to the id.
        let usable = slug.clone().unwrap_or_else(|| id.clone());
        if usable.is_empty() {
            continue;
        }
        let name = entry
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(&usable)
            .trim()
            .to_string();
        let language = entry
            .get("languages")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        voices.push(MistralVoice {
            id: usable,
            name,
            slug,
            language,
        });
    }

    Ok(voices)
}

/// Local key check (no network by default) mirroring `test_xai_api_key`.
#[tauri::command]
pub fn test_mistral_api_key(app: AppHandle, network: Option<bool>) -> Result<String, String> {
    let api_key = get_mistral_api_key(app)?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Mistral API key is not stored.".to_string())?;
    let api_key = api_key.trim().to_string();

    if api_key.len() < 8 {
        return Err("Gespeicherter Mistral API-Key ist zu kurz / ungültig.".to_string());
    }

    if !network.unwrap_or(false) {
        return Ok(
            "Mistral API-Key ist lokal gespeichert. Kein Netzwerk-Call. Mic startet die Voice-Pipeline."
                .to_string(),
        );
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| format!("HTTP client error: {error}"))?;

    let response = client
        .get("https://api.mistral.ai/v1/models")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Accept", "application/json")
        .send()
        .map_err(|error| format!("Mistral models request failed: {error}"))?;

    let status = response.status();
    let text = response
        .text()
        .map_err(|error| format!("Mistral models response read failed: {error}"))?;

    if status.is_success() {
        return Ok("Mistral API-Key ist gültig (GET /v1/models OK).".to_string());
    }

    let code = status.as_u16();
    let snippet: String = text.chars().take(200).collect();
    if code == 401 {
        return Err("Mistral Auth fehlgeschlagen (HTTP 401): API-Key ungültig.".to_string());
    }
    if code == 429 {
        return Err("Mistral Rate-Limit (HTTP 429). Bitte später erneut versuchen.".to_string());
    }
    Err(format!("Mistral API key test failed (HTTP {code}): {snippet}"))
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
    if !is_screen_capture_approved()? {
        return Err(
            "DESKTOP_CAPTURE_NOT_APPROVED: Screen capture requires an active approval.".to_string(),
        );
    }
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
pub fn set_screen_capture_approval(approved: bool) -> Result<(), String> {
    set_screen_capture_approved(approved)
}

#[tauri::command]
pub fn reset_desktop_session() -> Result<(), String> {
    clear_desktop_approvals()
}

fn is_allowed_external_url(url: &str) -> bool {
    let trimmed = url.trim();
    let Some((scheme, rest)) = trimmed.split_once(':') else {
        return false;
    };
    if rest.starts_with("//") {
        // hierarchical: https://… / http://…
    } else if scheme.eq_ignore_ascii_case("mailto") {
        return !rest.is_empty();
    } else {
        return false;
    }
    matches!(
        scheme.to_ascii_lowercase().as_str(),
        "https" | "http" | "mailto"
    )
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    if !is_allowed_external_url(&url) {
        return Err(
            "EXTERNAL_URL_DENIED: Only http, https, and mailto URLs are allowed.".to_string(),
        );
    }
    open::that(&url).map_err(|error| error.to_string())
}

#[cfg(test)]
mod open_external_url_tests {
    use super::is_allowed_external_url;

    #[test]
    fn allows_http_https_mailto() {
        assert!(is_allowed_external_url("https://example.com/a"));
        assert!(is_allowed_external_url("http://127.0.0.1:8080"));
        assert!(is_allowed_external_url("mailto:user@example.com"));
    }

    #[test]
    fn denies_dangerous_schemes() {
        assert!(!is_allowed_external_url("file:///C:/secret.txt"));
        assert!(!is_allowed_external_url("javascript:alert(1)"));
        assert!(!is_allowed_external_url("data:text/html,hi"));
        assert!(!is_allowed_external_url("ms-settings:privacy"));
        assert!(!is_allowed_external_url("not a url"));
    }
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
pub async fn browser_page_agent_execute(
    state: State<'_, BrowserState>,
    task: String,
) -> Result<(), String> {
    browser::page_agent_execute(&state, task).await
}

#[tauri::command]
pub async fn browser_page_agent_navigate(
    state: State<'_, BrowserState>,
    url: String,
) -> Result<(), String> {
    browser::page_agent_navigate(&state, url).await
}

#[tauri::command]
pub async fn browser_page_agent_ensure(
    state: State<'_, BrowserState>,
    prefill: Option<String>,
) -> Result<(), String> {
    browser::page_agent_ensure(&state, prefill).await
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

