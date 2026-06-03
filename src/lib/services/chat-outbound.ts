import { chatMessages } from "../stores/chat";
import { getTranslateFn } from "../i18n/store";
import type { ChatMessagePayload, WsMessage } from "../types/protocol";

export interface BuildChatMessageOptions {
  source?: ChatMessagePayload["source"];
  id?: string;
  timestamp?: string;
}

export function buildChatMessage(
  sessionId: string,
  text: string,
  options: BuildChatMessageOptions = {},
): WsMessage<ChatMessagePayload> {
  return {
    id: options.id ?? crypto.randomUUID(),
    type: "chat.message",
    timestamp: options.timestamp ?? new Date().toISOString(),
    payload: {
      session_id: sessionId,
      text,
      role: "user",
      ...(options.source ? { source: options.source } : {}),
    },
  };
}

export async function sendChatMessage(
  send: (message: WsMessage) => Promise<void>,
  sessionId: string,
  text: string,
  options: BuildChatMessageOptions = {},
): Promise<WsMessage<ChatMessagePayload>> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(getTranslateFn()("chatOutbound.error.emptyMessage"));
  }

  const message = buildChatMessage(sessionId, trimmed, options);
  chatMessages.addMessage({
    id: message.id,
    role: "user",
    text: trimmed,
    timestamp: message.timestamp,
  });
  await send(message);
  return message;
}
