use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayInfo {
    pub id: String,
    pub index: u32,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub primary: bool,
    pub scale_factor: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowInfo {
    pub id: String,
    pub title: String,
    pub class_name: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub visible: bool,
    pub display_id: String,
    pub display_name: String,
    pub monitor_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureScreenOptions {
    pub display_id: Option<String>,
    pub window_id: Option<String>,
    pub format: Option<String>,
    pub quality: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureResult {
    pub source: String,
    pub display_id: Option<String>,
    pub window_id: Option<String>,
    pub format: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub mime: String,
    pub data_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlPermissionStatus {
    pub screen_capture: bool,
    pub input_injection: bool,
    pub approved_session: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputEvent {
    pub kind: String,
    pub payload: Option<serde_json::Value>,
}
