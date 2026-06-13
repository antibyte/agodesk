use std::cell::RefCell;
use std::collections::HashMap;
use std::future::Future;
use std::sync::OnceLock;

use atspi::proxy::accessible::{AccessibleProxy, ObjectRefExt};
use atspi::proxy::action::ActionProxy;
use atspi::proxy::component::ComponentProxy;
use atspi::proxy::editable_text::EditableTextProxy;
use atspi::{AccessibilityConnection, CoordType, Interface, Role, State};
use zbus::proxy::ProxyImpl;
use sha2::{Digest, Sha256};
use tokio::runtime::Runtime;
use zbus::names::UniqueName;
use zbus::zvariant::ObjectPath;

use crate::computer_use::types::{
    Bounds, UiActionParams, UiActionResult, UiNode, UiTreeResult, UI_TREE_MAX_DEPTH,
    UI_TREE_MAX_NODES,
};

thread_local! {
    static ELEMENT_INDEX: RefCell<HashMap<String, AtspiHandle>> = RefCell::new(HashMap::new());
}

#[derive(Clone, Debug)]
struct AtspiHandle {
    destination: String,
    path: String,
}

pub fn ui_automation_available() -> bool {
    block_on(async { AccessibilityConnection::new().await.is_ok() })
}

pub fn ui_tree_for_window(window_id: Option<&str>) -> Result<UiTreeResult, String> {
    ELEMENT_INDEX.with(|index| index.borrow_mut().clear());
    block_on(async { ui_tree_for_window_async(window_id).await })
}

pub fn perform_ui_action(params: &UiActionParams) -> Result<UiActionResult, String> {
    block_on(async { perform_ui_action_async(params).await })
}

async fn ui_tree_for_window_async(window_id: Option<&str>) -> Result<UiTreeResult, String> {
    let conn = connect().await?;
    let (root, resolved_window_id) = resolve_window_root(&conn, window_id).await?;
    let mut counter = Counter::default();
    let root_node = build_node(&conn, &root, &resolved_window_id, "0", 0, &mut counter).await?;
    Ok(UiTreeResult {
        window_id: resolved_window_id,
        root: root_node,
        truncated: counter.truncated,
        element_count: counter.count,
    })
}

async fn perform_ui_action_async(params: &UiActionParams) -> Result<UiActionResult, String> {
    let handle = ELEMENT_INDEX.with(|index| {
        index
            .borrow()
            .get(&params.element_id)
            .cloned()
            .ok_or_else(|| format!("DESKTOP_ELEMENT_NOT_FOUND: Unknown element_id: {}", params.element_id))
    })?;

    let conn = connect().await?;
    let accessible = accessible_from_handle(&conn, &handle).await?;

    match params.action.as_str() {
        "click" | "invoke" => invoke_default_action(&conn, &accessible).await?,
        "focus" => {
            let component = component_proxy(&conn, &accessible).await?;
            component
                .grab_focus()
                .await
                .map_err(map_atspi_error)?;
        }
        "set_value" => {
            let value = params
                .value
                .as_deref()
                .ok_or_else(|| "set_value requires value.".to_string())?;
            let editable = editable_text_proxy(&conn, &accessible).await?;
            editable
                .set_text_contents(value)
                .await
                .map_err(map_atspi_error)?;
        }
        other => return Err(format!("Unsupported ui action: {other}")),
    }

    Ok(UiActionResult {
        element_id: params.element_id.clone(),
        action: params.action.clone(),
        success: true,
    })
}

async fn connect() -> Result<AccessibilityConnection, String> {
    AccessibilityConnection::new()
        .await
        .map_err(|error| format!("DESKTOP_UI_UNAVAILABLE: AT-SPI connection failed: {error}"))
}

async fn resolve_window_root<'a>(
    conn: &'a AccessibilityConnection,
    window_id: Option<&str>,
) -> Result<(AccessibleProxy<'a>, String), String> {
    let title = resolve_window_title(window_id)?;
    let registry = conn
        .root_accessible_on_registry()
        .await
        .map_err(map_atspi_error)?;
    let apps = registry.get_children().await.map_err(map_atspi_error)?;

    for app_ref in apps {
        if app_ref.is_null() {
            continue;
        }
        let app = app_ref
            .into_accessible_proxy(conn.connection())
            .await
            .map_err(map_atspi_error)?;
        if let Some(window) = find_window_by_title(conn, &app, &title, 0).await? {
            let resolved_id = window_id
                .map(str::to_string)
                .unwrap_or_else(|| "focused-window".to_string());
            return Ok((window, resolved_id));
        }
    }

    Err(format!(
        "DESKTOP_UI_UNAVAILABLE: No AT-SPI window found for title '{title}'."
    ))
}

async fn find_window_by_title<'a>(
    conn: &'a AccessibilityConnection,
    accessible: &AccessibleProxy<'a>,
    title: &str,
    depth: u32,
) -> Result<Option<AccessibleProxy<'a>>, String> {
    let name = accessible.name().await.unwrap_or_default();
    let role = accessible.get_role().await.unwrap_or(Role::Invalid);
    if title_matches(&name, title) && is_window_like_role(role) {
        return Ok(Some(accessible.clone()));
    }
    if depth >= 4 {
        return Ok(None);
    }

    let children = accessible.get_children().await.unwrap_or_default();
    for child_ref in children {
        if child_ref.is_null() {
            continue;
        }
        let child = child_ref
            .into_accessible_proxy(conn.connection())
            .await
            .map_err(map_atspi_error)?;
        if let Some(found) = Box::pin(find_window_by_title(conn, &child, title, depth + 1)).await? {
            return Ok(Some(found));
        }
    }
    Ok(None)
}

fn resolve_window_title(window_id: Option<&str>) -> Result<String, String> {
    match window_id {
        None | Some("focused-window") => active_window_title(),
        Some(id) if id.starts_with("win-") => {
            let index = id
                .strip_prefix("win-")
                .and_then(|value| value.parse::<usize>().ok())
                .ok_or_else(|| format!("Invalid window_id: {id}"))?;
            let windows = xcap::Window::all().map_err(|error| error.to_string())?;
            windows
                .get(index)
                .map(|window| window.title().to_string())
                .filter(|title| !title.trim().is_empty())
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

fn title_matches(candidate: &str, expected: &str) -> bool {
    let candidate = candidate.trim().to_ascii_lowercase();
    let expected = expected.trim().to_ascii_lowercase();
    candidate == expected || candidate.contains(&expected) || expected.contains(&candidate)
}

fn is_window_like_role(role: Role) -> bool {
    matches!(
        role,
        Role::Application
            | Role::Frame
            | Role::Window
            | Role::Dialog
            | Role::DocumentFrame
    )
}

async fn build_node<'a>(
    conn: &'a AccessibilityConnection,
    accessible: &AccessibleProxy<'a>,
    window_id: &str,
    path: &str,
    depth: u32,
    counter: &mut Counter,
) -> Result<UiNode, String> {
    counter.count += 1;
    if counter.count > UI_TREE_MAX_NODES {
        counter.truncated = true;
    }

    let role = accessible
        .get_role()
        .await
        .map(|value| format!("{value:?}"))
        .unwrap_or_else(|_| "Unknown".to_string());
    let name = accessible
        .name()
        .await
        .ok()
        .filter(|value| !value.trim().is_empty());
    let automation_id = accessible
        .accessible_id()
        .await
        .ok()
        .filter(|value| !value.trim().is_empty());
    let state = accessible.get_state().await.unwrap_or_default();
    let enabled = state.contains(State::Enabled) && !state.contains(State::ReadOnly);
    let visible = state.contains(State::Visible) || state.contains(State::Showing);
    let bounds = read_bounds(conn, accessible).await.unwrap_or(Bounds {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
    });
    let interactive = is_interactive(conn, accessible, &role).await;

    let id = element_id_for(window_id, path, automation_id.as_deref(), name.as_deref());
    store_handle(&id, accessible);

    let mut children = Vec::new();
    if depth < UI_TREE_MAX_DEPTH && counter.count <= UI_TREE_MAX_NODES {
        let child_refs = accessible.get_children().await.unwrap_or_default();
        for (index, child_ref) in child_refs.into_iter().enumerate() {
            if counter.count >= UI_TREE_MAX_NODES {
                counter.truncated = true;
                break;
            }
            if child_ref.is_null() {
                continue;
            }
            let child = child_ref
                .into_accessible_proxy(conn.connection())
                .await
                .map_err(map_atspi_error)?;
            let child_path = format!("{path}.{index}");
            children.push(
                Box::pin(build_node(
                    conn,
                    &child,
                    window_id,
                    &child_path,
                    depth + 1,
                    counter,
                ))
                .await?,
            );
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

async fn read_bounds<'a>(
    conn: &'a AccessibilityConnection,
    accessible: &AccessibleProxy<'a>,
) -> Result<Bounds, String> {
    let component = component_proxy(conn, accessible).await?;
    let (x, y, width, height) = component
        .get_extents(CoordType::Screen)
        .await
        .map_err(map_atspi_error)?;
    Ok(Bounds {
        x,
        y,
        width: width.max(0) as u32,
        height: height.max(0) as u32,
    })
}

async fn is_interactive<'a>(
    conn: &'a AccessibilityConnection,
    accessible: &AccessibleProxy<'a>,
    role: &str,
) -> bool {
    if matches!(
        role,
        "PushButton"
            | "ToggleButton"
            | "CheckBox"
            | "RadioButton"
            | "ComboBox"
            | "Entry"
            | "PasswordText"
            | "Link"
            | "MenuItem"
            | "ListItem"
            | "SpinButton"
            | "Text"
    ) {
        return true;
    }
    accessible
        .get_interfaces()
        .await
        .map(|interfaces| interfaces.contains(Interface::Action))
        .unwrap_or(false)
        || component_proxy(conn, accessible).await.is_ok()
}

async fn invoke_default_action<'a>(
    conn: &'a AccessibilityConnection,
    accessible: &AccessibleProxy<'a>,
) -> Result<(), String> {
    let action = action_proxy(conn, accessible).await?;
    let count = action.n_actions().await.map_err(map_atspi_error)?;
    if count <= 0 {
        return Err("DESKTOP_ELEMENT_NOT_FOUND: Element exposes no actions.".to_string());
    }
    action
        .do_action(0)
        .await
        .map_err(map_atspi_error)?;
    Ok(())
}

async fn accessible_from_handle<'a>(
    conn: &'a AccessibilityConnection,
    handle: &'a AtspiHandle,
) -> Result<AccessibleProxy<'a>, String> {
    let destination = UniqueName::try_from(handle.destination.as_str()).map_err(map_zbus_error)?;
    let path = ObjectPath::try_from(handle.path.as_str()).map_err(map_zbus_error)?;
    AccessibleProxy::builder(conn.connection())
        .destination(destination)
        .map_err(map_zbus_error)?
        .path(path)
        .map_err(map_zbus_error)?
        .build()
        .await
        .map_err(map_atspi_error)
}

async fn action_proxy<'a>(
    conn: &'a AccessibilityConnection,
    accessible: &'a AccessibleProxy<'a>,
) -> Result<ActionProxy<'a>, String> {
    proxy_from_accessible(conn, accessible).await
}

async fn component_proxy<'a>(
    conn: &'a AccessibilityConnection,
    accessible: &'a AccessibleProxy<'a>,
) -> Result<ComponentProxy<'a>, String> {
    proxy_from_accessible(conn, accessible).await
}

async fn editable_text_proxy<'a>(
    conn: &'a AccessibilityConnection,
    accessible: &'a AccessibleProxy<'a>,
) -> Result<EditableTextProxy<'a>, String> {
    proxy_from_accessible(conn, accessible).await
}

async fn proxy_from_accessible<'a, P>(
    conn: &'a AccessibilityConnection,
    accessible: &'a AccessibleProxy<'a>,
) -> Result<P, String>
where
    P: ProxyImpl<'a> + From<zbus::Proxy<'a>>,
{
    let inner = accessible.inner();
    let destination = inner.destination().to_owned();
    let path = inner.path().clone();
    P::builder(conn.connection())
        .destination(destination)
        .map_err(map_zbus_error)?
        .path(path)
        .map_err(map_zbus_error)?
        .build()
        .await
        .map_err(map_atspi_error)
}

fn store_handle(id: &str, accessible: &AccessibleProxy<'_>) {
    let inner = accessible.inner();
    ELEMENT_INDEX.with(|index| {
        index.borrow_mut().insert(
            id.to_string(),
            AtspiHandle {
                destination: inner.destination().to_string(),
                path: inner.path().to_string(),
            },
        );
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

#[derive(Default)]
struct Counter {
    count: usize,
    truncated: bool,
}

fn block_on<F: Future>(future: F) -> F::Output {
    static RUNTIME: OnceLock<Runtime> = OnceLock::new();
    let runtime = RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .worker_threads(1)
            .build()
            .expect("tokio runtime for AT-SPI")
    });
    runtime.block_on(future)
}

fn map_atspi_error(error: impl std::fmt::Display) -> String {
    format!("DESKTOP_UI_UNAVAILABLE: {error}")
}

fn map_zbus_error(error: impl std::fmt::Display) -> String {
    format!("DESKTOP_UI_UNAVAILABLE: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_match_is_fuzzy() {
        assert!(title_matches("Example Domain - Chromium", "Example Domain"));
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
