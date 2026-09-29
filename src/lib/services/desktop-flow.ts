import { get } from "svelte/store";
import type {
  DesktopCommandContext,
  DesktopCommandPayload,
  DesktopErrorCode,
  SessionStatus,
  WsMessage,
} from "../types/protocol";
import {
  canExecuteDesktopCommands,
  isDesktopInputOperation,
  isFileOperation,
  isShellOperation,
  isDesktopBrowserOperation,
  normalizeDesktopCommandPayload,
  requiresLocalDesktopApproval,
  requiresRemoteControlBanner,
} from "../types/protocol";
import { getTranslateFn } from "../i18n/store";
import { settings } from "../stores/settings";
import { sessionState } from "../stores/session";
import { executeDesktopCommand, type DesktopResultSender } from "./desktop";
import { resetDesktopStreamState } from "./desktop-stream";
import { handleDesktopCommand } from "./session-flow";
import { handleIncomingShellCommand, resetShellCommandState } from "./shell-flow";

interface PendingInputCommand {
  command: DesktopCommandPayload;
  wsSend: DesktopResultSender;
  context: DesktopCommandContext;
  signal?: AbortSignal;
}
const pendingInputCommands: PendingInputCommand[] = [];
let desktopGeneration = 0;

export function resetDesktopCommandState(): void {
  desktopGeneration += 1;
  pendingInputCommands.length = 0;
  resetDesktopStreamState();
  resetShellCommandState();
}

export function getPendingInputCommandCount(): number {
  return pendingInputCommands.length;
}

async function rejectCommand(
  wsSend: DesktopResultSender,
  command: DesktopCommandPayload,
  errorCode: DesktopErrorCode,
  message: string,
  context?: DesktopCommandContext,
): Promise<void> {
  await executeDesktopCommand(wsSend, command, {
    context,
    forcedError: { code: errorCode, message },
  });
}

export async function handleIncomingDesktopCommand(
  message: WsMessage,
  context: {
    sessionStatus: SessionStatus;
    remoteControlActive: boolean;
    sessionId: string;
    deviceId: string;
    wsSend: DesktopResultSender;
    onRemoteControlPrompt?: (operation: string) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  if (context.signal?.aborted) return;
  const command =
    normalizeDesktopCommandPayload(message.payload) ?? (message.payload as DesktopCommandPayload);

  const desktopContext: DesktopCommandContext = {
    sessionId: context.sessionId,
    deviceId: context.deviceId,
  };

  const t = getTranslateFn();

  if (!command?.command_id || !command.operation) {
    await rejectCommand(
      context.wsSend,
      { command_id: message.id, operation: "desktop_screenshot" },
      "DESKTOP_COMMAND_INVALID",
      t("desktopFlow.error.invalidPayload"),
      desktopContext,
    );
    return;
  }

  if (!canExecuteDesktopCommands(context.sessionStatus)) {
    await rejectCommand(
      context.wsSend,
      command,
      "SESSION_NOT_ACCEPTED",
      t("desktopFlow.error.sessionNotAccepted"),
      desktopContext,
    );
    return;
  }

  if (
    !get(settings).desktopControlEnabled &&
    !isFileOperation(command.operation) &&
    !isShellOperation(command.operation)
  ) {
    await rejectCommand(
      context.wsSend,
      command,
      "DESKTOP_CONTROL_DISABLED",
      t("desktopFlow.error.controlDisabled"),
      desktopContext,
    );
    return;
  }

  if (isShellOperation(command.operation)) {
    await handleIncomingShellCommand(command, context.wsSend, desktopContext, {
      signal: context.signal,
      onApprovalPrompt: () => {
        context.onRemoteControlPrompt?.(command.operation);
      },
    });
    return;
  }

  if (isDesktopBrowserOperation(command.operation) && !get(settings).browserControlEnabled) {
    await rejectCommand(
      context.wsSend,
      command,
      "DESKTOP_BROWSER_UNAVAILABLE",
      t("desktopFlow.error.browserDisabled"),
      desktopContext,
    );
    return;
  }

  handleDesktopCommand({
    ...message,
    payload: command,
  } as WsMessage<DesktopCommandPayload>);

  if (
    !context.remoteControlActive &&
    requiresRemoteControlBanner(command.operation, command.params)
  ) {
    context.onRemoteControlPrompt?.(command.operation);
  }

  if (
    !context.remoteControlActive &&
    requiresLocalDesktopApproval(command.operation, command.params)
  ) {
    if (isDesktopInputOperation(command.operation)) {
      pendingInputCommands.push({
        command,
        wsSend: context.wsSend,
        context: desktopContext,
        signal: context.signal,
      });
      context.signal?.addEventListener(
        "abort",
        () => {
          const index = pendingInputCommands.findIndex(
            (entry) => entry.command.command_id === command.command_id,
          );
          if (index >= 0) pendingInputCommands.splice(index, 1);
        },
        { once: true },
      );
      return;
    }
  }

  await executeDesktopCommand(context.wsSend, command, { context: desktopContext });
}

export async function flushPendingInputCommands(
  _wsSend: DesktopResultSender,
  approved: boolean,
  _desktopContext: DesktopCommandContext = {},
): Promise<void> {
  const generation = desktopGeneration;
  const queue = pendingInputCommands.splice(0, pendingInputCommands.length);
  if (queue.length === 0) {
    return;
  }

  for (const entry of queue) {
    if (generation !== desktopGeneration || entry.signal?.aborted) continue;
    if (!approved) {
      await rejectCommand(
        entry.wsSend,
        entry.command,
        "DESKTOP_INPUT_DENIED",
        getTranslateFn()("desktopFlow.error.inputDenied"),
        entry.context,
      );
    } else {
      await executeDesktopCommand(entry.wsSend, entry.command, { context: entry.context });
    }
  }
}

export async function rejectPendingInputCommands(
  wsSend: DesktopResultSender,
  desktopContext: DesktopCommandContext = {},
): Promise<void> {
  await flushPendingInputCommands(wsSend, false, desktopContext);
}

export function clearRemoteControlState(): void {
  desktopGeneration += 1;
  pendingInputCommands.length = 0;
  sessionState.setRemoteControlPending(false);
  sessionState.setRemoteControlActive(false);
}
