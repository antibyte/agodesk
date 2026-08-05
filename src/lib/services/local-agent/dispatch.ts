import { get } from "svelte/store";
import { sessionState } from "../../stores/session";
import { handleIncomingDesktopCommand } from "../desktop-flow";
import { getTranslateFn } from "../../i18n/store";
import type {
  DesktopCommandPayload,
  DesktopOperation,
  DesktopResultPayload,
  WsMessage,
} from "../../types/protocol";

export interface LocalDispatchResult {
  success: boolean;
  data?: unknown;
  error_code?: string | null;
  error_message?: string | null;
  waiting_approval?: boolean;
}

/** How long a local tool call waits for a pending approval banner before giving up. */
const APPROVAL_WAIT_TIMEOUT_MS = 120_000;

/**
 * Executes a local tool by routing a synthetic `desktop.command` through the
 * existing gate/execution stack (handleIncomingDesktopCommand) with a capturing
 * sender that intercepts the resulting `desktop.result`. All existing gates,
 * file-root policy, shell validation and approval banners apply unchanged.
 */
export async function dispatchLocalDesktopOperation(
  operation: DesktopOperation,
  params: Record<string, unknown>,
  onApprovalPrompt?: (operation: string) => void,
): Promise<LocalDispatchResult> {
  const commandId = `local-${crypto.randomUUID()}`;
  const command: DesktopCommandPayload = { command_id: commandId, operation, params };
  const message: WsMessage<DesktopCommandPayload> = {
    id: commandId,
    type: "desktop.command",
    timestamp: new Date().toISOString(),
    payload: command,
  };

  const session = get(sessionState);

  return await new Promise<LocalDispatchResult>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        success: false,
        waiting_approval: true,
        error_code: "LOCAL_AGENT_APPROVAL_TIMEOUT",
        error_message: getTranslateFn()("localAgent.error.approvalTimeout"),
      });
    }, APPROVAL_WAIT_TIMEOUT_MS);

    const capturingSend = (resultMessage: WsMessage): void => {
      if (resultMessage.type !== "desktop.result") {
        return;
      }
      const payload = resultMessage.payload as DesktopResultPayload;
      if (payload?.command_id !== commandId || settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        success: payload.success === true,
        data: payload.data ?? undefined,
        error_code: payload.error_code ?? null,
        error_message: payload.error ?? null,
      });
    };

    void handleIncomingDesktopCommand(message, {
      sessionStatus: session.status,
      remoteControlActive: session.remoteControlActive,
      sessionId: session.sessionId,
      deviceId: session.deviceId,
      onRemoteControlPrompt: onApprovalPrompt,
      wsSend: capturingSend,
    }).catch((error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        success: false,
        error_code: "LOCAL_AGENT_DISPATCH_FAILED",
        error_message: error instanceof Error ? error.message : String(error),
      });
    });
  });
}
