import { get } from "svelte/store";
import { chatMessages } from "../stores/chat";
import { chatMediaState } from "../stores/chat-media-state";
import { chatConversationState } from "../stores/chat-conversation";
import { sessionState } from "../stores/session";
import { settings } from "../stores/settings";
import type { MessageKey } from "../i18n/types";
import { getTranslateFn } from "../i18n/store";
import { handleChatResponseChunk } from "./chat-inbound";
import { applySessionClear } from "./session-clear";
import { handleChatPlanUpdate, reconcilePlanFromResponse } from "./chat-plan-inbound";
import { handleChatResponseMood, handleChatChunkMood } from "./agent-mood-inbound";
import { applyPersonaAssets, clearPersonaAssets, requestPersonaAssets } from "./persona-flow";
import { handleSessionAccepted, handleSessionError, handleSystemConnected } from "./session-flow";
import { handleIncomingDesktopCommand } from "./desktop-flow";
import { playUiSound } from "./ui-sounds";
import { notifyIncomingMessageIfHidden } from "./message-notifications";
import { cancelAssistantFrontendTts, scheduleAssistantFrontendTts } from "./chat-assistant-tts";
import {
  applyChatSessionPayload,
  bootstrapChatConversation,
  handleChatSessionsListResponse,
  isConversationBootstrapPending,
  isConversationBootstrapRunning,
  recoverConversationBootstrap,
  tryResolveBootstrapFromMessage,
} from "./chat-conversation-flow";
import { enqueueChatAudio } from "./chat-audio";
import { handleChatMediaMessage } from "./chat-media-flow";
import { enqueueChatMediaAudio } from "./chat-media-playback";
import {
  handleChatAttachmentAcceptedMessage,
  handleChatAttachmentPreparedMessage,
  rejectAttachmentPrepareByRequestId,
  rejectAnyPendingAttachmentPrepare,
} from "./chat-attachment-flow";
import { clearAttachmentPathCache } from "./chat-attachment-paths";
import { bootstrapAgodeskFeatures } from "./agodesk-features-bootstrap";
import { handleIntegrationsWebhostsMessage } from "./integrations-flow";
import { handleSystemWarningsMessage } from "./system-warnings-flow";
import { shouldUseFrontendTtsForSettings } from "./chat-tts-policy";
import { syncAuraGoVoiceOutputStatus } from "./chat-voice-output-status";
import { saveSettings } from "./settings";
import type { WebSocketService } from "./websocket";
import {
  isChatAudio,
  isChatCancelled,
  isChatError,
  isChatAttachmentPrepared,
  isChatAttachmentAccepted,
  isChatMedia,
  isChatPlanUpdate,
  isChatResponse,
  isChatResponseChunk,
  isChatSession,
  isChatSessions,
  isChatVoiceOutputStatus,
  isDesktopCommand,
  isIntegrationsWebhosts,
  isPersonaAssets,
  isSessionAccepted,
  isSessionClear,
  isSystemConnected,
  isSystemWarnings,
} from "./websocket";
import type { WsMessage } from "../types/protocol";
import {
  auragoServerTtsAvailable,
  hasAdvertisedAgentMetadata,
  hasAdvertisedChatMediaEvents,
  hasAdvertisedPlanUpdates,
  normalizeChatAudioPayload,
  normalizeChatCancelledPayload,
  normalizeChatResponsePayload,
  normalizeChatVoiceOutputStatusPayload,
  isChatAttachmentNegotiationError,
  resolveChatAttachmentErrorDisplay,
} from "../types/protocol";
import { resolveChatSpeakerMode } from "./chat-voice-output-status";

export interface ChatWsInboundCallbacks {
  addSystemMessage: (
    key: MessageKey,
    params?: Record<string, string | number>,
    tone?: "info" | "success" | "error",
  ) => void;
  setPending: (pending: boolean) => void;
  setPairingBusy: (busy: boolean) => void;
  setComposerDraft: (draft: string) => void;
  setRemoteOperation: (operation: string) => void;
  resetPlanAndMoodState: () => void;
  wsSend: (message: WsMessage) => Promise<void>;
  focusComposer?: () => void;
}

export interface ChatWsInboundContext extends ChatWsInboundCallbacks {
  wsService: WebSocketService;
  serverUrl: string;
}

function maybeRequestPersonaAssets(wsService: WebSocketService): void {
  const session = get(sessionState);
  if (!session.sessionId || (session.status !== "loopback" && session.status !== "accepted")) {
    return;
  }
  void requestPersonaAssets(wsService, session.sessionId);
}

function maybeBootstrapConversation(wsService: WebSocketService): void {
  const session = get(sessionState);
  if (!session.sessionId || (session.status !== "loopback" && session.status !== "accepted")) {
    return;
  }

  const convo = get(chatConversationState);
  if (convo.activeConversationId || convo.legacyChatMode || isConversationBootstrapRunning()) {
    return;
  }

  void bootstrapChatConversation(wsService, session.sessionId);
}

const AUTO_TTS_FALLBACK_DELAY_MS = 2_500;

function maybeSpeakAssistantResponse(requestId: string, text: string): void {
  const convo = get(chatConversationState);
  if (convo.stoppedRequestIds.includes(requestId)) {
    return;
  }
  const appSettings = get(settings);
  const caps = get(sessionState).advertisedCapabilities;
  const serverAudio = convo.serverAudioRequestIds.includes(requestId);
  if (!shouldUseFrontendTtsForSettings(appSettings, caps, serverAudio)) {
    return;
  }

  const delayMs =
    appSettings.chatTtsMode === "auto" && auragoServerTtsAvailable(caps) && !serverAudio
      ? AUTO_TTS_FALLBACK_DELAY_MS
      : 0;

  scheduleAssistantFrontendTts({ requestId, text, delayMs });
}

function finishRequest(requestId?: string): void {
  chatConversationState.finishRequest(requestId);
}

function maybeBootstrapAgodeskFeatures(wsService: WebSocketService): void {
  const session = get(sessionState);
  if (!session.sessionId || (session.status !== "loopback" && session.status !== "accepted")) {
    return;
  }
  void bootstrapAgodeskFeatures(wsService, session.sessionId);
}

export async function handleChatWsMessage(
  message: WsMessage,
  ctx: ChatWsInboundContext,
): Promise<void> {
  if (isSessionAccepted(message)) {
    ctx.setPairingBusy(false);
    await handleSessionAccepted(message.payload, ctx.serverUrl);
    maybeRequestPersonaAssets(ctx.wsService);
    maybeBootstrapConversation(ctx.wsService);
    maybeBootstrapAgodeskFeatures(ctx.wsService);
    return;
  }

  if (isSessionClear(message)) {
    ctx.setPending(false);
    ctx.setPairingBusy(false);
    ctx.setComposerDraft("");
    finishRequest();
    const cleared = await applySessionClear(message.payload);
    if (cleared) {
      ctx.addSystemMessage(
        cleared.reason ? "chatView.sessionClear.withReason" : "chatView.sessionClear.notice",
        cleared.reason ? { reason: cleared.reason } : undefined,
        "info",
      );
    }
    return;
  }

  if (isSystemConnected(message)) {
    ctx.setPairingBusy(true);
    sessionState.reset();
    chatMediaState.reset();
    clearAttachmentPathCache();
    ctx.resetPlanAndMoodState();
    clearPersonaAssets();
    try {
      await handleSystemConnected(ctx.wsService, message.payload, ctx.serverUrl);
      maybeRequestPersonaAssets(ctx.wsService);
      maybeBootstrapConversation(ctx.wsService);
      maybeBootstrapAgodeskFeatures(ctx.wsService);
    } finally {
      if (get(sessionState).status === "awaiting_pairing") {
        ctx.setPairingBusy(false);
      }
    }
    return;
  }

  if (isPersonaAssets(message)) {
    await applyPersonaAssets(message.payload, ctx.serverUrl);
    return;
  }

  if (isChatSessions(message)) {
    await handleChatSessionsListResponse(ctx.wsService, message.payload);
    return;
  }

  if (isChatSession(message)) {
    if (applyChatSessionPayload(message.payload)) {
      ctx.focusComposer?.();
      void syncAuraGoVoiceOutputStatus(ctx.wsService);
    }
    return;
  }

  if (isChatVoiceOutputStatus(message)) {
    const normalized = normalizeChatVoiceOutputStatusPayload(message.payload);
    if (normalized?.status === "ok") {
      const current = get(settings);
      if (current.chatSpeakerMode !== normalized.speaker_mode) {
        void saveSettings({ ...current, chatSpeakerMode: normalized.speaker_mode });
      }
    }
    return;
  }

  if (isChatCancelled(message)) {
    const normalized = normalizeChatCancelledPayload(message.payload);
    ctx.setPending(false);
    cancelAssistantFrontendTts(normalized?.request_id);
    finishRequest(normalized?.request_id);
    return;
  }

  const caps = get(sessionState).advertisedCapabilities;

  if (isChatAudio(message)) {
    const normalized = normalizeChatAudioPayload(message.payload);
    const conversationId =
      normalized?.conversation_id || get(chatConversationState).activeConversationId || "";
    if (normalized && conversationId && resolveChatSpeakerMode(get(settings))) {
      enqueueChatAudio(
        ctx.serverUrl,
        conversationId,
        normalized.request_id,
        normalized.path,
        normalized.mime_type,
      );
    } else if (import.meta.env.DEV && message.payload) {
      console.warn("[agodesk:chat-audio] dropped-frame", {
        normalized: Boolean(normalized),
        conversationId: conversationId || null,
      });
    }
    return;
  }

  if (isChatMedia(message) && hasAdvertisedChatMediaEvents(caps)) {
    const normalized = handleChatMediaMessage(message.payload, message.id, message.timestamp);
    if (normalized?.item.kind === "audio") {
      const path = normalized.item.path ?? normalized.item.url;
      if (path) {
        enqueueChatMediaAudio(
          ctx.serverUrl,
          normalized.conversation_id,
          normalized.request_id,
          path,
          normalized.item.mime_type,
        );
      }
    }
    return;
  }

  if (isChatAttachmentPrepared(message)) {
    handleChatAttachmentPreparedMessage(message);
    return;
  }

  if (isChatAttachmentAccepted(message)) {
    handleChatAttachmentAcceptedMessage(message.payload);
    return;
  }

  if (isIntegrationsWebhosts(message)) {
    handleIntegrationsWebhostsMessage(message.payload);
    return;
  }

  if (isSystemWarnings(message)) {
    handleSystemWarningsMessage(message.payload);
    return;
  }

  if (isChatPlanUpdate(message) && hasAdvertisedPlanUpdates(caps)) {
    handleChatPlanUpdate(message.payload);
    return;
  }

  if (isChatResponseChunk(message)) {
    if (hasAdvertisedAgentMetadata(caps)) {
      handleChatChunkMood(
        message.payload.session_id,
        message.payload.request_id,
        message.payload.metadata,
      );
    }
    const result = handleChatResponseChunk(message.payload, message.timestamp);
    if (!result) {
      return;
    }
    if (result.completed) {
      ctx.setPending(false);
      finishRequest(message.payload.request_id);
      playUiSound("receive");
      void notifyIncomingMessageIfHidden(result.text);
      maybeSpeakAssistantResponse(message.payload.request_id, result.text);
    } else {
      ctx.setPending(true);
    }
    return;
  }

  if (isChatResponse(message)) {
    ctx.setPending(false);
    const normalized = normalizeChatResponsePayload(message.payload);
    if (hasAdvertisedAgentMetadata(caps) && normalized) {
      handleChatResponseMood(normalized);
    }
    if (hasAdvertisedPlanUpdates(caps) && normalized) {
      reconcilePlanFromResponse(normalized.metadata);
    }

    const responseText = normalized?.text ?? message.payload.text;
    const responseRequestId = normalized?.request_id ?? message.payload.request_id;

    finishRequest(responseRequestId);

    const finalized = chatMessages.finalizeStreamingResponse(
      responseRequestId,
      responseText,
      message.timestamp,
      message.id,
    );
    if (!finalized) {
      chatMessages.addMessage({
        id: message.id,
        role: "assistant",
        text: responseText,
        timestamp: message.timestamp,
        requestId: responseRequestId,
      });
    }
    playUiSound("receive");
    void notifyIncomingMessageIfHidden(responseText);
    maybeSpeakAssistantResponse(responseRequestId, responseText);
    return;
  }

  if (isChatError(message)) {
    ctx.setPending(false);
    ctx.setPairingBusy(false);
    finishRequest(message.payload.request_id);

    const attachmentErrorText =
      message.payload.message.trim() || message.payload.code || "Attachment error";

    if (rejectAttachmentPrepareByRequestId(message.payload.request_id, attachmentErrorText)) {
      return;
    }

    if (
      isChatAttachmentNegotiationError(message.payload) &&
      rejectAnyPendingAttachmentPrepare(new Error(attachmentErrorText))
    ) {
      return;
    }

    const bootstrapActive = isConversationBootstrapPending();
    const transportSessionError =
      message.payload.code.startsWith("SESSION_") && !message.payload.code.includes("CONVERSATION");

    if (bootstrapActive) {
      await recoverConversationBootstrap(ctx.wsService);
    } else if (transportSessionError) {
      await handleSessionError(message.payload.message);
    } else if (
      message.payload.code.startsWith("SESSION_") &&
      !get(chatConversationState).activeConversationId
    ) {
      await recoverConversationBootstrap(ctx.wsService);
    } else if (message.payload.code.startsWith("SESSION_")) {
      await handleSessionError(message.payload.message);
    }

    const caps = get(sessionState).advertisedCapabilities;
    const attachmentDisplay = resolveChatAttachmentErrorDisplay(message.payload, caps);
    if (import.meta.env.DEV && isChatAttachmentNegotiationError(message.payload)) {
      console.warn("[agodesk:chat.error] attachment", {
        code: message.payload.code,
        message: message.payload.message,
        request_id: message.payload.request_id,
        caps,
        attachments_ready: caps.includes("chat.media_upload") && caps.includes("chat.attachments"),
      });
    }

    chatMessages.addMessage({
      id: message.id,
      role: "system",
      text: attachmentDisplay.messageKey
        ? getTranslateFn()(attachmentDisplay.messageKey)
        : attachmentDisplay.text,
      timestamp: message.timestamp,
      requestId: message.payload.request_id,
      tone: "error",
      ...(attachmentDisplay.messageKey ? { messageKey: attachmentDisplay.messageKey } : {}),
    });
    return;
  }

  if (isDesktopCommand(message)) {
    ctx.setRemoteOperation(String((message.payload as { operation?: string })?.operation ?? ""));
    await handleIncomingDesktopCommand(message, {
      sessionStatus: get(sessionState).status,
      remoteControlActive: get(sessionState).remoteControlActive,
      sessionId: get(sessionState).sessionId,
      deviceId: get(sessionState).deviceId,
      onRemoteControlPrompt: () => {
        ctx.addSystemMessage("chatView.remoteControl.prompt", undefined, "info");
      },
      wsSend: async (resultMessage) => {
        try {
          await ctx.wsSend(resultMessage);
        } catch (error) {
          ctx.addSystemMessage("chatView.error.desktopResultSendFailed", undefined, "error");
          void error;
        }
      },
    });
    return;
  }

  if (await tryResolveBootstrapFromMessage(message)) {
    ctx.focusComposer?.();
  }
}

export function createChatWsInboundContext(
  wsService: WebSocketService,
  serverUrl: string,
  callbacks: ChatWsInboundCallbacks,
): ChatWsInboundContext {
  return {
    wsService,
    serverUrl,
    ...callbacks,
  };
}

export function createSystemMessageAppender(): ChatWsInboundCallbacks["addSystemMessage"] {
  return (key, params, tone = "info") => {
    const t = getTranslateFn();
    chatMessages.addMessage({
      id: crypto.randomUUID(),
      role: "system",
      text: t(key, params),
      timestamp: new Date().toISOString(),
      messageKey: key,
      messageParams: params,
      tone,
    });
  };
}
