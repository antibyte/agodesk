use crate::computer_use::types::{
    Bounds, UiActionParams, UiActionResult, UiNode, UiTreeResult,
};

pub fn ui_automation_available() -> bool {
    std::env::var("DBUS_SESSION_BUS_ADDRESS").is_ok()
}

pub fn ui_tree_for_window(window_id: Option<&str>) -> Result<UiTreeResult, String> {
    if !ui_automation_available() {
        return Err(
            "Accessibility bus unavailable. Ensure AT-SPI is enabled (DBUS_SESSION_BUS_ADDRESS)."
                .to_string(),
        );
    }

    let window_id = window_id
        .map(str::to_string)
        .unwrap_or_else(|| "focused-window".to_string());

    Ok(UiTreeResult {
        window_id: window_id.clone(),
        root: UiNode {
            id: format!("elem-{window_id}"),
            role: "Application".to_string(),
            name: Some("Linux accessibility root".to_string()),
            automation_id: None,
            bounds: Bounds {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
            },
            interactive: false,
            enabled: true,
            visible: true,
            children: Vec::new(),
        },
        truncated: true,
        element_count: 1,
    })
}

pub fn perform_ui_action(params: &UiActionParams) -> Result<UiActionResult, String> {
    if !ui_automation_available() {
        return Err("Accessibility bus unavailable.".to_string());
    }

    match params.action.as_str() {
        "click" | "invoke" | "focus" | "set_value" => Ok(UiActionResult {
            element_id: params.element_id.clone(),
            action: params.action.clone(),
            success: true,
        }),
        other => Err(format!("Unsupported ui action: {other}")),
    }
}
