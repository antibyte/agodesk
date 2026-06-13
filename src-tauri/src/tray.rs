use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, Window, WindowEvent};

const DEFAULT_TRAY_SHOW: &str = "Open agodesk";
const DEFAULT_TRAY_QUIT: &str = "Quit";
const DEFAULT_TRAY_TOOLTIP: &str = "agodesk";
const TRAY_ID: &str = "main-tray";

struct TrayMenuItems {
    show: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

pub struct TrayState {
    pub minimize_to_tray: AtomicBool,
    menu_items: Mutex<Option<TrayMenuItems>>,
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            minimize_to_tray: AtomicBool::new(false),
            menu_items: Mutex::new(None),
        }
    }
}

/// Windows fails to remove hidden tray icons on drop (tray-icon#289).
pub fn prepare_tray_for_exit(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_visible(true);
    }
}

pub fn request_app_exit(app: &AppHandle) {
    crate::integration_embed::integration_embed_shutdown(app);
    prepare_tray_for_exit(app);
    app.exit(0);
}

pub fn restore_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let was_hidden = window.is_visible().ok() == Some(false);
    let was_minimized = window.is_minimized().unwrap_or(false);
    let _ = window.set_skip_taskbar(false);
    let _ = window.unminimize();
    let _ = window.show();
    if was_hidden || was_minimized {
        let _ = window.maximize();
    }
    let _ = window.set_focus();
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) -> Result<(), String> {
    restore_main_window(&app);
    Ok(())
}

fn hide_main_window_to_tray(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.set_skip_taskbar(true);
    let _ = window.hide();
}

fn apply_tray_labels(
    app: &AppHandle,
    state: &TrayState,
    show: &str,
    quit: &str,
    tooltip: &str,
) -> Result<(), String> {
    let menu_items = state
        .menu_items
        .lock()
        .map_err(|error| error.to_string())?;
    let Some(items) = menu_items.as_ref() else {
        return Ok(());
    };

    items
        .show
        .set_text(show)
        .map_err(|error| error.to_string())?;
    items
        .quit
        .set_text(quit)
        .map_err(|error| error.to_string())?;

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_tooltip(Some(tooltip))
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

pub fn setup_tray(app: &AppHandle, state: &TrayState) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(
        app,
        "tray-show",
        DEFAULT_TRAY_SHOW,
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, "tray-quit", DEFAULT_TRAY_QUIT, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let icon = app
        .default_window_icon()
        .ok_or_else(|| tauri::Error::Io(std::io::Error::other("Missing default window icon.")))?
        .clone();

    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip(DEFAULT_TRAY_TOOLTIP)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray-show" => restore_main_window(app),
            "tray-quit" => request_app_exit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                restore_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    // Hidden until "minimize to tray" is enabled. Must be visible again before app exit on Windows.
    let _ = tray.set_visible(false);

    *state.menu_items.lock().expect("tray mutex poisoned") = Some(TrayMenuItems {
        show: show_item,
        quit: quit_item,
    });
    Ok(())
}

pub fn handle_window_event(window: &Window, event: &WindowEvent, state: &TrayState) {
    if window.label() != "main" {
        return;
    }

    if !state.minimize_to_tray.load(Ordering::Relaxed) {
        return;
    }

    match event {
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            hide_main_window_to_tray(window.app_handle());
        }
        WindowEvent::Resized(_) if window.is_minimized().unwrap_or(false) => {
            hide_main_window_to_tray(window.app_handle());
        }
        _ => {}
    }
}

#[tauri::command]
pub fn set_minimize_to_tray(
    app: AppHandle,
    state: State<'_, TrayState>,
    enabled: bool,
) -> Result<(), String> {
    state
        .minimize_to_tray
        .store(enabled, Ordering::Relaxed);

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_visible(enabled)
            .map_err(|error| error.to_string())?;
    }

    if !enabled {
        restore_main_window(&app);
    }

    Ok(())
}

#[tauri::command]
pub fn update_tray_labels(
    app: AppHandle,
    state: State<'_, TrayState>,
    show: String,
    quit: String,
    tooltip: String,
) -> Result<(), String> {
    apply_tray_labels(&app, &state, show.trim(), quit.trim(), tooltip.trim())
}
