import { chatMediaState } from "../stores/chat-media-state";
import type { SystemWarningsPayload, WsMessage } from "../types/protocol";
import { normalizeSystemWarningsPayload } from "../types/protocol";

export function handleSystemWarningsMessage(payload: unknown): SystemWarningsPayload | null {
  const normalized = normalizeSystemWarningsPayload(payload);
  if (!normalized) {
    return null;
  }
  chatMediaState.setSystemWarnings(
    normalized.warnings,
    normalized.total,
    normalized.unacknowledged,
  );
  return normalized;
}

export function buildSystemWarningAcknowledgeMessage(
  sessionId: string,
  options: { id?: string; all?: boolean },
): WsMessage {
  return {
    id: crypto.randomUUID(),
    type: "system.warning.acknowledge",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: sessionId,
      ...(options.all ? { all: true } : {}),
      ...(options.id ? { id: options.id } : {}),
    },
  };
}
