import { invoke } from "@tauri-apps/api/core";
import type { ShellAccessCwd, ShellAccessSettings, ShellExecParams, ShellKind } from "../types/protocol";
import { shellAccessIsConfigured } from "../types/protocol";
import { buildPathDisplay } from "./file-access";

export interface ResolvedShellCwd {
  cwdId: string;
  label: string;
  canonicalPath: string;
  pathDisplay: string;
}

export interface ShellValidationSuccess {
  ok: true;
  command: string;
  cwd: ResolvedShellCwd;
  timeoutMs: number;
  shell: ShellKind;
}

export interface ShellValidationFailure {
  ok: false;
  code:
    | "SHELL_ACCESS_DISABLED"
    | "SHELL_ACCESS_DENIED"
    | "SHELL_COMMAND_REJECTED"
    | "SHELL_SPAWN_FAILED";
  message: string;
}

export type ShellValidationResult = ShellValidationSuccess | ShellValidationFailure;

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\0/,
  /[\r\n\u2028\u2029]/,
  /\bformat\s+[a-z]:/i,
  /\brm\s+(-[^\s]*\s+)*(-[^\s]*\s+)*\/(\s|$)/i,
  /\bdel\s+\/[sfq]/i,
  /\bRemove-Item\s+.+-Recurse/i,
  /\bInvoke-Expression\b/i,
  /\biex\b/i,
  /\bStart-Process\b.+-WindowStyle\s+Hidden/i,
];

function normalizePathForCompare(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function isPathWithinRoot(root: string, target: string): boolean {
  const rootNorm = normalizePathForCompare(root);
  const targetNorm = normalizePathForCompare(target);
  if (targetNorm === rootNorm) {
    return true;
  }
  return targetNorm.startsWith(`${rootNorm}/`);
}

async function canonicalizeExistingPath(path: string): Promise<string | null> {
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return await invoke<string>("canonicalize_folder_path", { path: trimmed });
  } catch {
    return null;
  }
}

export function createShellCwdId(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = crypto.randomUUID().slice(0, 8);
  return slug ? `${slug}-${suffix}` : `cwd-${suffix}`;
}

export function cloneShellAccessSettings(source: ShellAccessSettings): ShellAccessSettings {
  return {
    ...source,
    allowedCwds: source.allowedCwds.map((cwd) => ({ ...cwd })),
    shells: [...source.shells],
  };
}

export function isCommandDenied(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) {
    return true;
  }
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function clampShellTimeout(
  requested: number | undefined,
  settings: ShellAccessSettings,
): number {
  const fallback = settings.defaultTimeoutMs;
  const raw = typeof requested === "number" && Number.isFinite(requested) ? requested : fallback;
  return Math.min(settings.maxTimeoutMs, Math.max(1, raw));
}

export async function resolveShellWorkingDirectory(
  settings: ShellAccessSettings,
  params: ShellExecParams,
): Promise<{ ok: true; cwd: ResolvedShellCwd } | ShellValidationFailure> {
  if (!shellAccessIsConfigured(settings)) {
    return {
      ok: false,
      code: "SHELL_ACCESS_DISABLED",
      message: "Remote shell is disabled in agodesk settings.",
    };
  }

  const allowed = settings.allowedCwds;
  if (params.cwd_id) {
    const match = allowed.find((cwd) => cwd.cwdId === params.cwd_id);
    if (!match) {
      return {
        ok: false,
        code: "SHELL_ACCESS_DENIED",
        message: "Unknown shell working directory.",
      };
    }
    const canonical = await canonicalizeExistingPath(match.canonicalPath);
    if (!canonical) {
      return {
        ok: false,
        code: "SHELL_ACCESS_DENIED",
        message: "Configured working directory is unavailable.",
      };
    }
    return {
      ok: true,
      cwd: {
        cwdId: match.cwdId,
        label: match.label,
        canonicalPath: canonical,
        pathDisplay: match.pathDisplay,
      },
    };
  }

  if (params.cwd) {
    const requestedCanonical = await canonicalizeExistingPath(params.cwd);
    if (!requestedCanonical) {
      return {
        ok: false,
        code: "SHELL_ACCESS_DENIED",
        message: "Requested working directory is invalid or unavailable.",
      };
    }
    for (const entry of allowed) {
      const rootCanonical = await canonicalizeExistingPath(entry.canonicalPath);
      if (!rootCanonical) {
        continue;
      }
      if (isPathWithinRoot(rootCanonical, requestedCanonical)) {
        return {
          ok: true,
          cwd: {
            cwdId: entry.cwdId,
            label: entry.label,
            canonicalPath: requestedCanonical,
            pathDisplay: entry.pathDisplay,
          },
        };
      }
    }
    return {
      ok: false,
      code: "SHELL_ACCESS_DENIED",
      message: "Requested working directory is outside allowed roots.",
    };
  }

  const defaultId =
    settings.defaultCwd && allowed.some((cwd) => cwd.cwdId === settings.defaultCwd)
      ? settings.defaultCwd
      : allowed[0]?.cwdId;
  const fallback = allowed.find((cwd) => cwd.cwdId === defaultId) ?? allowed[0];
  if (!fallback) {
    return {
      ok: false,
      code: "SHELL_ACCESS_DISABLED",
      message: "No shell working directories configured.",
    };
  }

  const canonical = await canonicalizeExistingPath(fallback.canonicalPath);
  if (!canonical) {
    return {
      ok: false,
      code: "SHELL_ACCESS_DENIED",
      message: "Default working directory is unavailable.",
    };
  }

  return {
    ok: true,
    cwd: {
      cwdId: fallback.cwdId,
      label: fallback.label,
      canonicalPath: canonical,
      pathDisplay: fallback.pathDisplay,
    },
  };
}

export async function validateShellExecRequest(
  settings: ShellAccessSettings,
  params: ShellExecParams,
  options: { negotiated: boolean },
): Promise<ShellValidationResult> {
  if (!shellAccessIsConfigured(settings)) {
    return {
      ok: false,
      code: "SHELL_ACCESS_DISABLED",
      message: "Remote shell is disabled in agodesk settings.",
    };
  }

  if (!options.negotiated) {
    return {
      ok: false,
      code: "SHELL_ACCESS_DENIED",
      message: "remote.shell.exec was not negotiated for this session.",
    };
  }

  const command = params.command?.trim() ?? "";
  if (!command) {
    return {
      ok: false,
      code: "SHELL_COMMAND_REJECTED",
      message: "Shell command must be a non-empty string.",
    };
  }

  if (command.length > settings.maxCommandChars) {
    return {
      ok: false,
      code: "SHELL_COMMAND_REJECTED",
      message: "Shell command exceeds max_command_chars.",
    };
  }

  if (isCommandDenied(command)) {
    return {
      ok: false,
      code: "SHELL_COMMAND_REJECTED",
      message: "Shell command rejected by local policy.",
    };
  }

  if (!settings.shells.includes(settings.selectedShell)) {
    return {
      ok: false,
      code: "SHELL_SPAWN_FAILED",
      message: "Selected shell is not allowed by local settings.",
    };
  }

  const cwdResult = await resolveShellWorkingDirectory(settings, params);
  if (!cwdResult.ok) {
    return cwdResult;
  }

  return {
    ok: true,
    command,
    cwd: cwdResult.cwd,
    timeoutMs: clampShellTimeout(params.timeout_ms, settings),
    shell: settings.selectedShell,
  };
}

export function auditShellAccess(entry: {
  commandId: string;
  cwdId: string;
  shell: string;
  timeoutMs: number;
  ok: boolean;
  exitCode?: number;
  durationMs?: number;
  timedOut?: boolean;
  truncated?: boolean;
  errorCode?: string;
}): void {
  console.info("[agodesk:shell-access]", {
    command_id: entry.commandId,
    cwd_id: entry.cwdId,
    shell: entry.shell,
    timeout_ms: entry.timeoutMs,
    ok: entry.ok,
    exit_code: entry.exitCode ?? null,
    duration_ms: entry.durationMs ?? null,
    timed_out: entry.timedOut ?? false,
    truncated: entry.truncated ?? false,
    error_code: entry.errorCode ?? null,
  });
}

export function buildShellCwdFromFolder(label: string, canonicalPath: string): ShellAccessCwd {
  return {
    cwdId: createShellCwdId(label),
    label: label.trim() || "Workspace",
    canonicalPath,
    pathDisplay: buildPathDisplay(canonicalPath),
  };
}
