use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, Window, WindowEvent};

pub struct TrayState {
    pub minimize_to_tray: AtomicBool,
    tray: Mutex<Option<TrayIcon>>,
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            minimize_to_tray: AtomicBool::new(false),
            tray: Mutex::new(None),
        }
    }
}

pub fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.set_skip_taskbar(false);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

fn hide_main_window_to_tray(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.set_skip_taskbar(true);
    let _ = window.hide();
}

pub fn setup_tray(app: &AppHandle, state: &TrayState) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "tray-show", "agodesk öffnen", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "tray-quit", "Beenden", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let icon = app
        .default_window_icon()
        .ok_or_else(|| tauri::Error::Io(std::io::Error::other("Missing default window icon.")))?
        .clone();

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("agodesk")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray-show" => show_main_window(app),
            "tray-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    let _ = tray.set_visible(false);
    *state.tray.lock().expect("tray mutex poisoned") = Some(tray);
    Ok(())
}

pub fn handle_window_event(window: &Window, event: &WindowEvent, state: &TrayState) {
    if !state.minimize_to_tray.load(Ordering::Relaxed) {
        return;
    }

    match event {
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            hide_main_window_to_tray(window.app_handle());
        }
        WindowEvent::Resized(_) => {
            if window.is_minimized().unwrap_or(false) {
                hide_main_window_to_tray(window.app_handle());
            }
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

    if let Some(tray) = state
        .tray
        .lock()
        .map_err(|error| error.to_string())?
        .as_ref()
    {
        tray.set_visible(enabled)
            .map_err(|error| error.to_string())?;
    }

    if !enabled {
        show_main_window(&app);
    }

    Ok(())
}
