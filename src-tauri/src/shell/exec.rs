use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct ShellExecRequest {
    pub command: String,
    pub cwd: String,
    pub shell: String,
    pub timeout_ms: u64,
    pub max_output_bytes: usize,
}

#[derive(Debug, Serialize)]
pub struct ShellExecResponse {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
    pub timed_out: bool,
    pub truncated: bool,
    pub shell: String,
}

#[tauri::command]
pub async fn shell_exec(request: ShellExecRequest) -> Result<ShellExecResponse, String> {
    if request.command.trim().is_empty() {
        return Err("SHELL_COMMAND_REJECTED: command is empty".to_string());
    }
    if request.max_output_bytes == 0 {
        return Err("SHELL_OUTPUT_TOO_LARGE: output limit is zero".to_string());
    }

    let cwd = Path::new(&request.cwd);
    if !cwd.is_dir() {
        return Err("SHELL_ACCESS_DENIED: working directory is unavailable".to_string());
    }

    let shell = request.shell.trim().to_lowercase();
    let timeout = Duration::from_millis(request.timeout_ms.max(1));

    tauri::async_runtime::spawn_blocking(move || run_shell_command(request, &shell, timeout))
        .await
        .map_err(|error| format!("SHELL_SPAWN_FAILED: {error}"))?
}

fn run_shell_command(
    request: ShellExecRequest,
    shell: &str,
    timeout: Duration,
) -> Result<ShellExecResponse, String> {
    let started = Instant::now();
    let mut command = build_shell_command(shell, &request.command)?;
    command
        .current_dir(&request.cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    apply_minimal_environment(&mut command, shell);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        command.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("SHELL_SPAWN_FAILED: {error}"))?;

    let pid = child.id();

    let mut stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| "SHELL_SPAWN_FAILED: stdout unavailable".to_string())?;
    let mut stderr_pipe = child
        .stderr
        .take()
        .ok_or_else(|| "SHELL_SPAWN_FAILED: stderr unavailable".to_string())?;

    let max_bytes = request.max_output_bytes;
    let stdout_handle = std::thread::spawn(move || read_limited_output(&mut stdout_pipe, max_bytes));
    let stderr_handle = std::thread::spawn(move || read_limited_output(&mut stderr_pipe, max_bytes));

    let mut timed_out = false;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {
                if started.elapsed() >= timeout {
                    timed_out = true;
                    kill_process_tree(pid);
                    let _ = child.wait();
                    break None;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(error) => {
                kill_process_tree(pid);
                return Err(format!("SHELL_SPAWN_FAILED: {error}"));
            }
        }
    };

    let (stdout_text, stdout_truncated, stdout_rejected) = stdout_handle
        .join()
        .map_err(|_| "SHELL_SPAWN_FAILED: stdout reader failed".to_string())?;
    let (stderr_text, stderr_truncated, stderr_rejected) = stderr_handle
        .join()
        .map_err(|_| "SHELL_SPAWN_FAILED: stderr reader failed".to_string())?;

    if stdout_rejected || stderr_rejected {
        return Err("SHELL_OUTPUT_TOO_LARGE: output exceeded max_output_bytes".to_string());
    }

    let truncated = stdout_truncated || stderr_truncated;

    if timed_out {
        return Err(format!(
            "SHELL_TIMEOUT: command exceeded timeout ({} ms)",
            request.timeout_ms
        ));
    }

    let exit_code = status
        .and_then(|value| value.code())
        .unwrap_or(-1);

    Ok(ShellExecResponse {
        exit_code,
        stdout: stdout_text,
        stderr: stderr_text,
        duration_ms: started.elapsed().as_millis() as u64,
        timed_out: false,
        truncated,
        shell: shell.to_string(),
    })
}

fn build_shell_command(shell: &str, command: &str) -> Result<Command, String> {
    match shell {
        "powershell" => {
            let mut cmd = Command::new("powershell");
            cmd.args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                command,
            ]);
            Ok(cmd)
        }
        "cmd" => {
            let mut cmd = Command::new("cmd");
            cmd.args(["/C", command]);
            Ok(cmd)
        }
        "bash" => {
            let mut cmd = Command::new("bash");
            cmd.args(["-lc", command]);
            Ok(cmd)
        }
        "zsh" => {
            let mut cmd = Command::new("zsh");
            cmd.args(["-lc", command]);
            Ok(cmd)
        }
        "sh" => {
            let mut cmd = Command::new("sh");
            cmd.args(["-c", command]);
            Ok(cmd)
        }
        _ => Err(format!("SHELL_SPAWN_FAILED: unsupported shell '{shell}'")),
    }
}

fn apply_minimal_environment(command: &mut Command, shell: &str) {
    command.env_clear();
    if cfg!(windows) {
        if let Ok(system_root) = std::env::var("SystemRoot") {
            command.env("SystemRoot", &system_root);
            command.env("WINDIR", &system_root);
        }
        if let Ok(path) = std::env::var("PATH") {
            command.env("PATH", path);
        }
        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            command.env("USERPROFILE", user_profile);
        }
        if shell == "powershell" {
            command.env("PSModulePath", "");
        }
    } else {
        command.env("PATH", "/usr/bin:/bin:/usr/local/bin");
        if let Ok(home) = std::env::var("HOME") {
            command.env("HOME", home);
        }
        command.env("LANG", "C.UTF-8");
    }
}

fn read_limited_output(reader: &mut impl Read, max_bytes: usize) -> (String, bool, bool) {
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 4096];
    let mut rejected = false;

    loop {
        match reader.read(&mut chunk) {
            Ok(0) => break,
            Ok(count) => {
                let remaining = max_bytes.saturating_sub(buffer.len());
                if remaining == 0 {
                    if !is_valid_utf8_prefix(&buffer) {
                        rejected = true;
                        break;
                    }
                    break;
                }
                if count <= remaining {
                    buffer.extend_from_slice(&chunk[..count]);
                } else {
                    buffer.extend_from_slice(&chunk[..remaining]);
                    if !is_valid_utf8_prefix(&buffer) {
                        rejected = true;
                    }
                    break;
                }
            }
            Err(_) => break,
        }
    }

    let truncated = buffer.len() >= max_bytes;
    let text = String::from_utf8_lossy(&buffer).into_owned();
    (text, truncated, rejected)
}

fn is_valid_utf8_prefix(bytes: &[u8]) -> bool {
    std::str::from_utf8(bytes).is_ok()
}

fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    #[cfg(unix)]
    {
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
            libc::kill(pid as i32, libc::SIGKILL);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_limited_output_truncates_safely() {
        let data = b"hello world";
        let mut cursor = std::io::Cursor::new(data);
        let (text, truncated, rejected) = read_limited_output(&mut cursor, 5);
        assert_eq!(text, "hello");
        assert!(truncated);
        assert!(!rejected);
    }
}
