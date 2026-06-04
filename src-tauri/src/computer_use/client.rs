use crate::computer_use::types::{UiActionParams, UiActionResult, UiTreeResult, WorkerRequest, WorkerResponse};
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

pub fn sidecar_enabled() -> bool {
    cfg!(feature = "computer-use-sidecar")
        || std::env::var("AGODESK_COMPUTER_USE_SIDECAR")
            .map(|value| value == "1")
            .unwrap_or(false)
}

pub fn dispatch_ui_tree(window_id: Option<&str>) -> Result<UiTreeResult, String> {
    if sidecar_enabled() {
        let response = send_worker_request(WorkerRequest::UiTree {
            window_id: window_id.map(str::to_string),
        })?;
        return serde_json::from_value(response).map_err(|error| error.to_string());
    }
    crate::computer_use::platform::ui_tree_for_window(window_id)
}

pub fn dispatch_ui_action(params: &UiActionParams) -> Result<UiActionResult, String> {
    if sidecar_enabled() {
        let response = send_worker_request(WorkerRequest::UiAction(params.clone()))?;
        return serde_json::from_value(response).map_err(|error| error.to_string());
    }
    crate::computer_use::platform::perform_ui_action(params)
}

fn send_worker_request(request: WorkerRequest) -> Result<serde_json::Value, String> {
    let mut child = Command::new(sidecar_binary_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to spawn agodesk-worker: {error}"))?;

    {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "Sidecar stdin unavailable.".to_string())?;
        let payload = serde_json::to_string(&request).map_err(|error| error.to_string())?;
        writeln!(stdin, "{payload}").map_err(|error| error.to_string())?;
        stdin.flush().map_err(|error| error.to_string())?;
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Sidecar stdout unavailable.".to_string())?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|error| format!("Sidecar read failed: {error}"))?;
    let _ = child.wait();

    let response: WorkerResponse =
        serde_json::from_str(&line).map_err(|error| format!("Invalid sidecar response: {error}"))?;
    if !response.success {
        return Err(response
            .error
            .unwrap_or_else(|| "Sidecar request failed.".to_string()));
    }
    response
        .data
        .ok_or_else(|| "Sidecar response missing data.".to_string())
}

fn sidecar_binary_path() -> String {
    std::env::current_exe()
        .ok()
        .and_then(|path| {
            path.parent().map(|dir| {
                dir.join(if cfg!(windows) {
                    "agodesk-worker.exe"
                } else {
                    "agodesk-worker"
                })
                .to_string_lossy()
                .to_string()
            })
        })
        .unwrap_or_else(|| "agodesk-worker".to_string())
}
