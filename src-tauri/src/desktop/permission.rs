use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const APPROVAL_TTL: Duration = Duration::from_secs(60);

static APPROVED_INPUT_UNTIL: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
static APPROVED_CAPTURE_UNTIL: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();

fn approved_input_until() -> &'static Mutex<Option<Instant>> {
    APPROVED_INPUT_UNTIL.get_or_init(|| Mutex::new(None))
}

fn approved_capture_until() -> &'static Mutex<Option<Instant>> {
    APPROVED_CAPTURE_UNTIL.get_or_init(|| Mutex::new(None))
}

fn is_approved(until: &Mutex<Option<Instant>>) -> Result<bool, String> {
    let guard = until
        .lock()
        .map_err(|_| "Failed to read approval state.".to_string())?;
    Ok(match *guard {
        Some(deadline) => Instant::now() < deadline,
        None => false,
    })
}

fn set_approved(until: &Mutex<Option<Instant>>, approved: bool) -> Result<(), String> {
    let mut guard = until
        .lock()
        .map_err(|_| "Failed to update approval state.".to_string())?;
    *guard = if approved {
        Some(Instant::now() + APPROVAL_TTL)
    } else {
        None
    };
    Ok(())
}

pub fn is_input_approved() -> Result<bool, String> {
    is_approved(approved_input_until())
}

pub fn set_input_approved(approved: bool) -> Result<(), String> {
    set_approved(approved_input_until(), approved)
}

pub fn is_screen_capture_approved() -> Result<bool, String> {
    is_approved(approved_capture_until())
}

pub fn set_screen_capture_approved(approved: bool) -> Result<(), String> {
    set_approved(approved_capture_until(), approved)
}

pub fn clear_desktop_approvals() -> Result<(), String> {
    set_input_approved(false)?;
    set_screen_capture_approved(false)?;
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

    fn set_until_for_tests(slot: &Mutex<Option<Instant>>, until: Option<Instant>) {
        let mut guard = slot.lock().expect("lock");
        *guard = until;
    }

    #[test]
    fn permission_status_separates_capability_from_approval() {
        clear_desktop_approvals().expect("clear");
        let status = permission_status().expect("permission status");
        assert!(status.screen_capture);
        assert!(status.input_injection);
        assert!(!status.approved_session);
    }

    #[test]
    fn input_approval_is_true_within_ttl_and_false_after_expiry() {
        clear_desktop_approvals().expect("clear");
        set_input_approved(true).expect("approve");
        assert!(is_input_approved().expect("read"));

        set_until_for_tests(
            approved_input_until(),
            Some(Instant::now() - Duration::from_secs(1)),
        );
        assert!(!is_input_approved().expect("expired"));
    }

    #[test]
    fn screen_capture_approval_requires_explicit_grant_and_expires() {
        clear_desktop_approvals().expect("clear");
        assert!(!is_screen_capture_approved().expect("read"));

        set_screen_capture_approved(true).expect("approve");
        assert!(is_screen_capture_approved().expect("read"));

        set_until_for_tests(
            approved_capture_until(),
            Some(Instant::now() - Duration::from_secs(1)),
        );
        assert!(!is_screen_capture_approved().expect("expired"));
    }

    #[test]
    fn clear_desktop_approvals_clears_input_and_capture() {
        set_input_approved(true).expect("input");
        set_screen_capture_approved(true).expect("capture");
        clear_desktop_approvals().expect("clear");
        assert!(!is_input_approved().expect("input"));
        assert!(!is_screen_capture_approved().expect("capture"));
    }
}
