// Note: Real browser automation via CDP (chromiumoxide) is not yet implemented.
// The feature flag + dep in Cargo.toml and some skeleton code remain for future work.
// All browser_* commands currently return a clear "not implemented" error so that
// higher-level desktop_browser_* operations fail gracefully instead of faking success.

#[allow(dead_code)]
mod session;

use crate::computer_use::types::{
    BrowserActionParams, BrowserConnectParams, BrowserSessionInfo, BrowserSnapshotParams,
    BrowserSnapshotResult,
};

#[allow(dead_code)]
pub fn browser_automation_available() -> bool {
    // Always false for now (real impl pending). Kept for potential future use.
    false
}

const NOT_IMPLEMENTED: &str =
    "Browser automation via Chrome/Edge DevTools Protocol (CDP) is not implemented yet.";

pub fn browser_connect(_params: BrowserConnectParams) -> Result<BrowserSessionInfo, String> {
    Err(NOT_IMPLEMENTED.to_string())
}

pub fn browser_snapshot(_params: BrowserSnapshotParams) -> Result<BrowserSnapshotResult, String> {
    Err(NOT_IMPLEMENTED.to_string())
}

pub fn browser_action(_params: BrowserActionParams) -> Result<serde_json::Value, String> {
    Err(NOT_IMPLEMENTED.to_string())
}

pub fn browser_disconnect() -> Result<(), String> {
    Err(NOT_IMPLEMENTED.to_string())
}
