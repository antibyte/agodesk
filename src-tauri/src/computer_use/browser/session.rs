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

// Future work (when browser-automation feature + chromiumoxide is wired up):
// A real async CDP implementation lived here (cdp_impl with Browser::launch).
// It was never called from the sync browser_* fns and used a Linux-only hardcoded path.
// For now the module above provides only stubs (currently not even invoked from browser/mod.rs).

// The cdp.rs re-export and mod declaration were also unused scaffolding.
