import { get } from "svelte/store";
import { chatConversationState } from "../stores/chat-conversation";
import { sessionState } from "../stores/session";
import { settings } from "../stores/settings";
import type {
  AppSettings,
  ChatVoiceOutputProtocolMode,
  ChatVoiceOutputStatusReason,
  WsMessage,
} from "../types/protocol";
import { hasAdvertisedChatVoiceOutputStatus } from "../types/protocol";
import type { NativeWebSocketService } from "./websocket";

export function resolveChatSpeakerMode(appSettings: AppSettings): boolean {
  if (appSettings.chatTtsMode === "off") {
    return false;
  }
  return appSettings.chatSpeakerMode;
}

export function resolveVoiceOutputProtocolMode(speakerMode: boolean): ChatVoiceOutputProtocolMode {
  return speakerMode ? "on" : "off";
}

export function buildChatVoiceOutputStatusMessage(
  sessionId: string,
  conversationId: string | null | undefined,
  speakerMode: boolean,
  reason: ChatVoiceOutputStatusReason,
): WsMessage {
  return {
    id: crypto.randomUUID(),
    type: "chat.voice_output.status",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: sessionId,
      ...(conversationId ? { conversation_id: conversationId } : {}),
      speaker_mode: speakerMode,
      mode: resolveVoiceOutputProtocolMode(speakerMode),
      reason,
    },
  };
}

export async function notifyAuraGoVoiceOutputStatus(
  ws: NativeWebSocketService,
  reason: ChatVoiceOutputStatusReason,
  speakerModeOverride?: boolean,
): Promise<boolean> {
  const session = get(sessionState);
  if (!session.sessionId) {
    return false;
  }
  if (!hasAdvertisedChatVoiceOutputStatus(session.advertisedCapabilities)) {
    return false;
  }

  const appSettings = get(settings);
  const speakerMode = speakerModeOverride ?? resolveChatSpeakerMode(appSettings);
  const conversationId = get(chatConversationState).activeConversationId;

  await ws.send(
    buildChatVoiceOutputStatusMessage(session.sessionId, conversationId, speakerMode, reason),
  );
  return true;
}

export async function syncAuraGoVoiceOutputStatus(ws: NativeWebSocketService): Promise<void> {
  await notifyAuraGoVoiceOutputStatus(ws, "session_sync");
}
