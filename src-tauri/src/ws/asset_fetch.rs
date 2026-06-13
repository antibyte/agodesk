use crate::ws::store::{
    http_origin_from_url, pinned_fingerprint_for_http_url, pinned_fingerprint_for_url,
    server_http_origin,
};
use crate::ws::tls::{
    build_tls_connector, determine_asset_tls_mode, is_homelab_host, is_loopback_host, tcp_connect,
    tls_probe_host, verify_peer_fingerprint,
};
use crate::ws::types::TlsMode;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use serde::Deserialize;
use std::io::{Read, Write};
use tauri::AppHandle;
use url::Url;

const MAX_ASSET_BYTES: usize = 5 * 1024 * 1024;
const MAX_HTTP_REDIRECTS: usize = 5;

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
    pinned_fingerprint_override: Option<&str>,
    _device_id: Option<&str>,
    _session_id: Option<&str>,
) -> Result<FetchedAsset, String> {
    let asset = Url::parse(asset_url).map_err(|error| error.to_string())?;

    let mut current_url = asset;
    let mut redirects = 0usize;
    let response = loop {
        let host = current_url
            .host_str()
            .ok_or_else(|| "Missing host in asset URL.".to_string())?;
        let port = current_url.port().unwrap_or(if current_url.scheme() == "https" {
            443
        } else {
            80
        });
        let path = current_url.path();
        let path_and_query = match current_url.query() {
            Some(query) => format!("{path}?{query}"),
            None => path.to_string(),
        };

        let pinned = pinned_fingerprint_override
            .map(str::to_string)
            .or(pinned_fingerprint_for_http_url(app, current_url.as_str())?)
            .or_else(|| {
                let asset_origin = http_origin_from_url(&current_url).ok()?;
                let server_origin = server_http_origin(server_url).ok()?;
                if asset_origin == server_origin {
                    return pinned_fingerprint_for_url(app, server_url).ok().flatten();
                }
                None
            });
        let tls_mode = determine_asset_tls_mode(host, pinned.as_deref());

        let fetch_result = match current_url.scheme() {
            "http" => fetch_plain_http(host, port, &path_and_query),
            "https" => fetch_https(
                host,
                port,
                &path_and_query,
                &tls_mode,
                pinned.as_deref(),
            ),
            other => return Err(format!("Unsupported asset scheme: {other}")),
        };

        match fetch_result {
            Ok(response) => break response,
            Err(FetchError::Redirect { status, location }) => {
                if redirects >= MAX_HTTP_REDIRECTS {
                    return Err(format!(
                        "Too many redirects while fetching asset (last HTTP {status})."
                    ));
                }
                current_url = resolve_redirect_url(&current_url, &location)?;
                redirects += 1;
            }
            Err(FetchError::Failed(message)) => {
                return Err(format!("{message} ({current_url})"));
            }
        }
    };

    if response.body.is_empty() {
        return Err("Asset response was empty.".to_string());
    }
    if response.body.len() > MAX_ASSET_BYTES {
        return Err("Asset exceeds maximum size.".to_string());
    }

    validate_asset_body(current_url.path(), response.content_type.as_deref(), &response.body)?;

    let mime = resolve_asset_mime(
        current_url.path(),
        response.content_type.as_deref(),
    );
    let encoded = STANDARD.encode(&response.body);
    Ok(FetchedAsset {
        data_url: format!("data:{mime};base64,{encoded}"),
        mime: mime.to_string(),
    })
}

#[derive(Debug)]
struct HttpResponse {
    body: Vec<u8>,
    content_type: Option<String>,
}

#[derive(Debug)]
enum FetchError {
    Redirect { status: u16, location: String },
    Failed(String),
}

fn validate_asset_body(
    path: &str,
    content_type: Option<&str>,
    body: &[u8],
) -> Result<(), String> {
    if body.starts_with(b"<!DOCTYPE")
        || body.starts_with(b"<!doctype")
        || body.starts_with(b"<html")
        || body.starts_with(b"<HTML")
    {
        return Err("Asset response looks like HTML, not media.".to_string());
    }
    if body.starts_with(&[0x1f, 0x8b]) {
        return Err("Asset response is gzip-compressed.".to_string());
    }

    let path_lower = path.to_ascii_lowercase();
    let content_lower = content_type.map(str::to_ascii_lowercase);
    let expects_audio = path_lower.ends_with(".mp3")
        || path_lower.ends_with(".wav")
        || path_lower.ends_with(".ogg")
        || path_lower.ends_with(".opus")
        || path_lower.ends_with(".m4a")
        || path_lower.ends_with(".aac")
        || path_lower.ends_with(".webm")
        || content_lower
            .as_deref()
            .is_some_and(|value| value.starts_with("audio/"));
    let expects_image = path_lower.ends_with(".png")
        || path_lower.ends_with(".jpg")
        || path_lower.ends_with(".jpeg")
        || path_lower.ends_with(".webp")
        || path_lower.ends_with(".gif")
        || path_lower.ends_with(".ico")
        || path_lower.ends_with(".svg")
        || content_lower
            .as_deref()
            .is_some_and(|value| value.starts_with("image/"));

    if expects_audio {
        return validate_audio_magic(body);
    }
    if expects_image {
        return validate_image_magic(body);
    }
    if is_valid_audio_magic(body) || is_valid_image_magic(body) {
        return Ok(());
    }
    Err("Asset response is not a recognized media file.".to_string())
}

fn is_valid_audio_magic(body: &[u8]) -> bool {
    validate_audio_magic(body).is_ok()
}

fn is_valid_image_magic(body: &[u8]) -> bool {
    validate_image_magic(body).is_ok()
}

fn validate_audio_magic(body: &[u8]) -> Result<(), String> {
    if body.starts_with(b"ID3") {
        return Ok(());
    }
    if body.len() >= 2 && body[0] == 0xff && (body[1] & 0xe0) == 0xe0 {
        return Ok(());
    }
    if body.starts_with(b"RIFF") && body.len() >= 12 && &body[8..12] == b"WAVE" {
        return Ok(());
    }
    if body.starts_with(b"OggS") {
        return Ok(());
    }
    if body.starts_with(b"fLaC") {
        return Ok(());
    }
    Err("Asset response is not a recognized audio file.".to_string())
}

fn validate_image_magic(body: &[u8]) -> Result<(), String> {
    if body.starts_with(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Ok(());
    }
    if body.len() >= 3 && body[0] == 0xff && body[1] == 0xd8 && body[2] == 0xff {
        return Ok(());
    }
    if body.starts_with(b"GIF87a") || body.starts_with(b"GIF89a") {
        return Ok(());
    }
    if body.starts_with(b"RIFF") && body.len() >= 12 && &body[8..12] == b"WEBP" {
        return Ok(());
    }
    if body.starts_with(b"<svg") || body.starts_with(b"<?xml") {
        return Ok(());
    }
    if body.len() >= 4 && body[0..4] == [0x00, 0x00, 0x01, 0x00] {
        return Ok(());
    }
    Err("Asset response is not a recognized image file.".to_string())
}

fn resolve_asset_mime(path: &str, content_type: Option<&str>) -> &'static str {
    if let Some(content_type) = content_type {
        let lower = content_type.to_ascii_lowercase();
        if lower.starts_with("audio/") || lower.starts_with("image/") {
            return match lower.as_str() {
                "audio/mpeg" | "audio/mp3" => "audio/mpeg",
                "audio/wav" | "audio/x-wav" => "audio/wav",
                "audio/ogg" => "audio/ogg",
                "audio/webm" => "audio/webm",
                "audio/mp4" | "audio/aac" => "audio/mp4",
                "image/png" => "image/png",
                "image/jpeg" => "image/jpeg",
                "image/webp" => "image/webp",
                "image/gif" => "image/gif",
                "image/svg+xml" => "image/svg+xml",
                _ => guess_mime(path),
            };
        }
    }
    guess_mime(path)
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
    } else if lower.ends_with(".ico") {
        "image/x-icon"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".mp3") {
        "audio/mpeg"
    } else if lower.ends_with(".wav") {
        "audio/wav"
    } else if lower.ends_with(".ogg") || lower.ends_with(".opus") {
        "audio/ogg"
    } else if lower.ends_with(".webm") {
        "audio/webm"
    } else if lower.ends_with(".m4a") || lower.ends_with(".aac") {
        "audio/mp4"
    } else {
        "application/octet-stream"
    }
}

fn extract_header_value(header_text: &str, header_name: &str) -> Option<String> {
    header_text.lines().skip(1).find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.trim().eq_ignore_ascii_case(header_name) {
            Some(value.trim().to_string())
        } else {
            None
        }
    })
}

fn extract_content_type(header_text: &str) -> Option<String> {
    extract_header_value(header_text, "content-type").map(|value| {
        value
            .split(';')
            .next()
            .unwrap_or(value.as_str())
            .trim()
            .to_string()
    })
}

fn resolve_redirect_url(base: &Url, location: &str) -> Result<Url, String> {
    Url::parse(location)
        .or_else(|_| base.join(location))
        .map_err(|error| format!("Invalid redirect location: {error}"))
}

fn resolve_server_asset_url(server_url: &str, asset_url: &str) -> Result<Url, String> {
    let trimmed = asset_url.trim();
    if trimmed.is_empty() {
        return Err("Asset URL is empty.".to_string());
    }
    if let Ok(url) = Url::parse(trimmed) {
        if url.scheme() == "http" || url.scheme() == "https" {
            return Ok(url);
        }
    }
    let origin = server_http_origin(server_url)?;
    let base = Url::parse(&origin).map_err(|error| error.to_string())?;
    resolve_redirect_url(&base, trimmed)
}

fn fetch_plain_http(
    host: &str,
    port: u16,
    path_and_query: &str,
) -> Result<HttpResponse, FetchError> {
    let stream = tcp_connect(host, port).map_err(FetchError::Failed)?;
    let mut stream = stream;
    write_http_get(&mut stream, host, port, path_and_query).map_err(FetchError::Failed)?;
    read_http_body(&mut stream)
}

fn fetch_https(
    host: &str,
    port: u16,
    path_and_query: &str,
    tls_mode: &TlsMode,
    pinned: Option<&str>,
) -> Result<HttpResponse, FetchError> {
    if tls_mode == &TlsMode::InsecureLoopbackDev
        && !is_loopback_host(host)
        && !is_homelab_host(host)
    {
        return Err(FetchError::Failed(
            "Insecure TLS is only allowed for local network hosts.".to_string(),
        ));
    }

    let stream = tcp_connect(host, port).map_err(FetchError::Failed)?;
    let connector = build_tls_connector(tls_mode).map_err(FetchError::Failed)?;
    let mut tls = connector
        .connect(tls_probe_host(host), stream)
        .map_err(|error| FetchError::Failed(error.to_string()))?;

    if tls_mode == &TlsMode::PinnedSelfSignedDev {
        let expected = pinned.ok_or_else(|| {
            FetchError::Failed("Missing certificate pin.".to_string())
        })?;
        let cert = tls
            .peer_certificate()
            .map_err(|error| FetchError::Failed(error.to_string()))?
            .ok_or_else(|| {
                FetchError::Failed("Server did not provide a certificate.".to_string())
            })?;
        let der = cert.to_der().map_err(|error| FetchError::Failed(error.to_string()))?;
        verify_peer_fingerprint(&der, expected, true).map_err(FetchError::Failed)?;
    }

    write_http_get(&mut tls, host, port, path_and_query).map_err(FetchError::Failed)?;
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
        "GET {path_and_query} HTTP/1.1\r\nHost: {host_header}\r\nAccept: */*\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())
}

fn read_http_body(stream: &mut impl Read) -> Result<HttpResponse, FetchError> {
    let mut raw = Vec::new();
    stream
        .read_to_end(&mut raw)
        .map_err(|error| FetchError::Failed(error.to_string()))?;
    parse_http_response(&raw)
}

fn parse_http_response(raw: &[u8]) -> Result<HttpResponse, FetchError> {
    let sep = raw
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| FetchError::Failed("Invalid HTTP response.".to_string()))?;
    let header_text = std::str::from_utf8(&raw[..sep])
        .map_err(|error| FetchError::Failed(error.to_string()))?;
    let status_line = header_text
        .lines()
        .next()
        .ok_or_else(|| FetchError::Failed("Missing HTTP status line.".to_string()))?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or_else(|| FetchError::Failed("Invalid HTTP status.".to_string()))?;
    if (300..400).contains(&status) {
        let location = extract_header_value(header_text, "location").ok_or_else(|| {
            FetchError::Failed(format!("Asset request failed with HTTP {status}."))
        })?;
        return Err(FetchError::Redirect { status, location });
    }
    if status != 200 {
        return Err(FetchError::Failed(format!(
            "Asset request failed with HTTP {status}."
        )));
    }

    let mut body = raw[sep + 4..].to_vec();
    if header_text
        .lines()
        .any(|line| line.trim().eq_ignore_ascii_case("transfer-encoding: chunked"))
    {
        body = decode_chunked_body(&body).map_err(FetchError::Failed)?;
    }

    Ok(HttpResponse {
        body,
        content_type: extract_content_type(header_text),
    })
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

const MAX_UPLOAD_BYTES: usize = 25 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
struct UploadResponseJson {
    attachment_id: Option<String>,
    status: Option<String>,
    path: Option<String>,
    mime_type: Option<String>,
    size_bytes: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedAttachment {
    pub attachment_id: String,
    pub status: Option<String>,
    pub path: Option<String>,
    pub mime_type: Option<String>,
    pub size_bytes: Option<u64>,
}

#[allow(clippy::too_many_arguments)]
pub fn upload_chat_attachment_impl(
    app: &AppHandle,
    server_url: &str,
    upload_url: &str,
    filename: &str,
    mime_type: &str,
    body: &[u8],
    upload_field: &str,
    pinned_fingerprint_override: Option<&str>,
) -> Result<UploadedAttachment, String> {
    if body.is_empty() {
        return Err("Upload body is empty.".to_string());
    }
    if body.len() > MAX_UPLOAD_BYTES {
        return Err("Upload exceeds maximum size.".to_string());
    }

    let asset = resolve_server_asset_url(server_url, upload_url)?;
    let resolved_upload_url = asset.as_str();
    let host = asset
        .host_str()
        .ok_or_else(|| "Missing host in upload URL.".to_string())?;
    let port = asset.port().unwrap_or(if asset.scheme() == "https" {
        443
    } else {
        80
    });
    let path = asset.path();
    let path_and_query = match asset.query() {
        Some(query) => format!("{path}?{query}"),
        None => path.to_string(),
    };

    let pinned = pinned_fingerprint_override
        .map(str::to_string)
        .or(pinned_fingerprint_for_http_url(app, resolved_upload_url)
            .ok()
            .flatten())
        .or_else(|| {
            let upload_origin = http_origin_from_url(&asset).ok()?;
            let server_origin = server_http_origin(server_url).ok()?;
            if upload_origin == server_origin {
                return pinned_fingerprint_for_url(app, server_url).ok().flatten();
            }
            None
        });
    let tls_mode = determine_asset_tls_mode(host, pinned.as_deref());

    let response = match asset.scheme() {
        "http" => post_plain_http_multipart(
            host,
            port,
            &path_and_query,
            upload_field,
            filename,
            mime_type,
            body,
        ),
        "https" => post_https_multipart(
            host,
            port,
            &path_and_query,
            upload_field,
            filename,
            mime_type,
            body,
            &tls_mode,
            pinned.as_deref(),
        ),
        other => return Err(format!("Unsupported upload scheme: {other}")),
    }
    .map_err(|error| match error {
        FetchError::Redirect { status, .. } => {
            format!("Upload request failed with HTTP {status} redirect.")
        }
        FetchError::Failed(message) => message,
    })?;

    let attachment_id_from_path = path
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|segment| !segment.is_empty())
        .map(str::to_string);

    if let Ok(parsed) = serde_json::from_slice::<UploadResponseJson>(&response.body) {
        let attachment_id = parsed
            .attachment_id
            .or(attachment_id_from_path)
            .ok_or_else(|| "Upload response missing attachment_id.".to_string())?;
        return Ok(UploadedAttachment {
            attachment_id,
            status: parsed.status,
            path: parsed.path,
            mime_type: parsed.mime_type.or_else(|| Some(mime_type.to_string())),
            size_bytes: parsed.size_bytes.or(Some(body.len() as u64)),
        });
    }

    Ok(UploadedAttachment {
        attachment_id: attachment_id_from_path
            .ok_or_else(|| "Upload response missing attachment_id.".to_string())?,
        status: Some("ready".to_string()),
        path: None,
        mime_type: Some(mime_type.to_string()),
        size_bytes: Some(body.len() as u64),
    })
}

fn post_plain_http_multipart(
    host: &str,
    port: u16,
    path_and_query: &str,
    field_name: &str,
    filename: &str,
    mime_type: &str,
    body: &[u8],
) -> Result<HttpResponse, FetchError> {
    let stream = tcp_connect(host, port).map_err(FetchError::Failed)?;
    let mut stream = stream;
    write_http_post_multipart(
        &mut stream,
        host,
        port,
        path_and_query,
        field_name,
        filename,
        mime_type,
        body,
    )
    .map_err(FetchError::Failed)?;
    read_http_upload_body(&mut stream)
}

#[allow(clippy::too_many_arguments)]
fn post_https_multipart(
    host: &str,
    port: u16,
    path_and_query: &str,
    field_name: &str,
    filename: &str,
    mime_type: &str,
    body: &[u8],
    tls_mode: &TlsMode,
    pinned: Option<&str>,
) -> Result<HttpResponse, FetchError> {
    if tls_mode == &TlsMode::InsecureLoopbackDev
        && !is_loopback_host(host)
        && !is_homelab_host(host)
    {
        return Err(FetchError::Failed(
            "Insecure TLS is only allowed for local network hosts.".to_string(),
        ));
    }

    let stream = tcp_connect(host, port).map_err(FetchError::Failed)?;
    let connector = build_tls_connector(tls_mode).map_err(FetchError::Failed)?;
    let mut tls = connector
        .connect(tls_probe_host(host), stream)
        .map_err(|error| FetchError::Failed(error.to_string()))?;

    if tls_mode == &TlsMode::PinnedSelfSignedDev {
        let expected = pinned.ok_or_else(|| {
            FetchError::Failed("Missing certificate pin.".to_string())
        })?;
        let cert = tls
            .peer_certificate()
            .map_err(|error| FetchError::Failed(error.to_string()))?
            .ok_or_else(|| {
                FetchError::Failed("Server did not provide a certificate.".to_string())
            })?;
        let der = cert.to_der().map_err(|error| FetchError::Failed(error.to_string()))?;
        verify_peer_fingerprint(&der, expected, true).map_err(FetchError::Failed)?;
    }

    write_http_post_multipart(
        &mut tls,
        host,
        port,
        path_and_query,
        field_name,
        filename,
        mime_type,
        body,
    )
    .map_err(FetchError::Failed)?;
    read_http_upload_body(&mut tls)
}

#[allow(clippy::too_many_arguments)]
fn write_http_post_multipart(
    stream: &mut (impl Read + Write),
    host: &str,
    port: u16,
    path_and_query: &str,
    field_name: &str,
    filename: &str,
    mime_type: &str,
    body: &[u8],
) -> Result<(), String> {
    let boundary = format!(
        "----agodesk{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default()
    );
    let mut payload = Vec::new();
    payload.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    payload.extend_from_slice(
        format!(
            "Content-Disposition: form-data; name=\"{field_name}\"; filename=\"{filename}\"\r\n"
        )
        .as_bytes(),
    );
    payload.extend_from_slice(format!("Content-Type: {mime_type}\r\n\r\n").as_bytes());
    payload.extend_from_slice(body);
    payload.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

    let host_header = if port == 80 || port == 443 {
        host.to_string()
    } else {
        format!("{host}:{port}")
    };
    let request = format!(
        "POST {path_and_query} HTTP/1.1\r\nHost: {host_header}\r\nContent-Type: multipart/form-data; boundary={boundary}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        payload.len()
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())?;
    stream
        .write_all(&payload)
        .map_err(|error| error.to_string())
}

fn read_http_upload_body(stream: &mut impl Read) -> Result<HttpResponse, FetchError> {
    let mut raw = Vec::new();
    stream
        .read_to_end(&mut raw)
        .map_err(|error| FetchError::Failed(error.to_string()))?;
    parse_http_upload_response(&raw)
}

fn parse_http_upload_response(raw: &[u8]) -> Result<HttpResponse, FetchError> {
    let sep = raw
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| FetchError::Failed("Invalid HTTP response.".to_string()))?;
    let header_text = std::str::from_utf8(&raw[..sep])
        .map_err(|error| FetchError::Failed(error.to_string()))?;
    let status_line = header_text
        .lines()
        .next()
        .ok_or_else(|| FetchError::Failed("Missing HTTP status line.".to_string()))?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or_else(|| FetchError::Failed("Invalid HTTP status.".to_string()))?;
    if (300..400).contains(&status) {
        let location = extract_header_value(header_text, "location").ok_or_else(|| {
            FetchError::Failed(format!("Upload request failed with HTTP {status}."))
        })?;
        return Err(FetchError::Redirect { status, location });
    }
    if status != 200 && status != 201 {
        return Err(FetchError::Failed(format!(
            "Upload request failed with HTTP {status}."
        )));
    }

    let mut body = raw[sep + 4..].to_vec();
    if header_text
        .lines()
        .any(|line| line.trim().eq_ignore_ascii_case("transfer-encoding: chunked"))
    {
        body = decode_chunked_body(&body).map_err(FetchError::Failed)?;
    }

    Ok(HttpResponse {
        body,
        content_type: extract_content_type(header_text),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_http_response_reads_body() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 5\r\n\r\nhello";
        let response = parse_http_response(raw).unwrap();
        assert_eq!(response.body, b"hello");
        assert_eq!(response.content_type.as_deref(), Some("image/png"));
    }

    #[test]
    fn guess_mime_maps_mp3_to_audio_mpeg() {
        assert_eq!(guess_mime("/tts/a.mp3"), "audio/mpeg");
    }

    #[test]
    fn parse_http_response_rejects_non_200() {
        let raw = b"HTTP/1.1 404 Not Found\r\n\r\nmissing";
        assert!(matches!(
            parse_http_response(raw),
            Err(FetchError::Failed(message)) if message.contains("HTTP 404")
        ));
    }

    #[test]
    fn parse_http_response_returns_redirect_location() {
        let raw = b"HTTP/1.1 307 Temporary Redirect\r\nLocation: /static/tts/a.mp3\r\n\r\n";
        match parse_http_response(raw) {
            Err(FetchError::Redirect { status, location }) => {
                assert_eq!(status, 307);
                assert_eq!(location, "/static/tts/a.mp3");
            }
            other => panic!("expected redirect, got {other:?}"),
        }
    }

    #[test]
    fn validate_asset_body_accepts_mp3_id3() {
        assert!(validate_asset_body("/tts/a.mp3", Some("audio/mpeg"), b"ID3\x04").is_ok());
    }

    #[test]
    fn validate_asset_body_accepts_png() {
        assert!(validate_asset_body(
            "/img/personas/punk.png",
            Some("image/png"),
            &[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00],
        )
        .is_ok());
    }

    #[test]
    fn validate_asset_body_accepts_ico() {
        assert!(validate_asset_body(
            "/favicon.ico",
            Some("image/x-icon"),
            &[0x00, 0x00, 0x01, 0x00, 0x01, 0x00],
        )
        .is_ok());
    }

    #[test]
    fn validate_asset_body_rejects_html() {
        assert!(validate_asset_body("/tts/a.mp3", None, b"<!DOCTYPE html>").is_err());
    }

    #[test]
    fn resolve_redirect_url_supports_relative_paths() {
        let base = Url::parse("https://example.com/tts/a.mp3").unwrap();
        let resolved = resolve_redirect_url(&base, "/static/tts/a.mp3").unwrap();
        assert_eq!(resolved.as_str(), "https://example.com/static/tts/a.mp3");
    }

    #[test]
    fn resolve_server_asset_url_supports_relative_upload_paths() {
        let resolved = resolve_server_asset_url(
            "wss://aurago.local:8443/api/agodesk/ws",
            "/api/agodesk/media/upload/att-1?agodesk_exp=1&agodesk_sig=abc",
        )
        .unwrap();
        assert_eq!(
            resolved.as_str(),
            "https://aurago.local:8443/api/agodesk/media/upload/att-1?agodesk_exp=1&agodesk_sig=abc",
        );
    }
}
