mod permission;
mod platform;
pub mod types;

pub use permission::set_input_approved;
pub use platform::{
    capture_screen, inject_input_checked, list_displays, list_windows, permission_status,
};
pub use types::*;
