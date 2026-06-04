#[cfg(feature = "browser-automation")]
mod cdp;

mod session;

use crate::computer_use::types::{
    BrowserActionParams, BrowserConnectParams, BrowserSessionInfo, BrowserSnapshotParams,
    BrowserSnapshotResult,
};

pub fn browser_automation_available() -> bool {
    cfg!(feature = "browser-automation")
}

pub fn browser_connect(params: BrowserConnectParams) -> Result<BrowserSessionInfo, String> {
    if !browser_automation_available() {
        return Err("Browser automation is not enabled in this build.".to_string());
    }
    session::connect(params)
}

pub fn browser_snapshot(params: BrowserSnapshotParams) -> Result<BrowserSnapshotResult, String> {
    if !browser_automation_available() {
        return Err("Browser automation is not enabled in this build.".to_string());
    }
    session::snapshot(params)
}

pub fn browser_action(params: BrowserActionParams) -> Result<serde_json::Value, String> {
    if !browser_automation_available() {
        return Err("Browser automation is not enabled in this build.".to_string());
    }
    session::action(params)
}

pub fn browser_disconnect() -> Result<(), String> {
    session::disconnect()
}
