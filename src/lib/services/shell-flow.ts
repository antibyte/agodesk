import { get, writable } from "svelte/store";
import type {
  DesktopCommandContext,
  DesktopCommandPayload,
  DesktopErrorCode,
  ShellExecParams,
} from "../types/protocol";
import {
  hasAdvertisedShellExec,
  hasAdvertisedShellSession,
  isShellSessionPassiveOperation,
  normalizeShellExecParams,
  normalizeShellSessionParams,
  shellAccessIsConfigured,
  shellSessionRequiresApproval,
} from "../types/protocol";
import { settings } from "../stores/settings";
import { sessionState } from "../stores/session";
import { chatConversationState } from "../stores/chat-conversation";
import {
  executeShellCommand,
  executeShellSessionCommand,
  type DesktopResultSender,
} from "./desktop";
import { auditShellAccess, validateShellExecRequest } from "./shell-access";
import { emitLocalActivity } from "./agent-activity-inbound";
import { appendActivityJournal } from "./activity-journal";
import { createLocalJob, localJobState } from "../stores/local-jobs";
import { getTranslateFn } from "../i18n/store";

function activityIdsForCommand(commandId: string) {
  return {
    activity_id: `shell:${commandId}`,
    command_id: commandId,
    conversation_id: get(chatConversationState).activeConversationId || "local",
    session_id: get(sessionState).sessionId || "local",
  };
}

function mirrorShellJob(
  commandId: string,
  status: "queued" | "running" | "completed" | "failed" | "cancelled",
  title: string,
  shellSessionId?: string,
  errorCode?: string,
): void {
  const now = new Date().toISOString();
  localJobState.upsert(
    createLocalJob("shell", {
      job_id: `job-shell-${commandId}`,
      status: status === "queued" ? "queued" : status === "running" ? "running" : status,
      title,
      shell_session_id: shellSessionId,
      error_code: errorCode,
      created_at: now,
      updated_at: now,
    }),
  );
  appendActivityJournal({
    timestamp: now,
    conversation_id: get(chatConversationState).activeConversationId || undefined,
    activity_id: `shell:${commandId}`,
    kind: "shell",
    status,
    command_summary: title.slice(0, 200),
    error_code: errorCode,
    job_id: `job-shell-${commandId}`,
  });
}

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
  if (command.operation === "shell_exec") {
    await executeShellCommand(wsSend, command, {
      context,
      forcedError: { code: errorCode, message },
    });
    return;
  }
  await executeShellSessionCommand(wsSend, command, {
    context,
    forcedError: { code: errorCode, message },
  });
}

async function runValidatedShell(
  wsSend: DesktopResultSender,
  command: DesktopCommandPayload,
  validation: Awaited<ReturnType<typeof validateShellExecRequest>> & { ok: true },
  context?: DesktopCommandContext,
): Promise<void> {
  emitLocalActivity({
    ...activityIdsForCommand(command.command_id),
    kind: "shell",
    phase: "started",
    title: validation.command || command.operation,
    summary: validation.cwd.pathDisplay,
    risk: "execute",
    started_at: new Date().toISOString(),
  });
  mirrorShellJob(command.command_id, "running", validation.command || command.operation);
  try {
    if (command.operation === "shell_exec") {
      await executeShellCommand(wsSend, command, { context, prevalidated: validation });
    } else {
      await executeShellSessionCommand(wsSend, command, { context, prevalidated: validation });
    }
    emitLocalActivity({
      ...activityIdsForCommand(command.command_id),
      kind: "shell",
      phase: command.operation === "shell_session_start" ? "progress" : "completed",
      title: validation.command || command.operation,
      finished_at: new Date().toISOString(),
    });
    mirrorShellJob(
      command.command_id,
      command.operation === "shell_session_start" ? "running" : "completed",
      validation.command || command.operation,
    );
  } catch {
    emitLocalActivity({
      ...activityIdsForCommand(command.command_id),
      kind: "shell",
      phase: "failed",
      title: validation.command || command.operation,
      finished_at: new Date().toISOString(),
    });
    mirrorShellJob(command.command_id, "failed", validation.command || command.operation);
  }
}

export async function handleIncomingShellCommand(
  command: DesktopCommandPayload,
  wsSend: DesktopResultSender,
  context?: DesktopCommandContext,
  options: { onApprovalPrompt?: () => void } = {},
): Promise<void> {
  const shellSettings = get(settings).shellAccess;
  const caps = get(sessionState).advertisedCapabilities;
  const isSessionOp = command.operation !== "shell_exec";
  const negotiated = isSessionOp
    ? hasAdvertisedShellSession(caps) || hasAdvertisedShellExec(caps)
    : hasAdvertisedShellExec(caps);

  if (isShellSessionPassiveOperation(command.operation)) {
    if (!negotiated || !shellAccessIsConfigured(shellSettings)) {
      await rejectShellCommand(
        wsSend,
        command,
        negotiated ? "SHELL_ACCESS_DISABLED" : "SHELL_ACCESS_DENIED",
        negotiated ? getTranslateFn()("shellFlow.error.disabled") : getTranslateFn()("shellFlow.error.notNegotiated"),
        context,
      );
      return;
    }
    await executeShellSessionCommand(wsSend, command, { context });
    return;
  }

  const rawParams = normalizeShellSessionParams(
    command.operation,
    (command.params ?? {}) as Record<string, unknown>,
  );
  const params = normalizeShellExecParams(rawParams as Record<string, unknown>);

  if (command.operation === "shell_session_input") {
    const sessionId = String(rawParams.shell_session_id ?? "");
    if (!sessionId) {
      await rejectShellCommand(
        wsSend,
        command,
        "SHELL_COMMAND_REJECTED",
        getTranslateFn()("shellFlow.error.sessionIdRequired"),
        context,
      );
      return;
    }
    if (!negotiated || !shellAccessIsConfigured(shellSettings)) {
      await rejectShellCommand(
        wsSend,
        command,
        negotiated ? "SHELL_ACCESS_DISABLED" : "SHELL_ACCESS_DENIED",
        negotiated ? getTranslateFn()("shellFlow.error.disabled") : getTranslateFn()("shellFlow.error.notNegotiated"),
        context,
      );
      return;
    }
    if (shellSettings.requiresApproval && shellSessionRequiresApproval(command.operation)) {
      pendingShellCommands.push({
        command,
        params: { ...params, command: `stdin → ${sessionId}` },
        context,
        wsSend,
      });
      setShellApproval({
        commandId: command.command_id,
        command: `stdin → ${sessionId}`,
        cwdLabel: sessionId,
        cwdDisplay: sessionId,
        timeoutMs: shellSettings.defaultTimeoutMs,
      });
      emitLocalActivity({
        ...activityIdsForCommand(command.command_id),
        kind: "shell",
        phase: "waiting_approval",
        title: `stdin → ${sessionId}`,
        risk: "execute",
        approval_required: true,
        started_at: new Date().toISOString(),
      });
      options.onApprovalPrompt?.();
      return;
    }
    await executeShellSessionCommand(wsSend, command, { context });
    return;
  }

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

  const needsApproval =
    shellSettings.requiresApproval &&
    (command.operation === "shell_exec" || shellSessionRequiresApproval(command.operation));

  if (needsApproval) {
    pendingShellCommands.push({ command, params, context, wsSend });
    setShellApproval({
      commandId: command.command_id,
      command: validation.command,
      cwdLabel: validation.cwd.label,
      cwdDisplay: validation.cwd.pathDisplay,
      timeoutMs: validation.timeoutMs,
    });
    emitLocalActivity({
      ...activityIdsForCommand(command.command_id),
      kind: "shell",
      phase: "waiting_approval",
      title: validation.command,
      summary: validation.cwd.pathDisplay,
      risk: "execute",
      approval_required: true,
      started_at: new Date().toISOString(),
    });
    options.onApprovalPrompt?.();
    return;
  }

  await runValidatedShell(wsSend, command, validation, context);
}

export async function approvePendingShellCommand(): Promise<void> {
  const next = pendingShellCommands.shift();
  if (!next) {
    setShellApproval(null);
    return;
  }

  setShellApproval(null);
  const shellSettings = get(settings).shellAccess;
  const caps = get(sessionState).advertisedCapabilities;
  const isSessionOp = next.command.operation !== "shell_exec";
  const negotiated = isSessionOp
    ? hasAdvertisedShellSession(caps) || hasAdvertisedShellExec(caps)
    : hasAdvertisedShellExec(caps);

  if (next.command.operation === "shell_session_input") {
    await executeShellSessionCommand(next.wsSend, next.command, { context: next.context });
  } else {
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
    await runValidatedShell(next.wsSend, next.command, validation, next.context);
  }

  if (pendingShellCommands.length > 0) {
    const queued = pendingShellCommands[0];
    if (queued.command.operation === "shell_session_input") {
      const sessionId = String(
        (queued.command.params as Record<string, unknown> | undefined)?.shell_session_id ?? "",
      );
      setShellApproval({
        commandId: queued.command.command_id,
        command: `stdin → ${sessionId}`,
        cwdLabel: sessionId,
        cwdDisplay: sessionId,
        timeoutMs: shellSettings.defaultTimeoutMs,
      });
      return;
    }
    const queuedValidation = await validateShellExecRequest(shellSettings, queued.params, {
      negotiated,
    });
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
    emitLocalActivity({
      ...activityIdsForCommand(entry.command.command_id),
      kind: "shell",
      phase: "cancelled",
      title: entry.params.command || entry.command.command_id,
      error_code: "SHELL_APPROVAL_DENIED",
      finished_at: new Date().toISOString(),
    });
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
