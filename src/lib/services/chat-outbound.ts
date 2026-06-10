import { get } from "svelte/store";
import { chatMessages } from "../stores/chat";
import { chatConversationState } from "../stores/chat-conversation";
import { sessionState } from "../stores/session";
import { settings } from "../stores/settings";
import { getTranslateFn } from "../i18n/store";
import type { ChatMessagePayload, WsMessage } from "../types/protocol";
import {
  hasAdvertisedChatCancel,
  hasAdvertisedChatSessions,
} from "../types/protocol";
import { shouldSendVoiceOutputForSettings } from "./chat-tts-policy";
import {
  buildChatCancelMessage,
  buildChatSessionCreateMessage,
  waitForActiveConversation,
} from "./chat-conversation-flow";
import { stopAllChatAssistantTts } from "./chat-audio";
import { stopChatMediaPlayback } from "./chat-media-playback";
import { interruptLocalSpeechPlayback } from "./local-speech-tts";
import type { NativeWebSocketService } from "./websocket";

export interface BuildChatMessageOptions {
  source?: ChatMessagePayload["source"];
  id?: string;
  timestamp?: string;
  conversationId?: string | null;
  voiceOutput?: boolean;
}

export function buildChatMessage(
  sessionId: string,
  text: string,
  options: BuildChatMessageOptions = {},
): WsMessage<ChatMessagePayload> {
  const conversationId = options.conversationId?.trim();
  return {
    id: options.id ?? crypto.randomUUID(),
    type: "chat.message",
    timestamp: options.timestamp ?? new Date().toISOString(),
    payload: {
      session_id: sessionId,
      text,
      role: "user",
      ...(conversationId ? { conversation_id: conversationId } : {}),
      ...(options.source ? { source: options.source } : {}),
      ...(options.voiceOutput ? { voice_output: true } : {}),
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

  const conversationId =
    options.conversationId ??
    get(chatConversationState).activeConversationId ??
    undefined;

  const appSettings = get(settings);
  const voiceOutput =
    options.voiceOutput ??
    shouldSendVoiceOutputForSettings(
      appSettings,
      get(sessionState).advertisedCapabilities,
    );

  const message = buildChatMessage(sessionId, trimmed, {
    ...options,
    conversationId: conversationId ?? null,
    voiceOutput,
  });

  chatMessages.addMessage({
    id: message.id,
    role: "user",
    text: trimmed,
    timestamp: message.timestamp,
  });

  chatConversationState.beginRequest(message.id);
  await send(message);
  return message;
}

export async function sendChatMessageWithConversation(
  ws: NativeWebSocketService,
  sessionId: string,
  text: string,
  options: Omit<BuildChatMessageOptions, "conversationId"> = {},
): Promise<WsMessage<ChatMessagePayload>> {
  const caps = get(sessionState).advertisedCapabilities;
  let conversationId = get(chatConversationState).activeConversationId;
  if (hasAdvertisedChatSessions(caps) && !conversationId) {
    await ws.send(buildChatSessionCreateMessage(sessionId));
    try {
      conversationId = await waitForActiveConversation();
    } catch {
      conversationId = get(chatConversationState).activeConversationId;
    }
    if (!conversationId) {
      throw new Error(getTranslateFn()("chatOutbound.error.conversationNotReady"));
    }
  }
  return sendChatMessage(
    (message) => ws.send(message),
    sessionId,
    text,
    { ...options, conversationId },
  );
}

export async function stopActiveChatRequest(
  ws: NativeWebSocketService,
): Promise<boolean> {
  const session = get(sessionState);
  const convo = get(chatConversationState);
  const requestId = convo.activeRequestId;
  const conversationId = convo.activeConversationId;

  stopAllChatAssistantTts(requestId ?? undefined);
  stopChatMediaPlayback();
  interruptLocalSpeechPlayback();

  if (!requestId || !conversationId || !session.sessionId) {
    chatConversationState.finishRequest();
    return false;
  }

  chatConversationState.markStopped(requestId);

  const messages = get(chatMessages);
  const streamingMessage = messages.find(
    (message) => message.streaming && message.requestId === requestId,
  );
  if (streamingMessage) {
    chatMessages.finalizeStreamingResponse(
      requestId,
      getTranslateFn()("chatView.stop.partialNotice"),
      new Date().toISOString(),
      streamingMessage.id,
    );
  }

  if (hasAdvertisedChatCancel(session.advertisedCapabilities)) {
    await ws.send(
      buildChatCancelMessage(session.sessionId, conversationId, requestId),
    );
  }

  return true;
}
