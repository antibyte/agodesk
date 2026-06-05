use std::cell::RefCell;
use std::collections::HashMap;

use axuielement::ax_action::{AX_PRESS_ACTION, AX_RAISE_ACTION};
use axuielement::ax_attribute::attributes::{
    AX_DESCRIPTION_ATTRIBUTE, AX_ENABLED_ATTRIBUTE, AX_HIDDEN_ATTRIBUTE,
    AX_IDENTIFIER_ATTRIBUTE, AX_PARENT_ATTRIBUTE, AX_POSITION_ATTRIBUTE, AX_ROLE_ATTRIBUTE,
    AX_SIZE_ATTRIBUTE, AX_TITLE_ATTRIBUTE, AX_VALUE_ATTRIBUTE, AX_WINDOWS_ATTRIBUTE,
};
use axuielement::ax_attribute::roles::{
    AX_BUTTON_ROLE, AX_CHECK_BOX_ROLE, AX_COMBO_BOX_ROLE, AX_DRAWER_ROLE, AX_LINK_ROLE,
    AX_MENU_ITEM_ROLE, AX_POP_UP_BUTTON_ROLE, AX_RADIO_BUTTON_ROLE, AX_SCROLL_BAR_ROLE,
    AX_SHEET_ROLE, AX_SLIDER_ROLE, AX_TEXT_AREA_ROLE, AX_TEXT_FIELD_ROLE, AX_WINDOW_ROLE,
};
use axuielement::ax_ui_element::AXUIElement;
use axuielement::process_trust::{api_enabled, is_process_trusted};
use axuielement::system_wide::system_wide;
use sha2::{Digest, Sha256};
use xcap::Window;

use crate::computer_use::types::{
    Bounds, UiActionParams, UiActionResult, UiNode, UiTreeResult, UI_TREE_MAX_DEPTH,
    UI_TREE_MAX_NODES,
};

thread_local! {
    static ELEMENT_INDEX: RefCell<HashMap<String, AXUIElement>> = RefCell::new(HashMap::new());
}

pub fn ui_automation_available() -> bool {
    api_enabled() && is_process_trusted() && system_wide().is_some()
}

pub fn ui_tree_for_window(window_id: Option<&str>) -> Result<UiTreeResult, String> {
    ensure_accessibility()?;
    ELEMENT_INDEX.with(|index| index.borrow_mut().clear());

    let (root, resolved_window_id) = resolve_window_root(window_id)?;
    let mut counter = Counter::default();
    let root_node = build_node(&root, &resolved_window_id, "0", 0, &mut counter)?;

    Ok(UiTreeResult {
        window_id: resolved_window_id,
        root: root_node,
        truncated: counter.truncated,
        element_count: counter.count,
    })
}

pub fn perform_ui_action(params: &UiActionParams) -> Result<UiActionResult, String> {
    ensure_accessibility()?;

    let element = ELEMENT_INDEX.with(|index| {
        index
            .borrow()
            .get(&params.element_id)
            .cloned()
            .ok_or_else(|| {
                format!(
                    "DESKTOP_ELEMENT_NOT_FOUND: Unknown element_id: {}",
                    params.element_id
                )
            })
    })?;

    match params.action.as_str() {
        "click" | "invoke" => invoke_default_action(&element)?,
        "focus" => focus_element(&element)?,
        "set_value" => {
            let value = params
                .value
                .as_deref()
                .ok_or_else(|| "set_value requires value.".to_string())?;
            set_element_value(&element, value)?;
        }
        other => return Err(format!("Unsupported ui action: {other}")),
    }

    Ok(UiActionResult {
        element_id: params.element_id.clone(),
        action: params.action.clone(),
        success: true,
    })
}

fn ensure_accessibility() -> Result<(), String> {
    if !api_enabled() {
        return Err(
            "DESKTOP_UI_UNAVAILABLE: macOS Accessibility API is disabled.".to_string(),
        );
    }
    if !is_process_trusted() {
        return Err(
            "DESKTOP_UI_UNAVAILABLE: Grant Accessibility permission in System Settings → Privacy & Security → Accessibility.".to_string(),
        );
    }
    if system_wide().is_none() {
        return Err("DESKTOP_UI_UNAVAILABLE: Failed to create system-wide AX element.".to_string());
    }
    Ok(())
}

fn resolve_window_root(window_id: Option<&str>) -> Result<(AXUIElement, String), String> {
    let system = system_wide()
        .ok_or_else(|| "DESKTOP_UI_UNAVAILABLE: Failed to create system-wide AX element.".to_string())?;

    match window_id {
        None | Some("focused-window") => {
            let window = system
                .focused_window()
                .map_err(map_ax_error)?
                .ok_or_else(|| "DESKTOP_UI_UNAVAILABLE: No focused window.".to_string())?;
            Ok((window, "focused-window".to_string()))
        }
        Some(id) if id.starts_with("win-") => {
            let index = id
                .strip_prefix("win-")
                .and_then(|value| value.parse::<usize>().ok())
                .ok_or_else(|| format!("Invalid window_id: {id}"))?;
            let window = resolve_window_from_xcap_index(&system, index)?;
            Ok((window, id.to_string()))
        }
        Some(other) => {
            let title = resolve_window_title(Some(other))?;
            let window = find_window_by_title(&system, &title)?;
            Ok((window, other.to_string()))
        }
    }
}

fn resolve_window_from_xcap_index(
    system: &axuielement::system_wide::SystemWideElement,
    index: usize,
) -> Result<AXUIElement, String> {
    let windows = Window::all().map_err(|error| error.to_string())?;
    let window = windows
        .get(index)
        .ok_or_else(|| format!("Unknown window_id: win-{index}"))?;
    let title = window.title().trim().to_string();
    if title.is_empty() {
        return Err(format!("Unknown window_id: win-{index}"));
    }

    let x = window.x() as f32;
    let y = window.y() as f32;
    let width = window.width() as f32;
    let height = window.height() as f32;
    if width > 0.0 && height > 0.0 {
        let center_x = x + width / 2.0;
        let center_y = y + height / 2.0;
        if let Ok(Some(hit)) = system.element_at_position(center_x, center_y) {
            if let Some(window_elem) = find_window_ancestor(&hit) {
                if window_title_matches(&window_elem, &title) {
                    return Ok(window_elem);
                }
            }
        }
    }

    find_window_by_title(system, &title)
}

fn resolve_window_title(window_id: Option<&str>) -> Result<String, String> {
    match window_id {
        None | Some("focused-window") => active_window_title(),
        Some(id) if id.starts_with("win-") => {
            let index = id
                .strip_prefix("win-")
                .and_then(|value| value.parse::<usize>().ok())
                .ok_or_else(|| format!("Invalid window_id: {id}"))?;
            let windows = Window::all().map_err(|error| error.to_string())?;
            windows
                .get(index)
                .map(|window| window.title().trim().to_string())
                .filter(|title| !title.is_empty())
                .ok_or_else(|| format!("Unknown window_id: {id}"))
        }
        Some(other) => {
            let _ = other;
            active_window_title()
        }
    }
}

fn active_window_title() -> Result<String, String> {
    let active = active_win_pos_rs::get_active_window()
        .map_err(|_| "Failed to read active window.".to_string())?;
    let title = active.title.trim().to_string();
    if title.is_empty() {
        return Err("Active window has no title.".to_string());
    }
    Ok(title)
}

fn find_window_by_title(
    system: &axuielement::system_wide::SystemWideElement,
    title: &str,
) -> Result<AXUIElement, String> {
    if let Ok(Some(window)) = system.focused_window() {
        if window_title_matches(&window, title) {
            return Ok(window);
        }
    }

    if let Ok(Some(app)) = system.focused_application() {
        if let Ok(windows) = app.element_array_attribute(AX_WINDOWS_ATTRIBUTE) {
            for window in windows {
                if window_title_matches(&window, title) {
                    return Ok(window);
                }
            }
        }
    }

    for pid in running_process_pids() {
        let Some(app) = AXUIElement::from_pid(pid) else {
            continue;
        };
        let Ok(windows) = app.element_array_attribute(AX_WINDOWS_ATTRIBUTE) else {
            continue;
        };
        for window in windows {
            if window_title_matches(&window, title) {
                return Ok(window);
            }
        }
    }

    Err(format!(
        "DESKTOP_UI_UNAVAILABLE: No AX window found for title '{title}'."
    ))
}

fn running_process_pids() -> Vec<i32> {
    let output = std::process::Command::new("ps")
        .args(["-axo", "pid="])
        .output()
        .ok();
    output
        .and_then(|output| {
            if !output.status.success() {
                return None;
            }
            Some(
                String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .filter_map(|line| line.trim().parse::<i32>().ok())
                    .collect(),
            )
        })
        .unwrap_or_default()
}

fn find_window_ancestor(element: &AXUIElement) -> Option<AXUIElement> {
    let mut current = element.clone();
    for _ in 0..24 {
        if is_window_like(&current) {
            return Some(current);
        }
        match current.element_attribute(AX_PARENT_ATTRIBUTE) {
            Ok(Some(parent)) => current = parent,
            _ => break,
        }
    }
    None
}

fn window_title_matches(element: &AXUIElement, expected: &str) -> bool {
    element_title(element)
        .map(|title| title_matches(&title, expected))
        .unwrap_or(false)
}

fn build_node(
    element: &AXUIElement,
    window_id: &str,
    path: &str,
    depth: u32,
    counter: &mut Counter,
) -> Result<UiNode, String> {
    counter.count += 1;
    if counter.count > UI_TREE_MAX_NODES {
        counter.truncated = true;
    }

    let role = element
        .string_attribute(AX_ROLE_ATTRIBUTE)
        .map_err(map_ax_error)?
        .unwrap_or_else(|| "AXUnknown".to_string());
    let name = element_name(element);
    let automation_id = element
        .string_attribute(AX_IDENTIFIER_ATTRIBUTE)
        .ok()
        .flatten()
        .filter(|value| !value.trim().is_empty());
    let enabled = element
        .bool_attribute(AX_ENABLED_ATTRIBUTE)
        .ok()
        .flatten()
        .unwrap_or(true);
    let hidden = element
        .bool_attribute(AX_HIDDEN_ATTRIBUTE)
        .ok()
        .flatten()
        .unwrap_or(false);
    let visible = !hidden;
    let bounds = read_bounds(element).unwrap_or(Bounds {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
    });
    let interactive = is_interactive(element, &role);

    let id = element_id_for(window_id, path, automation_id.as_deref(), name.as_deref());
    store_handle(&id, element);

    let mut children = Vec::new();
    if depth < UI_TREE_MAX_DEPTH && counter.count <= UI_TREE_MAX_NODES {
        let child_elements = element.children().unwrap_or_default();
        for (index, child) in child_elements.into_iter().enumerate() {
            if counter.count >= UI_TREE_MAX_NODES {
                counter.truncated = true;
                break;
            }
            let child_path = format!("{path}.{index}");
            children.push(build_node(
                &child,
                window_id,
                &child_path,
                depth + 1,
                counter,
            )?);
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

fn read_bounds(element: &AXUIElement) -> Result<Bounds, String> {
    let position = element
        .point_attribute(AX_POSITION_ATTRIBUTE)
        .map_err(map_ax_error)?
        .ok_or_else(|| "Element has no AX position.".to_string())?;
    let size = element
        .size_attribute(AX_SIZE_ATTRIBUTE)
        .map_err(map_ax_error)?
        .ok_or_else(|| "Element has no AX size.".to_string())?;
    Ok(Bounds {
        x: position.x.round() as i32,
        y: position.y.round() as i32,
        width: size.width.round().max(0.0) as u32,
        height: size.height.round().max(0.0) as u32,
    })
}

fn is_interactive(element: &AXUIElement, role: &str) -> bool {
    if matches!(
        role,
        AX_BUTTON_ROLE
            | AX_CHECK_BOX_ROLE
            | AX_COMBO_BOX_ROLE
            | AX_LINK_ROLE
            | AX_MENU_ITEM_ROLE
            | AX_POP_UP_BUTTON_ROLE
            | AX_RADIO_BUTTON_ROLE
            | AX_SCROLL_BAR_ROLE
            | AX_SLIDER_ROLE
            | AX_TEXT_AREA_ROLE
            | AX_TEXT_FIELD_ROLE
    ) {
        return true;
    }
    element
        .action_names()
        .map(|actions| !actions.is_empty())
        .unwrap_or(false)
}

fn invoke_default_action(element: &AXUIElement) -> Result<(), String> {
    let actions = element.action_names().map_err(map_ax_error)?;
    if actions.iter().any(|action| action == AX_PRESS_ACTION) {
        element
            .perform_action(AX_PRESS_ACTION)
            .map_err(map_ax_error)?;
        return Ok(());
    }
    if let Some(first) = actions.first() {
        element.perform_action(first).map_err(map_ax_error)?;
        return Ok(());
    }
    Err("DESKTOP_ELEMENT_NOT_FOUND: Element exposes no actions.".to_string())
}

fn focus_element(element: &AXUIElement) -> Result<(), String> {
    let actions = element.action_names().map_err(map_ax_error)?;
    if actions.iter().any(|action| action == AX_RAISE_ACTION) {
        element
            .perform_action(AX_RAISE_ACTION)
            .map_err(map_ax_error)?;
        return Ok(());
    }
    if actions.iter().any(|action| action == AX_PRESS_ACTION) {
        element
            .perform_action(AX_PRESS_ACTION)
            .map_err(map_ax_error)?;
        return Ok(());
    }
    Err("DESKTOP_ELEMENT_NOT_FOUND: Element exposes no focus action.".to_string())
}

fn set_element_value(element: &AXUIElement, value: &str) -> Result<(), String> {
    if element
        .is_attribute_settable(AX_VALUE_ATTRIBUTE)
        .map_err(map_ax_error)?
    {
        element
            .set_string_attribute(AX_VALUE_ATTRIBUTE, value)
            .map_err(map_ax_error)?;
        return Ok(());
    }
    Err("DESKTOP_UI_UNAVAILABLE: AXValue attribute is not settable.".to_string())
}

fn element_name(element: &AXUIElement) -> Option<String> {
    element_title(element).or_else(|| element_value(element))
}

fn element_title(element: &AXUIElement) -> Option<String> {
    element
        .string_attribute(AX_TITLE_ATTRIBUTE)
        .ok()
        .flatten()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            element
                .string_attribute(AX_DESCRIPTION_ATTRIBUTE)
                .ok()
                .flatten()
                .filter(|value| !value.trim().is_empty())
        })
}

fn element_value(element: &AXUIElement) -> Option<String> {
    element
        .string_attribute(AX_VALUE_ATTRIBUTE)
        .ok()
        .flatten()
        .filter(|value| !value.trim().is_empty())
}

fn is_window_like(element: &AXUIElement) -> bool {
    element
        .string_attribute(AX_ROLE_ATTRIBUTE)
        .ok()
        .flatten()
        .map(|role| {
            matches!(
                role.as_str(),
                AX_WINDOW_ROLE | AX_SHEET_ROLE | AX_DRAWER_ROLE
            )
        })
        .unwrap_or(false)
}

fn store_handle(id: &str, element: &AXUIElement) {
    ELEMENT_INDEX.with(|index| {
        index.borrow_mut().insert(id.to_string(), element.clone());
    });
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

fn title_matches(candidate: &str, expected: &str) -> bool {
    let candidate = candidate.trim().to_ascii_lowercase();
    let expected = expected.trim().to_ascii_lowercase();
    candidate == expected || candidate.contains(&expected) || expected.contains(&candidate)
}

fn map_ax_error(error: axuielement::ax_error::AXError) -> String {
    format!("DESKTOP_UI_UNAVAILABLE: {error}")
}

#[derive(Default)]
struct Counter {
    count: usize,
    truncated: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_match_is_fuzzy() {
        assert!(title_matches(
            "Example Domain - Safari",
            "Example Domain"
        ));
        assert!(title_matches("Example Domain", "Example Domain"));
    }

    #[test]
    fn element_id_is_stable() {
        assert_eq!(
            element_id_for("focused-window", "0.1", Some("input"), Some("Search")),
            element_id_for("focused-window", "0.1", Some("input"), Some("Search"))
        );
    }
}
