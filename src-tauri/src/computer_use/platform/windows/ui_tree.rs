use crate::computer_use::types::{
    Bounds, UiActionParams, UiActionResult, UiNode, UiTreeResult, UI_TREE_MAX_DEPTH,
    UI_TREE_MAX_NODES,
};
use sha2::{Digest, Sha256};
use std::cell::RefCell;
use uiautomation::controls::ControlType;
use uiautomation::types::{Handle, TreeScope};
use uiautomation::UIAutomation;

thread_local! {
    static ELEMENT_INDEX: RefCell<std::collections::HashMap<String, uiautomation::UIElement>> =
        RefCell::new(std::collections::HashMap::new());
}

pub fn ui_automation_available() -> bool {
    UIAutomation::new().is_ok()
}

pub fn ui_tree_for_window(window_id: Option<&str>) -> Result<UiTreeResult, String> {
    ELEMENT_INDEX.with(|index| index.borrow_mut().clear());

    let automation = UIAutomation::new().map_err(|error| error.to_string())?;
    let root = if let Some(window_id) = window_id {
        resolve_window_element(&automation, window_id)?
    } else {
        automation
            .get_focused_element()
            .map_err(|error| format!("Failed to read focused element: {error}"))?
    };

    let window_id = window_id
        .map(str::to_string)
        .unwrap_or_else(|| "focused-window".to_string());

    let mut counter = Counter::default();
    let root_node = build_node(&automation, &root, &window_id, "0", 0, &mut counter)?;

    Ok(UiTreeResult {
        window_id,
        root: root_node,
        truncated: counter.truncated,
        element_count: counter.count,
    })
}

pub fn perform_ui_action(params: &UiActionParams) -> Result<UiActionResult, String> {
    let element = ELEMENT_INDEX.with(|index| {
        index
            .borrow()
            .get(&params.element_id)
            .cloned()
            .ok_or_else(|| format!("Unknown element_id: {}", params.element_id))
    })?;

    match params.action.as_str() {
        "click" | "invoke" => {
            element
                .click()
                .map_err(|error| format!("UI click failed: {error}"))?;
        }
        "focus" => {
            element
                .set_focus()
                .map_err(|error| format!("UI focus failed: {error}"))?;
        }
        "set_value" => {
            let value = params
                .value
                .as_deref()
                .ok_or_else(|| "set_value requires value.".to_string())?;
            element
                .send_text(value, 0)
                .map_err(|error| format!("UI set_value failed: {error}"))?;
        }
        other => return Err(format!("Unsupported ui action: {other}")),
    }

    Ok(UiActionResult {
        element_id: params.element_id.clone(),
        action: params.action.clone(),
        success: true,
    })
}

fn resolve_window_element(
    automation: &UIAutomation,
    window_id: &str,
) -> Result<uiautomation::UIElement, String> {
    if window_id == "focused-window" {
        return automation
            .get_focused_element()
            .map_err(|error| error.to_string());
    }

    let hwnd = window_id
        .strip_prefix("win-")
        .ok_or_else(|| format!("Invalid window_id: {window_id}"))?
        .parse::<isize>()
        .map_err(|_| format!("Invalid window handle in {window_id}"))?;

    automation
        .element_from_handle(Handle::from(hwnd))
        .map_err(|error| format!("Failed to resolve window element: {error}"))
}

#[derive(Default)]
struct Counter {
    count: usize,
    truncated: bool,
}

fn build_node(
    automation: &UIAutomation,
    element: &uiautomation::UIElement,
    window_id: &str,
    path: &str,
    depth: u32,
    counter: &mut Counter,
) -> Result<UiNode, String> {
    counter.count += 1;
    if counter.count > UI_TREE_MAX_NODES {
        counter.truncated = true;
    }

    let name = element.get_name().ok();
    let automation_id = element.get_automation_id().ok().filter(|value| !value.is_empty());
    let role = element
        .get_control_type()
        .map(format_control_type)
        .unwrap_or_else(|_| "Unknown".to_string());
    let bounds = element
        .get_bounding_rectangle()
        .map(|rect| Bounds {
            x: rect.get_left(),
            y: rect.get_top(),
            width: rect.get_width().max(0) as u32,
            height: rect.get_height().max(0) as u32,
        })
        .unwrap_or(Bounds {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        });
    let enabled = element.is_enabled().unwrap_or(false);
    let visible = !element.is_offscreen().unwrap_or(true);
    let interactive = matches!(
        role.as_str(),
        "Button" | "Edit" | "CheckBox" | "ComboBox" | "Hyperlink" | "MenuItem" | "TabItem"
    );

    let id = element_id_for(window_id, path, automation_id.as_deref(), name.as_deref());
    ELEMENT_INDEX.with(|index| {
        index.borrow_mut().insert(id.clone(), element.clone());
    });

    let mut children = Vec::new();
    if depth < UI_TREE_MAX_DEPTH && counter.count <= UI_TREE_MAX_NODES {
        let condition = automation
            .create_true_condition()
            .map_err(|error| error.to_string())?;
        if let Ok(child_elements) = element.find_all(TreeScope::Children, &condition) {
            for (index, child) in child_elements.into_iter().enumerate() {
                if counter.count >= UI_TREE_MAX_NODES {
                    counter.truncated = true;
                    break;
                }
                let child_path = format!("{path}.{index}");
                children.push(build_node(
                    automation,
                    &child,
                    window_id,
                    &child_path,
                    depth + 1,
                    counter,
                )?);
            }
        }
    } else {
        counter.truncated = true;
    }

    Ok(UiNode {
        id,
        role,
        name,
        automation_id,
        bounds,
        interactive,
        enabled,
        visible,
        children,
    })
}

fn element_id_for(
    window_id: &str,
    path: &str,
    automation_id: Option<&str>,
    name: Option<&str>,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(window_id.as_bytes());
    hasher.update(path.as_bytes());
    if let Some(automation_id) = automation_id {
        hasher.update(automation_id.as_bytes());
    }
    if let Some(name) = name {
        hasher.update(name.as_bytes());
    }
    format!("elem-{}", hex::encode(&hasher.finalize()[..8]))
}

fn format_control_type(control: ControlType) -> String {
    format!("{control:?}")
}
