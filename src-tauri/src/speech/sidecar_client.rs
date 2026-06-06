use super::types::{SpeechSidecarRequest, SpeechSidecarResponse};
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

static REQUEST_COUNTER: AtomicU64 = AtomicU64::new(1);

fn next_request_id() -> String {
    REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed).to_string()
}

pub fn sidecar_enabled() -> bool {
    cfg!(feature = "speech-sidecar")
        || std::env::var("AGODESK_SPEECH_SIDECAR")
            .map(|value| value == "1")
            .unwrap_or(false)
}

fn sidecar_binary_path() -> String {
    std::env::current_exe()
        .ok()
        .and_then(|path| {
            path.parent().map(|dir| {
                dir.join(if cfg!(windows) {
                    "agodesk-speech.exe"
                } else {
                    "agodesk-speech"
                })
                .to_string_lossy()
                .to_string()
            })
        })
        .unwrap_or_else(|| "agodesk-speech".to_string())
}

pub fn send_speech_sidecar_request(
    op: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    if sidecar_enabled() {
        return send_speech_sidecar_request_spawn(op, params);
    }
    dispatch_speech_in_process(op, params)
}

pub fn dispatch_speech_op(op: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
    send_speech_sidecar_request(op, params)
}

fn dispatch_speech_in_process(
    op: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    use super::handler::handle_speech_request;
    use super::types::SpeechSidecarRequest;

    let request = SpeechSidecarRequest {
        id: "inproc".to_string(),
        op: op.to_string(),
        params,
    };
    let response = handle_speech_request(request);
    if response.ok {
        response
            .data
            .ok_or_else(|| "Speech handler response missing data.".to_string())
    } else {
        Err(response
            .error
            .unwrap_or_else(|| "Speech handler request failed.".to_string()))
    }
}

fn send_speech_sidecar_request_spawn(
    op: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let request = SpeechSidecarRequest {
        id: next_request_id(),
        op: op.to_string(),
        params,
    };

    let mut child = Command::new(sidecar_binary_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to spawn agodesk-speech: {error}"))?;

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

    let response: SpeechSidecarResponse =
        serde_json::from_str(&line).map_err(|error| format!("Invalid sidecar response: {error}"))?;
    if !response.ok {
        return Err(response
            .error
            .unwrap_or_else(|| "Speech sidecar request failed.".to_string()));
    }
    response
        .data
        .ok_or_else(|| "Speech sidecar response missing data.".to_string())
}
