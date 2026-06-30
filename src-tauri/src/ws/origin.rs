use crate::ws::tls::parse_ws_url;
use url::Url;

/// Canonical host for TLS origin keys: lowercase DNS, normalized IP literals, bracketed IPv6.
pub fn canonical_host(host: &str) -> String {
    let trimmed = host.trim().trim_end_matches('.');
    if trimmed.is_empty() {
        return String::new();
    }

    let unbracketed = trimmed
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(trimmed);

    if let Ok(ip) = unbracketed.parse::<std::net::IpAddr>() {
        return match ip {
            std::net::IpAddr::V4(v4) => v4.to_string(),
            std::net::IpAddr::V6(v6) => format!("[{v6}]"),
        };
    }

    if let Some(normalized_ipv4) = normalize_ipv4_literal(unbracketed) {
        return normalized_ipv4;
    }

    trimmed.to_ascii_lowercase()
}

fn normalize_ipv4_literal(host: &str) -> Option<String> {
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() != 4 {
        return None;
    }

    let mut octets = Vec::with_capacity(4);
    for part in parts {
        let value = part.parse::<u16>().ok()?;
        if value > 255 {
            return None;
        }
        octets.push(value);
    }

    Some(format!(
        "{}.{}.{}.{}",
        octets[0], octets[1], octets[2], octets[3]
    ))
}

fn origin_with_scheme(scheme: &str, host: &str, port: u16, default_port: u16) -> String {
    let host = canonical_host(host);
    if port == default_port {
        format!("{scheme}://{host}")
    } else {
        format!("{scheme}://{host}:{port}")
    }
}

/// Canonical `wss://` / `ws://` origin for a server URL (path and query ignored).
pub fn canonical_ws_origin(server_url: &str) -> Result<String, String> {
    let parsed = parse_ws_url(server_url)?;
    let scheme = if parsed.origin.starts_with("wss://") {
        "wss"
    } else {
        "ws"
    };
    let default_port = if scheme == "wss" { 443 } else { 80 };
    Ok(origin_with_scheme(scheme, &parsed.host, parsed.port, default_port))
}

/// Canonical `https://` / `http://` origin for a server URL.
pub fn canonical_http_origin(server_url: &str) -> Result<String, String> {
    let parsed = parse_ws_url(server_url)?;
    let scheme = if parsed.origin.starts_with("wss://") {
        "https"
    } else {
        "http"
    };
    let default_port = if scheme == "https" { 443 } else { 80 };
    Ok(origin_with_scheme(scheme, &parsed.host, parsed.port, default_port))
}

pub fn canonical_http_origin_from_url(url: &Url) -> Result<String, String> {
    let scheme = url.scheme();
    let host = url
        .host_str()
        .ok_or_else(|| "Missing host in URL.".to_string())?;
    let http_scheme = match scheme {
        "wss" => "https",
        "ws" => "http",
        "https" | "http" => scheme,
        other => return Err(format!("Unsupported origin scheme: {other}")),
    };
    let default_port = if http_scheme == "https" { 443 } else { 80 };
    let port = url.port().unwrap_or(default_port);
    Ok(origin_with_scheme(http_scheme, host, port, default_port))
}

/// All origin keys that should share one pinned fingerprint for a server URL.
pub fn trust_origin_aliases(server_url: &str) -> Result<Vec<String>, String> {
    let ws = canonical_ws_origin(server_url)?;
    let http = canonical_http_origin(server_url)?;
    let mut aliases = vec![ws, http];
    aliases.sort();
    aliases.dedup();
    Ok(aliases)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_host_normalizes_ipv4_leading_zeros() {
        assert_eq!(canonical_host("192.168.006.238"), "192.168.6.238");
    }

    #[test]
    fn canonical_host_brackets_ipv6() {
        assert_eq!(canonical_host("::1"), "[::1]");
        assert_eq!(canonical_host("[::1]"), "[::1]");
    }

    #[test]
    fn canonical_host_lowercases_dns() {
        assert_eq!(canonical_host("AuraGo.LOCAL"), "aurago.local");
    }

    #[test]
    fn trust_aliases_include_wss_and_https_for_lan() {
        let url = "wss://192.168.6.238:8443/api/agodesk/ws";
        let aliases = trust_origin_aliases(url).expect("aliases");
        assert!(aliases.contains(&"wss://192.168.6.238:8443".to_string()));
        assert!(aliases.contains(&"https://192.168.6.238:8443".to_string()));
    }

    #[test]
    fn canonical_ws_origin_matches_leading_zero_ip_input() {
        let url = "wss://192.168.006.238:8443/api/agodesk/ws";
        assert_eq!(
            canonical_ws_origin(url).expect("origin"),
            "wss://192.168.6.238:8443"
        );
    }
}
