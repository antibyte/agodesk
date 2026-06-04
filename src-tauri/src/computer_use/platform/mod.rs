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
pub fn ui_automation_available() -> bool {
    false
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
pub fn ui_tree_for_window(_window_id: Option<&str>) -> Result<super::types::UiTreeResult, String> {
    Err("UI automation is not implemented on this platform.".to_string())
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
pub fn perform_ui_action(
    _params: &super::types::UiActionParams,
) -> Result<super::types::UiActionResult, String> {
    Err("UI automation is not implemented on this platform.".to_string())
}
