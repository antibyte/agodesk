import { invoke } from "@tauri-apps/api/core";
import type { ShellExecResult, ShellKind } from "../types/protocol";

export interface ShellExecInvokeRequest {
  command: string;
  cwd: string;
  shell: ShellKind;
  timeoutMs: number;
  maxOutputBytes: number;
}

export async function invokeShellExec(request: ShellExecInvokeRequest): Promise<ShellExecResult> {
  return invoke<ShellExecResult>("shell_exec", {
    request: {
      command: request.command,
      cwd: request.cwd,
      shell: request.shell,
      timeout_ms: request.timeoutMs,
      max_output_bytes: request.maxOutputBytes,
    },
  });
}

export interface ShellSessionStartInvokeRequest {
  command: string;
  cwd: string;
  cwdId: string;
  shell: ShellKind;
  maxOutputBytes: number;
  initialWaitMs?: number;
}

export interface ShellSessionStartResult {
  shell_session_id: string;
  pid: number;
  status: string;
  stdout: string;
  stderr: string;
  next_offset: number;
  stdout_next_offset: number;
  stderr_next_offset: number;
}

export interface ShellSessionReadInvokeRequest {
  shellSessionId: string;
  offset?: number;
  limit?: number;
  waitMs?: number;
  stream?: "stdout" | "stderr";
}

export interface ShellSessionReadResult {
  shell_session_id: string;
  status: string;
  lines: string[];
  total_lines: number;
  read_from: number;
  read_count: number;
  remaining: number;
  next_offset: number;
  exit_code?: number | null;
  truncated: boolean;
}

export interface ShellSessionInputInvokeRequest {
  shellSessionId: string;
  input: string;
  appendNewline?: boolean;
}

export interface ShellSessionStopInvokeRequest {
  shellSessionId: string;
}

export interface ShellSessionSummary {
  shell_session_id: string;
  pid: number;
  status: string;
  command: string;
  cwd_id: string;
  started_at_ms: number;
  exit_code?: number | null;
  stdout_lines: number;
  stderr_lines: number;
}

export async function invokeShellSessionStart(
  request: ShellSessionStartInvokeRequest,
): Promise<ShellSessionStartResult> {
  return invoke<ShellSessionStartResult>("shell_session_start", {
    request: {
      command: request.command,
      cwd: request.cwd,
      cwd_id: request.cwdId,
      shell: request.shell,
      max_output_bytes: request.maxOutputBytes,
      initial_wait_ms: request.initialWaitMs,
    },
  });
}

export async function invokeShellSessionRead(
  request: ShellSessionReadInvokeRequest,
): Promise<ShellSessionReadResult> {
  return invoke<ShellSessionReadResult>("shell_session_read", {
    request: {
      shell_session_id: request.shellSessionId,
      offset: request.offset,
      limit: request.limit,
      wait_ms: request.waitMs,
      stream: request.stream,
    },
  });
}

export async function invokeShellSessionInput(
  request: ShellSessionInputInvokeRequest,
): Promise<ShellSessionSummary> {
  return invoke<ShellSessionSummary>("shell_session_input", {
    request: {
      shell_session_id: request.shellSessionId,
      input: request.input,
      append_newline: request.appendNewline,
    },
  });
}

export async function invokeShellSessionStop(
  request: ShellSessionStopInvokeRequest,
): Promise<{ shell_session_id: string; status: string; exit_code?: number | null }> {
  return invoke("shell_session_stop", {
    request: {
      shell_session_id: request.shellSessionId,
    },
  });
}

export async function invokeShellSessionList(): Promise<ShellSessionSummary[]> {
  return invoke<ShellSessionSummary[]>("shell_session_list");
}
