use super::types::{ControlPermissionStatus, InputEvent};

#[cfg(windows)]
mod windows;

#[cfg(windows)]
pub use windows::*;

#[cfg(not(windows))]
pub fn screen_capture_available() -> bool {
    false
}

#[cfg(not(windows))]
pub fn list_displays() -> Result<Vec<DisplayInfo>, String> {
    Err("Display enumeration is only implemented on Windows.".to_string())
}

#[cfg(not(windows))]
pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    Err("Window enumeration is only implemented on Windows.".to_string())
}

#[cfg(not(windows))]
pub fn capture_screen(_options: CaptureScreenOptions) -> Result<CaptureResult, String> {
    Err("Screen capture is only implemented on Windows.".to_string())
}

#[cfg(not(windows))]
pub fn inject_input(_event: InputEvent) -> Result<(), String> {
    Err("Input injection is only implemented on Windows.".to_string())
}

pub fn inject_input_checked(event: InputEvent) -> Result<(), String> {
    if !super::permission::is_input_approved()? {
        return Err(
            "Input injection denied. Approve the remote-control banner first.".to_string(),
        );
    }
    inject_input(event)
}

pub fn permission_status() -> Result<ControlPermissionStatus, String> {
    super::permission::permission_status()
}
