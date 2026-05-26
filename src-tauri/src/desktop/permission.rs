use std::sync::{Mutex, OnceLock};

static APPROVED_INPUT: OnceLock<Mutex<bool>> = OnceLock::new();

fn approved_input() -> &'static Mutex<bool> {
    APPROVED_INPUT.get_or_init(|| Mutex::new(false))
}

pub fn is_input_approved() -> Result<bool, String> {
    approved_input()
        .lock()
        .map(|guard| *guard)
        .map_err(|_| "Failed to read approval state.".to_string())
}

pub fn set_input_approved(approved: bool) -> Result<(), String> {
    let mut guard = approved_input()
        .lock()
        .map_err(|_| "Failed to update approval state.".to_string())?;
    *guard = approved;
    Ok(())
}

pub fn permission_status() -> Result<super::types::ControlPermissionStatus, String> {
    let approved = is_input_approved()?;
    Ok(super::types::ControlPermissionStatus {
        screen_capture: super::platform::screen_capture_available(),
        input_injection: approved,
        approved_session: approved,
    })
}
