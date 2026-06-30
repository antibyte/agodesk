use crate::ws::origin::canonical_host;
use crate::ws::types::{ClientErrorCode, ParsedWsUrl, TlsMode};
use chrono::Utc;
use native_tls::{Protocol, TlsConnector};
use sha2::{Digest, Sha256};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;
use url::Url;
use x509_parser::prelude::*;

pub fn parse_ws_url(raw: &str) -> Result<ParsedWsUrl, String> {
    let url = Url::parse(raw).map_err(|error| error.to_string())?;
    let scheme = url.scheme();
    if scheme != "ws" && scheme != "wss" {
        return Err("Only ws:// and wss:// URLs are supported.".to_string());
    }

    let host = canonical_host(
        url.host_str()
            .ok_or_else(|| "Missing host in server URL.".to_string())?,
    );
    let is_loopback = is_loopback_host(&host);
    let insecure_loopback_requested =
        is_loopback && url.query_pairs().any(|(k, v)| k == "insecure_loopback" && v == "1");

    let default_port = if scheme == "wss" { 443 } else { 80 };
    let port = url.port().unwrap_or(default_port);

    let mut origin = format!("{scheme}://{host}");
    if url.port().is_some() {
        origin = format!("{scheme}://{host}:{port}");
    }

    Ok(ParsedWsUrl {
        origin,
        host,
        port,
        is_loopback,
        insecure_loopback_requested,
    })
}

pub fn is_loopback_host(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]")
}

/// Private LAN, link-local, loopback, typical homelab hostnames, and Tailscale DNS.
pub fn is_homelab_host(host: &str) -> bool {
    if is_local_network_host(host) {
        return true;
    }

    let lower = host.trim().trim_end_matches('.').to_ascii_lowercase();
    lower.ends_with(".ts.net") || lower.ends_with(".tailscale.net")
}

/// Private LAN, link-local, loopback, and typical homelab hostnames.
pub fn is_local_network_host(host: &str) -> bool {
    if is_loopback_host(host) {
        return true;
    }

    let lower = host.trim().trim_end_matches('.').to_ascii_lowercase();
    if lower.ends_with(".local") || lower.ends_with(".localhost") || lower == "localhost" {
        return true;
    }

    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        return is_local_network_ip(ip);
    }

    false
}

pub fn is_local_network_ip(ip: std::net::IpAddr) -> bool {
    if ip.is_loopback() {
        return true;
    }
    match ip {
        std::net::IpAddr::V4(v4) => {
            if v4.is_private() {
                return true;
            }
            let octets = v4.octets();
            octets[0] == 169 && octets[1] == 254
        }
        std::net::IpAddr::V6(v6) => {
            if v6.is_loopback() {
                return true;
            }
            (v6.segments()[0] & 0xffc0) == 0xfe80 || (v6.segments()[0] & 0xfe00) == 0xfc00
        }
    }
}

pub fn determine_asset_tls_mode(host: &str, pinned_fingerprint: Option<&str>) -> TlsMode {
    if is_homelab_host(host) {
        if pinned_fingerprint.is_some() {
            return TlsMode::PinnedSelfSignedDev;
        }
        return TlsMode::InsecureLoopbackDev;
    }
    if pinned_fingerprint.is_some() {
        return TlsMode::PinnedSelfSignedDev;
    }
    TlsMode::System
}

pub fn append_insecure_loopback_if_needed(raw: &str) -> Result<String, String> {
    let parsed = parse_ws_url(raw)?;
    if !parsed.is_loopback {
        return Ok(raw.to_string());
    }
    if parsed.insecure_loopback_requested {
        return Ok(raw.to_string());
    }

    let mut url = Url::parse(raw).map_err(|error| error.to_string())?;
    url.query_pairs_mut()
        .append_pair("insecure_loopback", "1");
    Ok(url.to_string())
}

pub fn determine_tls_mode(
    parsed: &ParsedWsUrl,
    pinned_fingerprint: Option<&str>,
    explicit: Option<TlsMode>,
) -> TlsMode {
    if let Some(mode) = explicit {
        return mode;
    }
    if parsed.is_loopback && parsed.insecure_loopback_requested {
        return TlsMode::InsecureLoopbackDev;
    }
    if pinned_fingerprint.is_some() {
        return TlsMode::PinnedSelfSignedDev;
    }
    TlsMode::System
}

pub fn fingerprint_sha256_der(der: &[u8]) -> String {
    let digest = Sha256::digest(der);
    digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
        .to_uppercase()
}

pub struct ParsedCertificate {
    pub subject: String,
    pub issuer: String,
    pub not_before: String,
    pub not_after: String,
    pub san: Vec<String>,
    pub sha256_fingerprint: String,
}

fn parse_certificate_der_internal(
    der: &[u8],
    reject_expired: bool,
) -> Result<ParsedCertificate, String> {
    let (_, cert) = X509Certificate::from_der(der).map_err(|error| error.to_string())?;
    let subject = cert.subject().to_string();
    let issuer = cert.issuer().to_string();
    let not_before = cert.validity().not_before.to_rfc2822().unwrap_or_default();
    let not_after = cert.validity().not_after.to_rfc2822().unwrap_or_default();
    let san = cert
        .subject_alternative_name()
        .ok()
        .flatten()
        .map(|ext| {
            ext.value
                .general_names
                .iter()
                .filter_map(|name| match name {
                    GeneralName::DNSName(value) => Some(value.to_string()),
                    GeneralName::IPAddress(bytes) => Some(format_ip_san(bytes)),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default();

    if reject_expired && cert.validity().not_after.timestamp() < Utc::now().timestamp() {
        return Err(ClientErrorCode::CertificateExpired.as_str().to_string());
    }

    Ok(ParsedCertificate {
        sha256_fingerprint: fingerprint_sha256_der(der),
        subject,
        issuer,
        not_before,
        not_after,
        san,
    })
}

fn format_ip_san(bytes: &[u8]) -> String {
    if bytes.len() == 4 {
        return bytes
            .iter()
            .map(|byte| byte.to_string())
            .collect::<Vec<_>>()
            .join(".");
    }
    if bytes.len() == 16 {
        let parts: Vec<String> = bytes
            .chunks(2)
            .map(|chunk| {
                let value = u16::from_be_bytes([chunk[0], chunk.get(1).copied().unwrap_or(0)]);
                format!("{value:x}")
            })
            .collect();
        return parts.join(":");
    }
    bytes
        .iter()
        .map(|byte| byte.to_string())
        .collect::<Vec<_>>()
        .join(".")
}

pub fn tls_probe_host(host: &str) -> &str {
    if host.parse::<std::net::IpAddr>().is_ok() {
        return host;
    }
    host
}

pub fn tcp_connect(host: &str, port: u16) -> Result<TcpStream, String> {
    let address = format!("{host}:{port}");
    let mut last_error = "Unable to resolve host.".to_string();
    for addr in address
        .to_socket_addrs()
        .map_err(|error| error.to_string())?
    {
        match TcpStream::connect_timeout(&addr, Duration::from_secs(8)) {
            Ok(stream) => return Ok(stream),
            Err(error) => last_error = error.to_string(),
        }
    }
    Err(last_error)
}

fn probe_untrusted_certificate(
    host: &str,
    stream: TcpStream,
) -> Result<ParsedCertificate, String> {
    let connector = TlsConnector::builder()
        .min_protocol_version(Some(Protocol::Tlsv12))
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build()
        .map_err(|error| error.to_string())?;
    let tls_host = tls_probe_host(host);
    let tls = connector
        .connect(tls_host, stream)
        .map_err(|error| format!("TLS handshake failed for {host}:{error}"))?;
    let cert = tls
        .peer_certificate()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Server did not provide a certificate.".to_string())?;
    let der = cert.to_der().map_err(|error| error.to_string())?;
    parse_certificate_der_internal(&der, false)
}

fn probe_os_trust(host: &str, port: u16) -> bool {
    let Ok(stream) = tcp_connect(host, port) else {
        return false;
    };
    let Ok(system_connector) = TlsConnector::new() else {
        return false;
    };
    system_connector
        .connect(tls_probe_host(host), stream)
        .is_ok()
}

pub fn build_tls_connector(mode: &TlsMode) -> Result<TlsConnector, String> {
    let mut builder = TlsConnector::builder();
    builder.min_protocol_version(Some(Protocol::Tlsv12));
    match mode {
        TlsMode::System => builder.build().map_err(|error| error.to_string()),
        TlsMode::InsecureLoopbackDev => builder
            .danger_accept_invalid_certs(true)
            .danger_accept_invalid_hostnames(true)
            .build()
            .map_err(|error| error.to_string()),
        TlsMode::PinnedSelfSignedDev => builder
            .danger_accept_invalid_certs(true)
            .danger_accept_invalid_hostnames(true)
            .build()
            .map_err(|error| error.to_string()),
    }
}

pub fn verify_peer_fingerprint(
    der: &[u8],
    expected: &str,
    reject_expired: bool,
) -> Result<(), String> {
    let parsed = parse_certificate_der_internal(der, reject_expired)?;
    if !parsed
        .sha256_fingerprint
        .eq_ignore_ascii_case(expected)
    {
        return Err(ClientErrorCode::CertificatePinMismatch.as_str().to_string());
    }
    Ok(())
}

pub fn probe_with_fallback(
    host: &str,
    port: u16,
    origin: &str,
) -> Result<crate::ws::types::CertificateProbeResult, String> {
    let trusted_by_os = probe_os_trust(host, port);
    let stream = tcp_connect(host, port)?;
    let parsed = probe_untrusted_certificate(host, stream)?;
    let validation_error = if trusted_by_os {
        None
    } else {
        Some("Certificate is not trusted by the operating system.".to_string())
    };

    Ok(crate::ws::types::CertificateProbeResult {
        origin: origin.to_string(),
        subject: parsed.subject,
        issuer: parsed.issuer,
        not_before: parsed.not_before,
        not_after: parsed.not_after,
        san: parsed.san,
        sha256_fingerprint: parsed.sha256_fingerprint,
        trusted_by_os,
        validation_error,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_is_stable() {
        let der = b"test-certificate-bytes";
        assert_eq!(fingerprint_sha256_der(der), fingerprint_sha256_der(der));
        assert_eq!(fingerprint_sha256_der(der).len(), 64);
    }

    #[test]
    fn lan_ip_never_gets_insecure_loopback() {
        let url = "wss://192.168.6.238:8443/api/agodesk/ws";
        let parsed = parse_ws_url(url).unwrap();
        assert!(!parsed.is_loopback);
        assert!(!parsed.insecure_loopback_requested);
        assert_eq!(
            append_insecure_loopback_if_needed(url).unwrap(),
            url.to_string()
        );
    }

    #[test]
    fn determine_tls_mode_uses_pin_when_present() {
        let url = "wss://192.168.6.238:8443/api/agodesk/ws";
        let parsed = parse_ws_url(url).unwrap();
        let mode = determine_tls_mode(&parsed, Some("ABC123"), None);
        assert_eq!(mode, TlsMode::PinnedSelfSignedDev);
    }

    #[test]
    fn determine_tls_mode_defaults_to_system_for_lan() {
        let url = "wss://192.168.6.238:8443/api/agodesk/ws";
        let parsed = parse_ws_url(url).unwrap();
        let mode = determine_tls_mode(&parsed, None, None);
        assert_eq!(mode, TlsMode::System);
    }

    #[test]
    fn is_local_network_host_detects_lan_and_homelab_names() {
        assert!(is_local_network_host("192.168.1.10"));
        assert!(is_local_network_host("10.0.0.5"));
        assert!(is_local_network_host("172.16.0.2"));
        assert!(is_local_network_host("grafana.local"));
        assert!(is_local_network_host("127.0.0.1"));
        assert!(!is_local_network_host("example.com"));
    }

    #[test]
    fn determine_asset_tls_mode_allows_insecure_on_lan_without_pin() {
        assert_eq!(
            determine_asset_tls_mode("192.168.1.10", None),
            TlsMode::InsecureLoopbackDev
        );
    }

    #[test]
    fn is_homelab_host_includes_tailscale_dns() {
        assert!(is_homelab_host("aurago.taild1480.ts.net"));
        assert!(is_homelab_host("machine.tailscale.net"));
        assert!(!is_homelab_host("example.com"));
    }

    #[test]
    fn determine_asset_tls_mode_allows_insecure_on_tailscale_without_pin() {
        assert_eq!(
            determine_asset_tls_mode("aurago-manifest.taild1480.ts.net", None),
            TlsMode::InsecureLoopbackDev
        );
    }
}
