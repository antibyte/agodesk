use crate::computer_use::types::BrowserConnectParams;

pub const BROWSER_UNAVAILABLE: &str = "DESKTOP_BROWSER_UNAVAILABLE";
pub const ELEMENT_NOT_FOUND: &str = "DESKTOP_ELEMENT_NOT_FOUND";
pub const INPUT_NOT_APPROVED: &str = "DESKTOP_INPUT_NOT_APPROVED";

const DEFAULT_PORT: u16 = 9222;

#[derive(Debug, Clone)]
pub struct ConnectPlan {
    pub endpoint: String,
    pub port: u16,
    pub auto_launch: bool,
    pub url: Option<String>,
}

pub fn resolve_connect(params: &BrowserConnectParams) -> Result<ConnectPlan, String> {
    let auto_launch = params.auto_launch.unwrap_or(true);
    let port = params.port.unwrap_or(DEFAULT_PORT);
    let endpoint = if let Some(ep) = params
        .endpoint
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        normalize_endpoint(ep)?
    } else {
        format!("http://127.0.0.1:{port}")
    };
    validate_loopback(&endpoint)?;
    Ok(ConnectPlan {
        endpoint,
        port,
        auto_launch,
        url: params.url.clone(),
    })
}

fn normalize_endpoint(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(format!("{BROWSER_UNAVAILABLE}: Endpoint is empty."));
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Ok(trimmed.to_string());
    }
    if trimmed.starts_with("ws://") || trimmed.starts_with("wss://") {
        return Ok(trimmed.to_string());
    }
    Ok(format!("http://{trimmed}"))
}

pub fn validate_loopback(endpoint: &str) -> Result<(), String> {
    let parsed = url::Url::parse(endpoint)
        .map_err(|_| format!("{BROWSER_UNAVAILABLE}: Invalid browser endpoint URL."))?;
    match parsed.host_str() {
        Some("127.0.0.1") | Some("localhost") | Some("[::1]") => Ok(()),
        Some(_) => Err(format!(
            "{BROWSER_UNAVAILABLE}: Browser endpoints must use loopback (127.0.0.1, localhost, or ::1)."
        )),
        None => Err(format!(
            "{BROWSER_UNAVAILABLE}: Browser endpoint must include a loopback host."
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_port_when_only_auto_launch() {
        let plan = resolve_connect(&BrowserConnectParams {
            endpoint: None,
            port: None,
            auto_launch: Some(true),
            url: None,
        })
        .expect("plan");
        assert_eq!(plan.endpoint, "http://127.0.0.1:9222");
        assert_eq!(plan.port, 9222);
        assert!(plan.auto_launch);
    }

    #[test]
    fn port_override_builds_loopback_endpoint() {
        let plan = resolve_connect(&BrowserConnectParams {
            endpoint: None,
            port: Some(9333),
            auto_launch: None,
            url: None,
        })
        .expect("plan");
        assert_eq!(plan.endpoint, "http://127.0.0.1:9333");
    }

    #[test]
    fn rejects_remote_host() {
        let err = resolve_connect(&BrowserConnectParams {
            endpoint: Some("http://192.168.1.1:9222".to_string()),
            port: None,
            auto_launch: None,
            url: None,
        })
        .unwrap_err();
        assert!(err.starts_with(BROWSER_UNAVAILABLE));
    }

    #[test]
    fn accepts_localhost() {
        validate_loopback("http://localhost:9222").expect("localhost");
        validate_loopback("http://127.0.0.1:9222").expect("ipv4");
        validate_loopback("http://[::1]:9222").expect("ipv6");
    }
}
