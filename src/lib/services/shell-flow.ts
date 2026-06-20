import { get, writable } from "svelte/store";
import type {
  DesktopCommandContext,
  DesktopCommandPayload,
  DesktopErrorCode,
  ShellExecParams,
} from "../types/protocol";
import {
  hasAdvertisedShellExec,
  normalizeShellExecParams,
  shellAccessIsConfigured,
} from "../types/protocol";
import { settings } from "../stores/settings";
import { sessionState } from "../stores/session";
import { executeShellCommand, type DesktopResultSender } from "./desktop";
import { auditShellAccess, validateShellExecRequest } from "./shell-access";

export interface ShellApprovalRequest {
  commandId: string;
  command: string;
  cwdLabel: string;
  cwdDisplay: string;
  timeoutMs: number;
}

interface PendingShellCommand {
  command: DesktopCommandPayload;
  params: ShellExecParams;
  context?: DesktopCommandContext;
  wsSend: DesktopResultSender;
}

export const shellApprovalState = writable<{
  pending: boolean;
  request: ShellApprovalRequest | null;
}>({
  pending: false,
  request: null,
});

const pendingShellCommands: PendingShellCommand[] = [];

export function resetShellCommandState(): void {
  pendingShellCommands.length = 0;
  shellApprovalState.set({ pending: false, request: null });
}

function setShellApproval(request: ShellApprovalRequest | null): void {
  shellApprovalState.set({
    pending: request !== null,
    request,
  });
}

async function rejectShellCommand(
  wsSend: DesktopResultSender,
  command: DesktopCommandPayload,
  errorCode: DesktopErrorCode,
  message: string,
  context?: DesktopCommandContext,
): Promise<void> {
  await executeShellCommand(wsSend, command, {
    context,
    forcedError: { code: errorCode, message },
  });
}

export async function handleIncomingShellCommand(
  command: DesktopCommandPayload,
  wsSend: DesktopResultSender,
  context?: DesktopCommandContext,
  options: { onApprovalPrompt?: () => void } = {},
): Promise<void> {
  const shellSettings = get(settings).shellAccess;
  const params = normalizeShellExecParams((command.params ?? {}) as Record<string, unknown>);
  const negotiated = hasAdvertisedShellExec(get(sessionState).advertisedCapabilities);

  const validation = await validateShellExecRequest(shellSettings, params, { negotiated });
  if (!validation.ok) {
    auditShellAccess({
      commandId: command.command_id,
      cwdId: params.cwd_id ?? "",
      shell: shellSettings.selectedShell,
      timeoutMs: params.timeout_ms ?? shellSettings.defaultTimeoutMs,
      ok: false,
      errorCode: validation.code,
    });
    await rejectShellCommand(wsSend, command, validation.code, validation.message, context);
    return;
  }

  if (shellSettings.requiresApproval) {
    pendingShellCommands.push({ command, params, context, wsSend });
    setShellApproval({
      commandId: command.command_id,
      command: validation.command,
      cwdLabel: validation.cwd.label,
      cwdDisplay: validation.cwd.pathDisplay,
      timeoutMs: validation.timeoutMs,
    });
    options.onApprovalPrompt?.();
    return;
  }

  await executeShellCommand(wsSend, command, { context, prevalidated: validation });
}

export async function approvePendingShellCommand(): Promise<void> {
  const next = pendingShellCommands.shift();
  if (!next) {
    setShellApproval(null);
    return;
  }

  setShellApproval(null);
  const shellSettings = get(settings).shellAccess;
  const negotiated = hasAdvertisedShellExec(get(sessionState).advertisedCapabilities);
  const validation = await validateShellExecRequest(shellSettings, next.params, { negotiated });
  if (!validation.ok) {
    await rejectShellCommand(
      next.wsSend,
      next.command,
      validation.code,
      validation.message,
      next.context,
    );
    return;
  }

  await executeShellCommand(next.wsSend, next.command, {
    context: next.context,
    prevalidated: validation,
  });

  if (pendingShellCommands.length > 0) {
    const queued = pendingShellCommands[0];
    const queuedValidation = await validateShellExecRequest(
      shellSettings,
      queued.params,
      { negotiated },
    );
    if (queuedValidation.ok) {
      setShellApproval({
        commandId: queued.command.command_id,
        command: queuedValidation.command,
        cwdLabel: queuedValidation.cwd.label,
        cwdDisplay: queuedValidation.cwd.pathDisplay,
        timeoutMs: queuedValidation.timeoutMs,
      });
    }
  }
}

export async function denyPendingShellCommands(
  wsSend?: DesktopResultSender,
  context: DesktopCommandContext = {},
): Promise<void> {
  const queue = pendingShellCommands.splice(0, pendingShellCommands.length);
  setShellApproval(null);
  for (const entry of queue) {
    auditShellAccess({
      commandId: entry.command.command_id,
      cwdId: entry.params.cwd_id ?? "",
      shell: get(settings).shellAccess.selectedShell,
      timeoutMs: entry.params.timeout_ms ?? get(settings).shellAccess.defaultTimeoutMs,
      ok: false,
      errorCode: "SHELL_APPROVAL_DENIED",
    });
    await rejectShellCommand(
      entry.wsSend ?? wsSend!,
      entry.command,
      "SHELL_APPROVAL_DENIED",
      "Shell command denied by user.",
      entry.context ?? context,
    );
  }
}

export function shellAccessConfiguredLocally(): boolean {
  return shellAccessIsConfigured(get(settings).shellAccess);
}
