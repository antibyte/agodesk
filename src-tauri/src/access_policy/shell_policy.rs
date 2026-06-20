use crate::access_policy::store::{ShellAccessPolicy, load_shell_access_policy};
use crate::files::access::{canonicalize_path, is_within_root};
use crate::shell::exec::ShellExecRequest;
use regex::Regex;
use tauri::AppHandle;

pub struct ValidatedShellExec {
    pub command: String,
    pub cwd: String,
    pub shell: String,
    pub timeout_ms: u64,
    pub max_output_bytes: usize,
}

pub fn validate_shell_exec(app: &AppHandle, request: &ShellExecRequest) -> Result<ValidatedShellExec, String> {
    let policy = load_shell_access_policy(app);
    if !policy.is_configured() {
        return Err("SHELL_ACCESS_DISABLED".to_string());
    }

    let command = request.command.trim();
    if command.is_empty() {
        return Err("SHELL_COMMAND_REJECTED: command is empty".to_string());
    }
    if command.len() > policy.max_command_chars {
        return Err("SHELL_COMMAND_REJECTED: command exceeds max_command_chars".to_string());
    }
    if is_command_denied(command) {
        return Err("SHELL_COMMAND_REJECTED: command rejected by local policy".to_string());
    }

    let shell = request.shell.trim().to_ascii_lowercase();
    if shell.is_empty() || !policy.shells.iter().any(|entry| entry == &shell) {
        return Err("SHELL_SPAWN_FAILED: shell is not allowed by local settings".to_string());
    }
    if !policy.selected_shell.is_empty() && shell != policy.selected_shell {
        return Err("SHELL_SPAWN_FAILED: shell does not match selected shell".to_string());
    }

    let cwd = validate_working_directory(&policy, &request.cwd)?;

    let timeout_ms = request.timeout_ms.max(1).min(policy.max_timeout_ms);
    let max_output_bytes = if request.max_output_bytes == 0 {
        return Err("SHELL_OUTPUT_TOO_LARGE: output limit is zero".to_string());
    } else {
        request.max_output_bytes.min(policy.max_output_bytes)
    };

    Ok(ValidatedShellExec {
        command: command.to_string(),
        cwd,
        shell,
        timeout_ms,
        max_output_bytes,
    })
}

fn validate_working_directory(policy: &ShellAccessPolicy, requested_cwd: &str) -> Result<String, String> {
    let requested = canonicalize_path(std::path::Path::new(requested_cwd.trim()), true)
        .map_err(|_| "SHELL_ACCESS_DENIED: working directory is unavailable".to_string())?;

    for entry in &policy.allowed_cwds {
        let root = match canonicalize_path(std::path::Path::new(&entry.canonical_path), true) {
            Ok(path) => path,
            Err(_) => continue,
        };
        if is_within_root(&root, &requested) {
            return Ok(requested.to_string_lossy().into_owned());
        }
    }

    Err("SHELL_ACCESS_DENIED: working directory is outside allowed roots".to_string())
}

pub fn is_command_denied(command: &str) -> bool {
    static PATTERNS: &[&str] = &[
        r"\0",
        r"[\r\n\u{2028}\u{2029}]",
        r"(?i)\bformat\s+[a-z]:",
        r"(?i)\brm\s+(-[^\s]*\s+)*(-[^\s]*\s+)*/(\s|$)",
        r"(?i)\bdel\s+/[sfq]",
        r"(?i)\bRemove-Item\s+.+-Recurse",
        r"(?i)\bInvoke-Expression\b",
        r"(?i)\biex\b",
        r"(?i)\bStart-Process\b.+-WindowStyle\s+Hidden",
    ];

    PATTERNS.iter().any(|pattern| {
        Regex::new(pattern)
            .ok()
            .is_some_and(|regex| regex.is_match(command))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_command_denied_blocks_destructive_commands() {
        assert!(!is_command_denied("git status"));
        assert!(is_command_denied("format c:"));
        assert!(is_command_denied("echo hello\nrm -rf /"));
        assert!(is_command_denied("Remove-Item . -Recurse"));
    }
}
