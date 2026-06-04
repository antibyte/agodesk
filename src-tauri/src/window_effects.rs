#[cfg(windows)]
pub fn apply_main_window_effects(window: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWM_WINDOW_CORNER_PREFERENCE,
    };

    let _ = window.set_shadow(false);

    let Ok(hwnd) = window.hwnd() else {
        return;
    };

    let preference = DWM_WINDOW_CORNER_PREFERENCE(2); // DWMWCP_ROUND
    unsafe {
        let _ = DwmSetWindowAttribute(
            HWND(hwnd.0 as _),
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &preference as *const _ as *const _,
            std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
        );
    }
}

#[cfg(not(windows))]
pub fn apply_main_window_effects(window: &tauri::WebviewWindow) {
    let _ = window.set_shadow(false);
}
