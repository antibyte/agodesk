mod permission;
mod platform;
pub mod types;

pub use permission::{
    clear_desktop_approvals, is_input_approved, is_screen_capture_approved, set_input_approved,
    set_screen_capture_approved,
};
pub use platform::{
    capture_screen, inject_input_checked, list_displays, list_windows, permission_status,
};
pub use types::*;
