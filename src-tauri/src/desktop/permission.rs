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
        input_injection: super::platform::input_injection_available(),
        approved_session: approved,
        ui_automation: super::platform::ui_automation_available(),
        browser_automation: crate::computer_use::browser::browser_automation_available(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_status_separates_capability_from_approval() {
        let status = permission_status().expect("permission status");
        assert!(status.screen_capture);
        assert!(status.input_injection);
        assert!(!status.approved_session);
    }
}
