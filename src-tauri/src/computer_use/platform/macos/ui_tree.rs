use crate::computer_use::types::{
    Bounds, UiActionParams, UiActionResult, UiNode, UiTreeResult,
};

pub fn ui_automation_available() -> bool {
    false
}

pub fn ui_tree_for_window(window_id: Option<&str>) -> Result<UiTreeResult, String> {
    let _ = window_id;
    Err("macOS UI automation is planned for a later phase.".to_string())
}

pub fn perform_ui_action(params: &UiActionParams) -> Result<UiActionResult, String> {
    let _ = params;
    Err("macOS UI automation is planned for a later phase.".to_string())
}

pub fn capture_screen_macos_stub() -> Result<(), String> {
    Err("macOS capture uses xcap via desktop platform module.".to_string())
}

#[allow(dead_code)]
fn placeholder_bounds() -> Bounds {
    Bounds {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
    }
}

#[allow(dead_code)]
fn placeholder_node(id: &str) -> UiNode {
    UiNode {
        id: id.to_string(),
        role: "Window".to_string(),
        name: None,
        automation_id: None,
        bounds: placeholder_bounds(),
        interactive: false,
        enabled: true,
        visible: true,
        children: Vec::new(),
    }
}
