use crate::ws::store::pinned_fingerprint_for_url;
use crate::ws::tls::{
    build_tls_connector, determine_tls_mode, is_loopback_host, parse_ws_url, tcp_connect,
    tls_probe_host, verify_peer_fingerprint,
};
use crate::ws::types::TlsMode;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::io::{Read, Write};
use tauri::AppHandle;
use url::Url;

const MAX_ASSET_BYTES: usize = 5 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedAsset {
    pub data_url: String,
    pub mime: String,
}

pub fn fetch_server_asset_impl(
    app: &AppHandle,
    server_url: &str,
    asset_url: &str,
) -> Result<FetchedAsset, String> {
    let asset = Url::parse(asset_url).map_err(|error| error.to_string())?;
    let host = asset
        .host_str()
        .ok_or_else(|| "Missing host in asset URL.".to_string())?;
    let port = asset
        .port()
        .unwrap_or(if asset.scheme() == "https" { 443 } else { 80 });
    let path = asset.path();
    let path_and_query = match asset.query() {
        Some(query) => format!("{path}?{query}"),
        None => path.to_string(),
    };

    let body = match asset.scheme() {
        "http" => fetch_plain_http(host, port, &path_and_query)?,
        "https" => {
            let parsed = parse_ws_url(server_url)?;
            let pinned = pinned_fingerprint_for_url(app, server_url)?;
            let tls_mode = determine_tls_mode(&parsed, pinned.as_deref(), None);
            fetch_https(
                host,
                port,
                &path_and_query,
                &tls_mode,
                pinned.as_deref(),
            )?
        }
        other => return Err(format!("Unsupported asset scheme: {other}")),
    };

    if body.is_empty() {
        return Err("Asset response was empty.".to_string());
    }
    if body.len() > MAX_ASSET_BYTES {
        return Err("Asset exceeds maximum size.".to_string());
    }

    let mime = guess_mime(path);
    let encoded = STANDARD.encode(body);
    Ok(FetchedAsset {
        data_url: format!("data:{mime};base64,{encoded}"),
        mime: mime.to_string(),
    })
}

fn guess_mime(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else {
        "application/octet-stream"
    }
}

fn fetch_plain_http(host: &str, port: u16, path_and_query: &str) -> Result<Vec<u8>, String> {
    let stream = tcp_connect(host, port)?;
    let mut stream = stream;
    write_http_get(&mut stream, host, port, path_and_query)?;
    read_http_body(&mut stream)
}

fn fetch_https(
    host: &str,
    port: u16,
    path_and_query: &str,
    tls_mode: &TlsMode,
    pinned: Option<&str>,
) -> Result<Vec<u8>, String> {
    if tls_mode == &TlsMode::InsecureLoopbackDev && !is_loopback_host(host) {
        return Err("insecure_loopback_dev is only allowed for localhost.".to_string());
    }

    let stream = tcp_connect(host, port)?;
    let connector = build_tls_connector(tls_mode)?;
    let mut tls = connector
        .connect(tls_probe_host(host), stream)
        .map_err(|error| error.to_string())?;

    if tls_mode == &TlsMode::PinnedSelfSignedDev {
        let expected = pinned.ok_or_else(|| "Missing certificate pin.".to_string())?;
        let cert = tls
            .peer_certificate()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "Server did not provide a certificate.".to_string())?;
        let der = cert.to_der().map_err(|error| error.to_string())?;
        verify_peer_fingerprint(&der, expected, true)?;
    }

    write_http_get(&mut tls, host, port, path_and_query)?;
    read_http_body(&mut tls)
}

fn write_http_get(
    stream: &mut (impl Read + Write),
    host: &str,
    port: u16,
    path_and_query: &str,
) -> Result<(), String> {
    let host_header = if port == 80 || port == 443 {
        host.to_string()
    } else {
        format!("{host}:{port}")
    };
    let request = format!(
        "GET {path_and_query} HTTP/1.1\r\nHost: {host_header}\r\nAccept: image/*,*/*\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())
}

fn read_http_body(stream: &mut impl Read) -> Result<Vec<u8>, String> {
    let mut raw = Vec::new();
    stream
        .read_to_end(&mut raw)
        .map_err(|error| error.to_string())?;
    parse_http_response(&raw)
}

fn parse_http_response(raw: &[u8]) -> Result<Vec<u8>, String> {
    let sep = raw
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| "Invalid HTTP response.".to_string())?;
    let header_text = std::str::from_utf8(&raw[..sep]).map_err(|error| error.to_string())?;
    let status_line = header_text
        .lines()
        .next()
        .ok_or_else(|| "Missing HTTP status line.".to_string())?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or_else(|| "Invalid HTTP status.".to_string())?;
    if status != 200 {
        return Err(format!("Asset request failed with HTTP {status}."));
    }

    let mut body = raw[sep + 4..].to_vec();
    if header_text
        .lines()
        .any(|line| line.trim().eq_ignore_ascii_case("transfer-encoding: chunked"))
    {
        body = decode_chunked_body(&body)?;
    }

    Ok(body)
}

fn decode_chunked_body(raw: &[u8]) -> Result<Vec<u8>, String> {
    let mut body = Vec::new();
    let mut cursor = 0usize;

    while cursor < raw.len() {
        let line_end = raw[cursor..]
            .iter()
            .position(|byte| *byte == b'\n')
            .ok_or_else(|| "Invalid chunked response.".to_string())?
            + cursor;
        let size_line = std::str::from_utf8(&raw[cursor..line_end])
            .map_err(|error| error.to_string())?
            .trim()
            .split(';')
            .next()
            .unwrap_or("")
            .trim();
        let chunk_size =
            usize::from_str_radix(size_line, 16).map_err(|_| "Invalid chunk size.".to_string())?;
        cursor = line_end + 1;
        if chunk_size == 0 {
            break;
        }
        if cursor + chunk_size > raw.len() {
            return Err("Truncated chunked response.".to_string());
        }
        body.extend_from_slice(&raw[cursor..cursor + chunk_size]);
        cursor += chunk_size + 2;
    }

    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_http_response_reads_body() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 5\r\n\r\nhello";
        assert_eq!(parse_http_response(raw).unwrap(), b"hello");
    }

    #[test]
    fn parse_http_response_rejects_non_200() {
        let raw = b"HTTP/1.1 404 Not Found\r\n\r\nmissing";
        assert!(parse_http_response(raw).is_err());
    }
}
