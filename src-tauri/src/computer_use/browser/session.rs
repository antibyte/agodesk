use crate::computer_use::types::{
    BrowserActionParams, BrowserConnectParams, BrowserSessionInfo, BrowserSnapshotParams,
    BrowserSnapshotResult,
};
use std::sync::{Mutex, OnceLock};

static ENDPOINT: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn endpoint_store() -> &'static Mutex<Option<String>> {
    ENDPOINT.get_or_init(|| Mutex::new(None))
}

pub fn connect(params: BrowserConnectParams) -> Result<BrowserSessionInfo, String> {
    let endpoint = params
        .endpoint
        .unwrap_or_else(|| "http://127.0.0.1:9222".to_string());
    let mut store = endpoint_store()
        .lock()
        .map_err(|_| "Browser session lock poisoned.".to_string())?;
    *store = Some(endpoint.clone());
    Ok(BrowserSessionInfo {
        connected: true,
        endpoint,
    })
}

pub fn snapshot(_params: BrowserSnapshotParams) -> Result<BrowserSnapshotResult, String> {
    let endpoint = current_endpoint()?;
    Ok(BrowserSnapshotResult {
        url: endpoint,
        title: "Browser automation pending CDP attach".to_string(),
        text: String::new(),
        html: None,
    })
}

pub fn action(params: BrowserActionParams) -> Result<serde_json::Value, String> {
    let _endpoint = current_endpoint()?;
    Ok(serde_json::json!({
        "action": params.action,
        "selector": params.selector,
        "success": true,
        "note": "Browser automation stub — enable `browser-automation` feature for CDP."
    }))
}

pub fn disconnect() -> Result<(), String> {
    let mut store = endpoint_store()
        .lock()
        .map_err(|_| "Browser session lock poisoned.".to_string())?;
    *store = None;
    Ok(())
}

fn current_endpoint() -> Result<String, String> {
    endpoint_store()
        .lock()
        .map_err(|_| "Browser session lock poisoned.".to_string())?
        .clone()
        .ok_or_else(|| "Browser is not connected.".to_string())
}

#[cfg(feature = "browser-automation")]
pub mod cdp_impl {
    use super::*;
    use crate::computer_use::types::BrowserConnectParams;

    pub async fn connect_async(params: BrowserConnectParams) -> Result<BrowserSessionInfo, String> {
        use chromiumoxide::browser::{Browser, BrowserConfig};

        let endpoint = params
            .endpoint
            .unwrap_or_else(|| "http://127.0.0.1:9222".to_string());
        let config = BrowserConfig::builder()
            .chrome_executable("/usr/bin/chromium")
            .build()
            .map_err(|error| error.to_string())?;
        let (_browser, _handler) = Browser::launch(config)
            .await
            .map_err(|error| format!("Failed to launch browser: {error}"))?;
        connect(BrowserConnectParams {
            endpoint: Some(endpoint.clone()),
        })
    }
}
