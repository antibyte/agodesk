import { get } from "svelte/store";
import { chatMessages } from "../stores/chat";
import { sessionState } from "../stores/session";
import {
  normalizeSessionClearPayload,
} from "../types/protocol";
import {
  clearRemoteControlState,
  resetDesktopCommandState,
} from "./desktop-flow";
import { resetDesktopSession } from "./desktop";
import { stopSpeechSession } from "./speech-flow";

export interface SessionClearApplyResult {
  sessionId: string;
  reason?: string;
}

export async function applySessionClear(
  payload: unknown,
): Promise<SessionClearApplyResult | null> {
  const normalized = normalizeSessionClearPayload(payload);
  if (normalized === null) {
    return null;
  }

  await stopSpeechSession().catch(() => {});
  await resetDesktopSession().catch(() => {});
  resetDesktopCommandState();
  clearRemoteControlState();

  const clearChat = normalized.clear_chat !== false;
  if (clearChat) {
    chatMessages.clearMessages();
  }

  const session = get(sessionState);
  const nextSessionId = normalized.session_id?.trim() || session.sessionId;
  if (nextSessionId) {
    sessionState.setAcceptedSession(nextSessionId, session.deviceId);
  }

  if (session.status === "idle") {
    sessionState.setStatus("accepted");
  }

  return {
    sessionId: nextSessionId,
    reason: normalized.reason,
  };
}
