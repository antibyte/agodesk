use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use crate::access_policy::validate_shell_exec;
use crate::shell::exec::{
    ShellExecRequest, apply_minimal_environment, build_shell_session_command, kill_process_tree,
};

const MAX_SESSIONS: usize = 8;
const MAX_LINES_PER_STREAM: usize = 20_000;
const COMPLETED_TTL_SECS: u64 = 300;

fn process_manager() -> &'static Mutex<ProcessManager> {
    static PROCESS_MANAGER: OnceLock<Mutex<ProcessManager>> = OnceLock::new();
    PROCESS_MANAGER.get_or_init(|| Mutex::new(ProcessManager::default()))
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProcessStatus {
    Running,
    Exited,
    Killed,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct OutputLine {
    pub offset: u64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ShellSessionSummary {
    pub shell_session_id: String,
    pub pid: u32,
    pub status: ProcessStatus,
    pub command: String,
    pub cwd_id: String,
    pub started_at_ms: u64,
    pub exit_code: Option<i32>,
    pub stdout_lines: u64,
    pub stderr_lines: u64,
}

#[derive(Debug, Deserialize)]
pub struct ShellSessionStartRequest {
    pub command: String,
    pub cwd: String,
    pub cwd_id: String,
    pub shell: String,
    pub max_output_bytes: usize,
    pub initial_wait_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct ShellSessionStartResponse {
    pub shell_session_id: String,
    pub pid: u32,
    pub status: ProcessStatus,
    pub stdout: String,
    pub stderr: String,
    pub next_offset: u64,
    pub stdout_next_offset: u64,
    pub stderr_next_offset: u64,
}

#[derive(Debug, Deserialize)]
pub struct ShellSessionReadRequest {
    pub shell_session_id: String,
    pub offset: Option<i64>,
    pub limit: Option<usize>,
    pub wait_ms: Option<u64>,
    pub stream: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ShellSessionReadResponse {
    pub shell_session_id: String,
    pub status: ProcessStatus,
    pub lines: Vec<String>,
    pub total_lines: u64,
    pub read_from: u64,
    pub read_count: usize,
    pub remaining: u64,
    pub next_offset: u64,
    pub exit_code: Option<i32>,
    pub truncated: bool,
}

#[derive(Debug, Deserialize)]
pub struct ShellSessionInputRequest {
    pub shell_session_id: String,
    pub input: String,
    pub append_newline: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ShellSessionStopRequest {
    pub shell_session_id: String,
}

#[derive(Debug, Serialize)]
pub struct ShellSessionStopResponse {
    pub shell_session_id: String,
    pub status: ProcessStatus,
    pub exit_code: Option<i32>,
}

struct LineBuffer {
    lines: VecDeque<OutputLine>,
    next_offset: u64,
    evicted: u64,
    max_lines: usize,
}

impl LineBuffer {
    fn new(max_lines: usize) -> Self {
        Self {
            lines: VecDeque::new(),
            next_offset: 0,
            evicted: 0,
            max_lines,
        }
    }

    fn push_line(&mut self, text: String) {
        self.lines.push_back(OutputLine {
            offset: self.next_offset,
            text,
        });
        self.next_offset += 1;
        while self.lines.len() > self.max_lines {
            self.lines.pop_front();
            self.evicted += 1;
        }
    }

    fn total_lines(&self) -> u64 {
        self.next_offset
    }

    fn read(&self, offset: i64, limit: usize) -> (Vec<String>, u64, u64, bool) {
        let total = self.total_lines();
        if self.lines.is_empty() {
            return (Vec::new(), 0, 0, false);
        }

        let first_available = self.lines.front().map(|l| l.offset).unwrap_or(0);
        let start = if offset < 0 {
            total.saturating_sub((-offset) as u64)
        } else {
            offset as u64
        };
        let start = start.max(first_available);
        let truncated = offset >= 0 && (offset as u64) < first_available && self.evicted > 0;

        let mut out = Vec::new();
        for line in &self.lines {
            if line.offset < start {
                continue;
            }
            if out.len() >= limit {
                break;
            }
            out.push(line.text.clone());
        }
        let read_from = start;
        let read_count = out.len() as u64;
        let remaining = total.saturating_sub(start + read_count);
        (out, read_from, remaining, truncated)
    }
}

struct ManagedProcess {
    id: String,
    pid: u32,
    command_display: String,
    cwd_id: String,
    started_at: Instant,
    status: ProcessStatus,
    exit_code: Option<i32>,
    stdout: Arc<Mutex<LineBuffer>>,
    stderr: Arc<Mutex<LineBuffer>>,
    stdin: Option<ChildStdin>,
    child: Option<Child>,
    finished_at: Option<Instant>,
}

#[derive(Default)]
struct ProcessManager {
    sessions: HashMap<String, ManagedProcess>,
}

impl ProcessManager {
    fn cleanup_expired(&mut self) {
        let ttl = Duration::from_secs(COMPLETED_TTL_SECS);
        self.sessions.retain(|_, session| {
            if matches!(session.status, ProcessStatus::Running) {
                return true;
            }
            match session.finished_at {
                Some(finished) => finished.elapsed() < ttl,
                None => true,
            }
        });
    }

    fn reap_exited(&mut self) {
        let ids: Vec<String> = self.sessions.keys().cloned().collect();
        for id in ids {
            let Some(session) = self.sessions.get_mut(&id) else {
                continue;
            };
            if !matches!(session.status, ProcessStatus::Running) {
                continue;
            }
            if let Some(child) = session.child.as_mut() {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        session.status = ProcessStatus::Exited;
                        session.exit_code = status.code();
                        session.finished_at = Some(Instant::now());
                        session.stdin = None;
                        session.child = None;
                    }
                    Ok(None) => {}
                    Err(_) => {
                        session.status = ProcessStatus::Failed;
                        session.finished_at = Some(Instant::now());
                        session.stdin = None;
                        session.child = None;
                    }
                }
            }
        }
    }
}

fn spawn_reader(stream: impl std::io::Read + Send + 'static, buffer: Arc<Mutex<LineBuffer>>) {
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    if let Ok(mut buf) = buffer.lock() {
                        buf.push_line(text);
                    }
                }
                Err(_) => break,
            }
        }
    });
}

#[tauri::command]
pub async fn shell_session_start(
    app: AppHandle,
    request: ShellSessionStartRequest,
) -> Result<ShellSessionStartResponse, String> {
    let validated = validate_shell_exec(
        &app,
        &ShellExecRequest {
            command: request.command.clone(),
            cwd: request.cwd.clone(),
            shell: request.shell.clone(),
            timeout_ms: request.initial_wait_ms.unwrap_or(1_000).max(1),
            max_output_bytes: request.max_output_bytes.max(1),
        },
    )?;

    let initial_wait = Duration::from_millis(request.initial_wait_ms.unwrap_or(1_000));

    tauri::async_runtime::spawn_blocking(move || {
        let mut manager = process_manager().lock()
            .map_err(|_| "SHELL_SPAWN_FAILED: process manager lock poisoned".to_string())?;
        manager.cleanup_expired();
        manager.reap_exited();

        let running = manager
            .sessions
            .values()
            .filter(|s| matches!(s.status, ProcessStatus::Running))
            .count();
        if running >= MAX_SESSIONS {
            return Err("SHELL_SPAWN_FAILED: maximum parallel shell sessions reached".to_string());
        }

        let mut command = build_shell_session_command(&validated.shell, &validated.command)?;
        command
            .current_dir(&validated.cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        apply_minimal_environment(&mut command, &validated.shell);

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
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "SHELL_SPAWN_FAILED: stdout unavailable".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "SHELL_SPAWN_FAILED: stderr unavailable".to_string())?;
        let stdin = child.stdin.take();

        let stdout_buf = Arc::new(Mutex::new(LineBuffer::new(MAX_LINES_PER_STREAM)));
        let stderr_buf = Arc::new(Mutex::new(LineBuffer::new(MAX_LINES_PER_STREAM)));
        spawn_reader(stdout, Arc::clone(&stdout_buf));
        spawn_reader(stderr, Arc::clone(&stderr_buf));

        let id = format!("proc-{}", Uuid::new_v4());
        let session = ManagedProcess {
            id: id.clone(),
            pid,
            command_display: validated.command.clone(),
            cwd_id: request.cwd_id.clone(),
            started_at: Instant::now(),
            status: ProcessStatus::Running,
            exit_code: None,
            stdout: Arc::clone(&stdout_buf),
            stderr: Arc::clone(&stderr_buf),
            stdin,
            child: Some(child),
            finished_at: None,
        };
        manager.sessions.insert(id.clone(), session);

        drop(manager);
        thread::sleep(initial_wait);

        let mut manager = process_manager().lock()
            .map_err(|_| "SHELL_SPAWN_FAILED: process manager lock poisoned".to_string())?;
        manager.reap_exited();
        let session = manager
            .sessions
            .get(&id)
            .ok_or_else(|| "SHELL_SPAWN_FAILED: session lost".to_string())?;

        let stdout_guard = session
            .stdout
            .lock()
            .map_err(|_| "SHELL_SPAWN_FAILED: stdout lock poisoned".to_string())?;
        let stderr_guard = session
            .stderr
            .lock()
            .map_err(|_| "SHELL_SPAWN_FAILED: stderr lock poisoned".to_string())?;
        let stdout_text = stdout_guard
            .lines
            .iter()
            .map(|l| l.text.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        let stderr_text = stderr_guard
            .lines
            .iter()
            .map(|l| l.text.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        let stdout_next = stdout_guard.next_offset;
        let stderr_next = stderr_guard.next_offset;
        drop(stdout_guard);
        drop(stderr_guard);

        Ok(ShellSessionStartResponse {
            shell_session_id: id,
            pid,
            status: session.status.clone(),
            stdout: stdout_text,
            stderr: stderr_text,
            next_offset: stdout_next,
            stdout_next_offset: stdout_next,
            stderr_next_offset: stderr_next,
        })
    })
    .await
    .map_err(|error| format!("SHELL_SPAWN_FAILED: {error}"))?
}

#[tauri::command]
pub async fn shell_session_read(request: ShellSessionReadRequest) -> Result<ShellSessionReadResponse, String> {
    let wait_ms = request.wait_ms.unwrap_or(0).min(30_000);
    let limit = request.limit.unwrap_or(200).clamp(1, 5_000);
    let offset = request.offset.unwrap_or(0);
    let stream = request.stream.unwrap_or_else(|| "stdout".to_string());
    let id = request.shell_session_id.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let deadline = Instant::now() + Duration::from_millis(wait_ms);
        loop {
            let mut manager = process_manager().lock()
                .map_err(|_| "SHELL_ACCESS_DENIED: process manager lock poisoned".to_string())?;
            manager.reap_exited();
            let session = manager
                .sessions
                .get(&id)
                .ok_or_else(|| "SHELL_ACCESS_DENIED: shell session not found".to_string())?;

            let buffer = if stream == "stderr" {
                Arc::clone(&session.stderr)
            } else {
                Arc::clone(&session.stdout)
            };
            let status = session.status.clone();
            let exit_code = session.exit_code;
            drop(manager);

            let guard = buffer
                .lock()
                .map_err(|_| "SHELL_ACCESS_DENIED: buffer lock poisoned".to_string())?;
            let (lines, read_from, remaining, truncated) = guard.read(offset, limit);
            let total_lines = guard.total_lines();
            let next_offset = if lines.is_empty() {
                read_from
            } else {
                read_from + lines.len() as u64
            };
            let has_data = !lines.is_empty();
            drop(guard);

            if has_data || wait_ms == 0 || Instant::now() >= deadline || !matches!(status, ProcessStatus::Running)
            {
                return Ok(ShellSessionReadResponse {
                    shell_session_id: id,
                    status,
                    lines,
                    total_lines,
                    read_from,
                    read_count: (next_offset - read_from) as usize,
                    remaining,
                    next_offset,
                    exit_code,
                    truncated,
                });
            }
            thread::sleep(Duration::from_millis(50));
        }
    })
    .await
    .map_err(|error| format!("SHELL_SPAWN_FAILED: {error}"))?
}

#[tauri::command]
pub async fn shell_session_input(request: ShellSessionInputRequest) -> Result<ShellSessionSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut manager = process_manager().lock()
            .map_err(|_| "SHELL_ACCESS_DENIED: process manager lock poisoned".to_string())?;
        manager.reap_exited();
        let session = manager
            .sessions
            .get_mut(&request.shell_session_id)
            .ok_or_else(|| "SHELL_ACCESS_DENIED: shell session not found".to_string())?;
        if !matches!(session.status, ProcessStatus::Running) {
            return Err("SHELL_ACCESS_DENIED: shell session is not running".to_string());
        }
        let stdin = session
            .stdin
            .as_mut()
            .ok_or_else(|| "SHELL_ACCESS_DENIED: shell session stdin unavailable".to_string())?;
        let mut payload = request.input;
        if request.append_newline.unwrap_or(true) && !payload.ends_with('\n') {
            payload.push('\n');
        }
        stdin
            .write_all(payload.as_bytes())
            .and_then(|_| stdin.flush())
            .map_err(|error| format!("SHELL_SPAWN_FAILED: stdin write failed: {error}"))?;
        Ok(summary_of(session))
    })
    .await
    .map_err(|error| format!("SHELL_SPAWN_FAILED: {error}"))?
}

#[tauri::command]
pub async fn shell_session_stop(request: ShellSessionStopRequest) -> Result<ShellSessionStopResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut manager = process_manager().lock()
            .map_err(|_| "SHELL_ACCESS_DENIED: process manager lock poisoned".to_string())?;
        let session = manager
            .sessions
            .get_mut(&request.shell_session_id)
            .ok_or_else(|| "SHELL_ACCESS_DENIED: shell session not found".to_string())?;
        if matches!(session.status, ProcessStatus::Running) {
            kill_process_tree(session.pid);
            if let Some(mut child) = session.child.take() {
                let _ = child.wait();
            }
            session.status = ProcessStatus::Killed;
            session.exit_code = session.exit_code.or(Some(-1));
            session.finished_at = Some(Instant::now());
            session.stdin = None;
        }
        Ok(ShellSessionStopResponse {
            shell_session_id: session.id.clone(),
            status: session.status.clone(),
            exit_code: session.exit_code,
        })
    })
    .await
    .map_err(|error| format!("SHELL_SPAWN_FAILED: {error}"))?
}

#[tauri::command]
pub async fn shell_session_list() -> Result<Vec<ShellSessionSummary>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut manager = process_manager().lock()
            .map_err(|_| "SHELL_ACCESS_DENIED: process manager lock poisoned".to_string())?;
        manager.cleanup_expired();
        manager.reap_exited();
        let mut out: Vec<_> = manager.sessions.values().map(summary_of).collect();
        out.sort_by_key(|a| a.started_at_ms);
        Ok(out)
    })
    .await
    .map_err(|error| format!("SHELL_SPAWN_FAILED: {error}"))?
}

fn summary_of(session: &ManagedProcess) -> ShellSessionSummary {
    let stdout_lines = session
        .stdout
        .lock()
        .map(|b| b.total_lines())
        .unwrap_or(0);
    let stderr_lines = session
        .stderr
        .lock()
        .map(|b| b.total_lines())
        .unwrap_or(0);
    ShellSessionSummary {
        shell_session_id: session.id.clone(),
        pid: session.pid,
        status: session.status.clone(),
        command: session.command_display.clone(),
        cwd_id: session.cwd_id.clone(),
        started_at_ms: session.started_at.elapsed().as_millis() as u64,
        exit_code: session.exit_code,
        stdout_lines,
        stderr_lines,
    }
}
