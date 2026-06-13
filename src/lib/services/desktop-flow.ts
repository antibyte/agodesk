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
  isDesktopBrowserOperation,
  normalizeDesktopCommandPayload,
  requiresLocalDesktopApproval,
  requiresRemoteControlBanner,
} from "../types/protocol";
import { settings } from "../stores/settings";
import { sessionState } from "../stores/session";
import { executeDesktopCommand, type DesktopResultSender } from "./desktop";
import { resetDesktopStreamState } from "./desktop-stream";
import { handleDesktopCommand } from "./session-flow";

const pendingInputCommands: DesktopCommandPayload[] = [];

export function resetDesktopCommandState(): void {
  pendingInputCommands.length = 0;
  resetDesktopStreamState();
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
  },
): Promise<void> {
  const command =
    normalizeDesktopCommandPayload(message.payload) ?? (message.payload as DesktopCommandPayload);

  const desktopContext: DesktopCommandContext = {
    sessionId: context.sessionId,
    deviceId: context.deviceId,
  };

  if (!command?.command_id || !command.operation) {
    await rejectCommand(
      context.wsSend,
      { command_id: message.id, operation: "desktop_screenshot" },
      "DESKTOP_COMMAND_INVALID",
      "Ungueltiger desktop.command Payload.",
      desktopContext,
    );
    return;
  }

  if (!canExecuteDesktopCommands(context.sessionStatus)) {
    await rejectCommand(
      context.wsSend,
      command,
      "SESSION_NOT_ACCEPTED",
      "Desktop-Befehle sind erst nach session.accepted erlaubt.",
      desktopContext,
    );
    return;
  }

  if (!get(settings).desktopControlEnabled && !isFileOperation(command.operation)) {
    await rejectCommand(
      context.wsSend,
      command,
      "DESKTOP_CONTROL_DISABLED",
      "Desktop-Steuerung ist in den agodesk-Einstellungen deaktiviert.",
      desktopContext,
    );
    return;
  }

  if (isDesktopBrowserOperation(command.operation) && !get(settings).browserControlEnabled) {
    await rejectCommand(
      context.wsSend,
      command,
      "DESKTOP_BROWSER_UNAVAILABLE",
      "Browser-Automatisierung ist in den agodesk-Einstellungen deaktiviert.",
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
      pendingInputCommands.push(command);
      return;
    }
  }

  await executeDesktopCommand(context.wsSend, command, { context: desktopContext });
}

export async function flushPendingInputCommands(
  wsSend: DesktopResultSender,
  approved: boolean,
  desktopContext: DesktopCommandContext = {},
): Promise<void> {
  const queue = pendingInputCommands.splice(0, pendingInputCommands.length);
  if (queue.length === 0) {
    return;
  }

  if (!approved) {
    for (const command of queue) {
      await rejectCommand(
        wsSend,
        command,
        "DESKTOP_INPUT_DENIED",
        "Remote Control wurde vom Benutzer abgelehnt.",
        desktopContext,
      );
    }
    return;
  }

  for (const command of queue) {
    await executeDesktopCommand(wsSend, command, { context: desktopContext });
  }
}

export async function rejectPendingInputCommands(
  wsSend: DesktopResultSender,
  desktopContext: DesktopCommandContext = {},
): Promise<void> {
  await flushPendingInputCommands(wsSend, false, desktopContext);
}

export function clearRemoteControlState(): void {
  pendingInputCommands.length = 0;
  sessionState.setRemoteControlPending(false);
  sessionState.setRemoteControlActive(false);
}
