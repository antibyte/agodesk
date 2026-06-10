use crate::ws::tls::parse_ws_url;
use crate::ws::types::TrustedCertificateStore;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use url::Url;

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

pub fn pinned_fingerprint_for_http_url(
    app: &AppHandle,
    asset_url: &str,
) -> Result<Option<String>, String> {
    let url = Url::parse(asset_url).map_err(|error| error.to_string())?;
    let origin = http_origin_from_url(&url)?;
    let store = load_store(app)?;
    Ok(store
        .trusted_certificates
        .get(&origin)
        .map(|entry| entry.sha256_fingerprint.clone()))
}

pub fn http_origin_from_url(url: &Url) -> Result<String, String> {
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" && scheme != "ws" && scheme != "wss" {
        return Err(format!("Unsupported origin scheme: {scheme}"));
    }
    let host = url
        .host_str()
        .ok_or_else(|| "Missing host in asset URL.".to_string())?;
    let http_scheme = if scheme == "wss" {
        "https"
    } else if scheme == "ws" {
        "http"
    } else {
        scheme
    };
    let default_port = if http_scheme == "https" { 443 } else { 80 };
    let port = url.port().unwrap_or(default_port);
    if port == default_port {
        Ok(format!("{http_scheme}://{host}"))
    } else {
        Ok(format!("{http_scheme}://{host}:{port}"))
    }
}

pub fn server_http_origin(server_url: &str) -> Result<String, String> {
    let parsed = parse_ws_url(server_url)?;
    let http_scheme = if parsed.origin.starts_with("wss://") {
        "https"
    } else {
        "http"
    };
    let default_port = if http_scheme == "https" { 443 } else { 80 };
    if parsed.port == default_port {
        Ok(format!("{http_scheme}://{}", parsed.host))
    } else {
        Ok(format!("{http_scheme}://{}:{}", parsed.host, parsed.port))
    }
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
