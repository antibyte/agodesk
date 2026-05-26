use crate::ws::tls::parse_ws_url;
use crate::ws::types::TrustedCertificateStore;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("trusted_certificates.json"))
}

pub fn load_store(app: &AppHandle) -> Result<TrustedCertificateStore, String> {
    let path = store_path(app)?;
    if !path.exists() {
        return Ok(TrustedCertificateStore::default());
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

pub fn save_store(app: &AppHandle, store: &TrustedCertificateStore) -> Result<(), String> {
    let path = store_path(app)?;
    let raw = serde_json::to_string_pretty(store).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())
}

pub fn pinned_fingerprint_for_url(
    app: &AppHandle,
    server_url: &str,
) -> Result<Option<String>, String> {
    let parsed = parse_ws_url(server_url)?;
    let store = load_store(app)?;
    Ok(store
        .trusted_certificates
        .get(&parsed.origin)
        .map(|entry| entry.sha256_fingerprint.clone()))
}

pub fn save_trusted_certificate(
    app: &AppHandle,
    origin: String,
    entry: crate::ws::types::TrustedCertificateEntry,
) -> Result<(), String> {
    let mut store = load_store(app)?;
    store.trusted_certificates.insert(origin, entry);
    save_store(app, &store)
}
