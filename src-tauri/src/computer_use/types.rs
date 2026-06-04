use serde::{Deserialize, Serialize};

pub const UI_TREE_MAX_DEPTH: u32 = 8;
pub const UI_TREE_MAX_NODES: usize = 400;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiNode {
    pub id: String,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub automation_id: Option<String>,
    pub bounds: Bounds,
    pub interactive: bool,
    pub enabled: bool,
    pub visible: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<UiNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiTreeResult {
    pub window_id: String,
    pub root: UiNode,
    pub truncated: bool,
    pub element_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveWindowInfo {
    pub id: String,
    pub title: String,
    pub process_name: String,
    pub process_path: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub display_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiActionParams {
    pub action: String,
    pub element_id: String,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub window_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiActionResult {
    pub element_id: String,
    pub action: String,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserConnectParams {
    pub endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserSnapshotParams {
    pub selector: Option<String>,
    pub include_html: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserActionParams {
    pub action: String,
    pub selector: String,
    #[serde(default)]
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserSessionInfo {
    pub connected: bool,
    pub endpoint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserSnapshotResult {
    pub url: String,
    pub title: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "method", content = "params")]
pub enum WorkerRequest {
    ActiveWindow,
    UiTree { window_id: Option<String> },
    UiAction(UiActionParams),
    Ping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
