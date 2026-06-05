mod endpoint;
#[cfg(feature = "browser-automation")]
mod cdp;
#[cfg(feature = "browser-automation")]
mod launch;
mod state;

pub use state::BrowserState;

use crate::computer_use::types::{
    BrowserActionParams, BrowserConnectParams, BrowserSessionInfo, BrowserSnapshotParams,
    BrowserSnapshotResult, BrowserTabListResult,
};

use endpoint::resolve_connect;

pub fn browser_automation_available() -> bool {
    cfg!(feature = "browser-automation")
}

#[cfg(feature = "browser-automation")]
pub async fn connect(
    state: &BrowserState,
    params: BrowserConnectParams,
) -> Result<BrowserSessionInfo, String> {
    let plan = resolve_connect(&params)?;
    cdp::connect(state, plan).await
}

#[cfg(not(feature = "browser-automation"))]
pub async fn connect(
    _state: &BrowserState,
    _params: BrowserConnectParams,
) -> Result<BrowserSessionInfo, String> {
    Err(format!(
        "{BROWSER_UNAVAILABLE}: Browser automation is not compiled into this build."
    ))
}

#[cfg(feature = "browser-automation")]
pub async fn list_tabs(state: &BrowserState) -> Result<BrowserTabListResult, String> {
    cdp::list_tabs(state).await
}

#[cfg(not(feature = "browser-automation"))]
pub async fn list_tabs(_state: &BrowserState) -> Result<BrowserTabListResult, String> {
    Err(format!(
        "{BROWSER_UNAVAILABLE}: Browser automation is not compiled into this build."
    ))
}

#[cfg(feature = "browser-automation")]
pub async fn snapshot(
    state: &BrowserState,
    params: BrowserSnapshotParams,
) -> Result<BrowserSnapshotResult, String> {
    cdp::snapshot(state, params).await
}

#[cfg(not(feature = "browser-automation"))]
pub async fn snapshot(
    _state: &BrowserState,
    _params: BrowserSnapshotParams,
) -> Result<BrowserSnapshotResult, String> {
    Err(format!(
        "{BROWSER_UNAVAILABLE}: Browser automation is not compiled into this build."
    ))
}

#[cfg(feature = "browser-automation")]
pub async fn action(
    state: &BrowserState,
    params: BrowserActionParams,
) -> Result<serde_json::Value, String> {
    cdp::action(state, params).await
}

#[cfg(not(feature = "browser-automation"))]
pub async fn action(
    _state: &BrowserState,
    _params: BrowserActionParams,
) -> Result<serde_json::Value, String> {
    Err(format!(
        "{BROWSER_UNAVAILABLE}: Browser automation is not compiled into this build."
    ))
}

#[cfg(feature = "browser-automation")]
pub async fn disconnect(state: &BrowserState) -> Result<(), String> {
    cdp::disconnect(state).await
}

#[cfg(not(feature = "browser-automation"))]
pub async fn disconnect(_state: &BrowserState) -> Result<(), String> {
    Err(format!(
        "{BROWSER_UNAVAILABLE}: Browser automation is not compiled into this build."
    ))
}
