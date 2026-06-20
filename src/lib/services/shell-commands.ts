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
