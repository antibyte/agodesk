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
import { handleAgentActivity } from "./agent-activity-inbound";
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
import {
  handleKnowledgeArchivePreparedMessage,
  handleKnowledgeArchiveStatusMessage,
  rejectAnyPendingKnowledgeArchive,
} from "./knowledge-archive-flow";
import {
  handleVaultSecretAckMessage,
  handleVaultSecretPromptMessage,
} from "./vault-secret-prompt-flow";
import { clearAttachmentPathCache } from "./chat-attachment-paths";
import { bootstrapAgodeskFeatures } from "./agodesk-features-bootstrap";
import { handleIntegrationsWebhostsMessage } from "./integrations-flow";
import {
  handleConfigProviderCatalogMessage,
  handleConfigProviderMessage,
  handleConfigProviderOauthStartedMessage,
  handleConfigProviderOauthStatusMessage,
  handleConfigProvidersMessage,
  handleConfigProviderTestResultMessage,
  isProviderTestResponseMessage,
  rejectProviderWaiterByRequestId,
} from "./providers-flow";
import { handleSystemWarningsMessage } from "./system-warnings-flow";
import {
  handleLocalAgentLlmResult,
  handleLocalAgentRemoteToolResult,
} from "./local-agent";
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
  isKnowledgeArchivePrepared,
  isKnowledgeArchiveStatus,
  isChatMedia,
  isChatPlanUpdate,
  isAgentActivity,
  isChatResponse,
  isChatResponseChunk,
  isChatSession,
  isChatSessions,
  isChatVoiceOutputStatus,
  isDesktopCommand,
  isVaultSecretPrompt,
  isVaultSecretAck,
  isIntegrationsWebhosts,
  isConfigProviders,
  isConfigProvider,
  isConfigProviderCatalog,
  isConfigProviderOauthStarted,
  isConfigProviderOauthStatus,
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
  hasAdvertisedAgentActivity,
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

/** Prevents double TTS when both streaming `done` and final `chat.response` arrive. */
const spokenAssistantRequestIds = new Set<string>();

async function prefersClientCloudTts(): Promise<boolean> {
  const appSettings = get(settings);
  try {
    const { canActiveSpeechSessionSpeakText } = await import("./speech-flow");
    if (canActiveSpeechSessionSpeakText()) {
      return true;
    }
  } catch {
    // ignore
  }
  try {
    const { shouldUseGrokTtsForChat } = await import("./grok-tts");
    const { shouldUseMistralTtsForChat } = await import("./mistral-tts");
    const { resolveChatSpeakerMode } = await import("./chat-voice-output-status");
    const opts = {
      chatTtsOff: appSettings.chatTtsMode === "off",
      speakerMuted: !resolveChatSpeakerMode(appSettings),
    };
    return (
      shouldUseGrokTtsForChat(appSettings.speech, opts) ||
      shouldUseMistralTtsForChat(appSettings.speech, opts)
    );
  } catch {
    return false;
  }
}

/** Speak an assistant reply (AuraGo WS or local agent). Safe to call multiple times per request_id. */
export function speakAssistantChatResponse(requestId: string, text: string): void {
  maybeSpeakAssistantResponse(requestId, text);
}

function maybeSpeakAssistantResponse(requestId: string, text: string): void {
  const convo = get(chatConversationState);
  if (convo.stoppedRequestIds.includes(requestId)) {
    return;
  }

  const spoken = text?.trim() ?? "";
  if (!spoken || spokenAssistantRequestIds.has(requestId)) {
    return;
  }

  // Prefer Grok/Mistral client voice for AuraGo replies:
  // - live session → session.speakText
  // - mic off + provider → unary client TTS
  void (async () => {
    const appSettings = get(settings);

    try {
      const { canActiveSpeechSessionSpeakText, speakViaActiveSpeechSession } =
        await import("./speech-flow");
      if (canActiveSpeechSessionSpeakText()) {
        spokenAssistantRequestIds.add(requestId);
        cancelAssistantFrontendTts(requestId);
        const handled = await speakViaActiveSpeechSession(spoken);
        if (handled) {
          return;
        }
        spokenAssistantRequestIds.delete(requestId);
      }
    } catch (error) {
      spokenAssistantRequestIds.delete(requestId);
      console.warn("Active speech session TTS failed:", error);
    }

    try {
      const { shouldUseGrokTtsForChat, speakWithGrokTts } = await import("./grok-tts");
      const { resolveChatSpeakerMode } = await import("./chat-voice-output-status");
      if (
        shouldUseGrokTtsForChat(appSettings.speech, {
          chatTtsOff: appSettings.chatTtsMode === "off",
          speakerMuted: !resolveChatSpeakerMode(appSettings),
        })
      ) {
        spokenAssistantRequestIds.add(requestId);
        cancelAssistantFrontendTts(requestId);
        if (await speakWithGrokTts(spoken, appSettings.speech)) {
          return;
        }
        spokenAssistantRequestIds.delete(requestId);
      }
    } catch (error) {
      spokenAssistantRequestIds.delete(requestId);
      console.warn("Grok chat TTS failed:", error);
    }

    try {
      const { shouldUseMistralTtsForChat, speakWithMistralTts } = await import("./mistral-tts");
      const { resolveChatSpeakerMode } = await import("./chat-voice-output-status");
      const useMistral = shouldUseMistralTtsForChat(appSettings.speech, {
        chatTtsOff: appSettings.chatTtsMode === "off",
        speakerMuted: !resolveChatSpeakerMode(appSettings),
      });
      if (useMistral) {
        spokenAssistantRequestIds.add(requestId);
        cancelAssistantFrontendTts(requestId);
        if (await speakWithMistralTts(spoken, appSettings.speech)) {
          return;
        }
        spokenAssistantRequestIds.delete(requestId);
      }
    } catch (error) {
      spokenAssistantRequestIds.delete(requestId);
      console.warn("Mistral chat TTS failed:", error);
    }

    const caps = get(sessionState).advertisedCapabilities;
    const latest = get(chatConversationState);
    if (latest.stoppedRequestIds.includes(requestId)) {
      return;
    }
    const serverAudio = latest.serverAudioRequestIds.includes(requestId);
    if (!shouldUseFrontendTtsForSettings(appSettings, caps, serverAudio)) {
      return;
    }

    const delayMs =
      appSettings.chatTtsMode === "auto" && auragoServerTtsAvailable(caps) && !serverAudio
        ? AUTO_TTS_FALLBACK_DELAY_MS
        : 0;

    spokenAssistantRequestIds.add(requestId);
    scheduleAssistantFrontendTts({ requestId, text: spoken, delayMs });
  })();
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
    // Client-side Mistral/Grok TTS owns the voice — AuraGo server audio would
    // call interruptLocalSpeechPlayback() and kill native WinMM playback mid-utterance.
    if (await prefersClientCloudTts()) {
      return;
    }
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

  if (isKnowledgeArchivePrepared(message)) {
    handleKnowledgeArchivePreparedMessage(message);
    return;
  }

  if (isKnowledgeArchiveStatus(message)) {
    handleKnowledgeArchiveStatusMessage(message.payload);
    return;
  }

  if (isVaultSecretPrompt(message)) {
    handleVaultSecretPromptMessage(message);
    return;
  }

  if (isVaultSecretAck(message)) {
    handleVaultSecretAckMessage(message.payload);
    return;
  }

  if (isIntegrationsWebhosts(message)) {
    handleIntegrationsWebhostsMessage(message.payload);
    return;
  }

  if (isConfigProviders(message)) {
    handleConfigProvidersMessage(message, message.payload);
    return;
  }

  if (isConfigProvider(message)) {
    handleConfigProviderMessage(message, message.payload);
    return;
  }

  if (isConfigProviderCatalog(message)) {
    handleConfigProviderCatalogMessage(message, message.payload);
    return;
  }

  if (isProviderTestResponseMessage(message)) {
    handleConfigProviderTestResultMessage(message, message.payload);
    return;
  }

  if (isConfigProviderOauthStarted(message)) {
    handleConfigProviderOauthStartedMessage(message, message.payload);
    return;
  }

  if (isConfigProviderOauthStatus(message)) {
    handleConfigProviderOauthStatusMessage(message, message.payload);
    return;
  }

  if (isSystemWarnings(message)) {
    handleSystemWarningsMessage(message.payload);
    return;
  }

  if (message.type === "local.agent.remote_tool.result") {
    handleLocalAgentRemoteToolResult(message.payload, message.id);
    return;
  }

  if (message.type === "local.agent.llm.result") {
    handleLocalAgentLlmResult(message.payload, message.id);
    return;
  }

  if (isChatPlanUpdate(message) && hasAdvertisedPlanUpdates(caps)) {
    handleChatPlanUpdate(message.payload);
    return;
  }

  if (isAgentActivity(message) && hasAdvertisedAgentActivity(caps)) {
    handleAgentActivity(message.payload);
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

    if (rejectProviderWaiterByRequestId(message.payload.request_id, attachmentErrorText)) {
      return;
    }
    if (rejectProviderWaiterByRequestId(message.id, attachmentErrorText)) {
      return;
    }

    if (rejectAttachmentPrepareByRequestId(message.payload.request_id, attachmentErrorText)) {
      return;
    }

    if (
      isChatAttachmentNegotiationError(message.payload) &&
      rejectAnyPendingAttachmentPrepare(new Error(attachmentErrorText))
    ) {
      return;
    }

    if (
      message.payload.code.trim().toUpperCase().startsWith("KNOWLEDGE_") &&
      rejectAnyPendingKnowledgeArchive(new Error(attachmentErrorText))
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
        const operation = String((message.payload as { operation?: string })?.operation ?? "");
        if (operation === "shell_exec") {
          ctx.addSystemMessage("chatView.shellApproval.prompt", undefined, "info");
        } else {
          ctx.addSystemMessage("chatView.remoteControl.prompt", undefined, "info");
        }
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
