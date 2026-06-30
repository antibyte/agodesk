use crate::ws::origin::{
    canonical_host, canonical_http_origin, canonical_http_origin_from_url, canonical_ws_origin,
    trust_origin_aliases,
};
use crate::ws::types::{TrustedCertificateEntry, TrustedCertificateStore};
use std::collections::HashMap;
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

fn normalize_store_keys(store: &mut TrustedCertificateStore) {
    let mut merged: HashMap<String, TrustedCertificateEntry> = HashMap::new();

    for (key, entry) in store.trusted_certificates.drain() {
        let normalized_key = normalize_legacy_origin_key(&key).unwrap_or(key);
        merged
            .entry(normalized_key)
            .and_modify(|existing| {
                if entry.trusted_at > existing.trusted_at {
                    *existing = entry.clone();
                }
            })
            .or_insert(entry);
    }

    store.trusted_certificates = merged;
}

fn normalize_legacy_origin_key(key: &str) -> Option<String> {
    let url = Url::parse(key).ok()?;
    let scheme = url.scheme();
    if scheme == "wss" || scheme == "ws" {
        return canonical_ws_origin(key).ok();
    }
    if scheme == "https" || scheme == "http" {
        return canonical_http_origin_from_url(&url).ok();
    }
    None
}

pub fn load_store(app: &AppHandle) -> Result<TrustedCertificateStore, String> {
    let path = store_path(app)?;
    if !path.exists() {
        return Ok(TrustedCertificateStore::default());
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let mut store: TrustedCertificateStore =
        serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    normalize_store_keys(&mut store);
    Ok(store)
}

pub fn save_store(app: &AppHandle, store: &TrustedCertificateStore) -> Result<(), String> {
    let path = store_path(app)?;
    let raw = serde_json::to_string_pretty(store).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())
}

fn lookup_pinned_fingerprint_in_store(
    store: &TrustedCertificateStore,
    server_url: &str,
) -> Result<Option<String>, String> {
    let aliases = trust_origin_aliases(server_url)?;
    for alias in aliases {
        if let Some(entry) = store.trusted_certificates.get(&alias) {
            return Ok(Some(entry.sha256_fingerprint.clone()));
        }
    }
    Ok(None)
}

pub fn pinned_fingerprint_for_url(
    app: &AppHandle,
    server_url: &str,
) -> Result<Option<String>, String> {
    let store = load_store(app)?;
    lookup_pinned_fingerprint_in_store(&store, server_url)
}

pub fn pinned_fingerprint_for_http_url(
    app: &AppHandle,
    asset_url: &str,
) -> Result<Option<String>, String> {
    let url = Url::parse(asset_url).map_err(|error| error.to_string())?;
    let origin = canonical_http_origin_from_url(&url)?;
    let store = load_store(app)?;

    if let Some(entry) = store.trusted_certificates.get(&origin) {
        return Ok(Some(entry.sha256_fingerprint.clone()));
    }

    let host = url
        .host_str()
        .ok_or_else(|| "Missing host in asset URL.".to_string())?;
    let scheme = url.scheme();
    let ws_scheme = if scheme == "https" { "wss" } else { "ws" };
    let default_port = if scheme == "https" { 443 } else { 80 };
    let port = url.port().unwrap_or(default_port);
    let ws_origin = if port == default_port {
        format!("{ws_scheme}://{}", canonical_host(host))
    } else {
        format!("{ws_scheme}://{}:{port}", canonical_host(host))
    };

    Ok(store
        .trusted_certificates
        .get(&ws_origin)
        .map(|entry| entry.sha256_fingerprint.clone()))
}

pub fn http_origin_from_url(url: &Url) -> Result<String, String> {
    canonical_http_origin_from_url(url)
}

pub fn server_http_origin(server_url: &str) -> Result<String, String> {
    canonical_http_origin(server_url)
}

pub fn save_trusted_certificate(
    app: &AppHandle,
    origin: String,
    entry: TrustedCertificateEntry,
) -> Result<(), String> {
    let mut store = load_store(app)?;
    let keys = normalize_legacy_origin_key(&origin)
        .map(|normalized| vec![normalized])
        .unwrap_or_else(|| vec![origin.clone()]);

    for key in keys {
        store.trusted_certificates.insert(key, entry.clone());
    }
    save_store(app, &store)
}

pub fn save_trusted_certificate_for_server(
    app: &AppHandle,
    server_url: &str,
    entry: TrustedCertificateEntry,
) -> Result<(), String> {
    let mut store = load_store(app)?;
    let aliases = trust_origin_aliases(server_url)?;
    for alias in aliases {
        store.trusted_certificates.insert(alias, entry.clone());
    }
    save_store(app, &store)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lookup_finds_pin_saved_under_https_alias() {
        let mut store = TrustedCertificateStore::default();
        store.trusted_certificates.insert(
            "https://192.168.6.238:8443".to_string(),
            TrustedCertificateEntry {
                sha256_fingerprint: "ABC123".to_string(),
                trusted_at: "2026-01-01T00:00:00Z".to_string(),
                subject: "test".to_string(),
            },
        );

        let pin = lookup_pinned_fingerprint_in_store(
            &store,
            "wss://192.168.6.238:8443/api/agodesk/ws",
        )
        .expect("lookup")
        .expect("pin");

        assert_eq!(pin, "ABC123");
    }

    #[test]
    fn normalize_store_merges_legacy_ipv4_leading_zeros() {
        let mut store = TrustedCertificateStore::default();
        store.trusted_certificates.insert(
            "wss://192.168.006.238:8443".to_string(),
            TrustedCertificateEntry {
                sha256_fingerprint: "OLD".to_string(),
                trusted_at: "2026-01-01T00:00:00Z".to_string(),
                subject: "legacy".to_string(),
            },
        );
        store.trusted_certificates.insert(
            "wss://192.168.6.238:8443".to_string(),
            TrustedCertificateEntry {
                sha256_fingerprint: "NEW".to_string(),
                trusted_at: "2026-06-01T00:00:00Z".to_string(),
                subject: "canonical".to_string(),
            },
        );

        normalize_store_keys(&mut store);
        assert_eq!(store.trusted_certificates.len(), 1);
        assert_eq!(
            store
                .trusted_certificates
                .get("wss://192.168.6.238:8443")
                .map(|entry| entry.sha256_fingerprint.as_str()),
            Some("NEW")
        );
    }
}
