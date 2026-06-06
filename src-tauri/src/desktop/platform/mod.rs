use super::types::{ControlPermissionStatus, InputEvent};

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::*;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::*;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
pub fn screen_capture_available() -> bool {
    false
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
pub fn ui_automation_available() -> bool {
    false
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
pub fn input_injection_available() -> bool {
    false
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
pub fn list_displays() -> Result<Vec<super::types::DisplayInfo>, String> {
    Err("Display enumeration is not implemented on this platform.".to_string())
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
pub fn list_windows() -> Result<Vec<super::types::WindowInfo>, String> {
    Err("Window enumeration is not implemented on this platform.".to_string())
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
pub fn capture_screen(
    _options: super::types::CaptureScreenOptions,
) -> Result<super::types::CaptureResult, String> {
    Err("Screen capture is not implemented on this platform.".to_string())
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
pub fn inject_input(_event: InputEvent) -> Result<(), String> {
    Err("Input injection is not implemented on this platform.".to_string())
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
