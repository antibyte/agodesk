import { get } from "svelte/store";
import { chatMessages } from "../stores/chat";
import { chatConversationState } from "../stores/chat-conversation";
import { sessionState } from "../stores/session";
import type {
  ChatSessionSummary,
  LoadedConversationMessage,
  WsMessage,
} from "../types/protocol";
import {
  extractConversationIdFromPayload,
  filterVisibleChatSessions,
  hasAdvertisedChatSessions,
  normalizeChatSessionPayload,
  normalizeChatSessionsPayload,
} from "../types/protocol";
import {
  clearLastConversationId,
  loadLastConversationId,
  saveLastConversationId,
} from "./chat-conversation-persist";
import { stopAllChatAssistantTts } from "./chat-audio";
import type { NativeWebSocketService } from "./websocket";

const CONVERSATION_READY_TIMEOUT_MS = 15_000;
const BOOTSTRAP_WATCHDOG_MS = 4_000;

let bootstrapPending = false;
let bootstrapRecoveryUsed = false;
let bootstrapWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
const conversationReadyWaiters = new Set<(conversationId: string) => void>();
const conversationReadyRejecters = new Set<(error: Error) => void>();

function clearBootstrapWatchdog(): void {
  if (bootstrapWatchdogTimer) {
    clearTimeout(bootstrapWatchdogTimer);
    bootstrapWatchdogTimer = null;
  }
}

function resolveConversationReady(conversationId: string): void {
  bootstrapPending = false;
  bootstrapRecoveryUsed = false;
  clearBootstrapWatchdog();
  for (const resolve of conversationReadyWaiters) {
    resolve(conversationId);
  }
  conversationReadyWaiters.clear();
  conversationReadyRejecters.clear();
}

function rejectConversationReady(error: Error): void {
  bootstrapPending = false;
  clearBootstrapWatchdog();
  for (const reject of conversationReadyRejecters) {
    reject(error);
  }
  conversationReadyWaiters.clear();
  conversationReadyRejecters.clear();
}

export function isConversationBootstrapPending(): boolean {
  const state = get(chatConversationState);
  return bootstrapPending && !state.activeConversationId && !state.legacyChatMode;
}

export function isConversationBootstrapRunning(): boolean {
  return bootstrapPending;
}

function enableLegacyChatFallback(): void {
  bootstrapPending = false;
  bootstrapRecoveryUsed = false;
  clearBootstrapWatchdog();
  chatConversationState.setLegacyChatMode(true);
  resolveConversationReady("");
}

function scheduleBootstrapWatchdog(ws: NativeWebSocketService, sessionId: string): void {
  clearBootstrapWatchdog();
  bootstrapWatchdogTimer = setTimeout(() => {
    bootstrapWatchdogTimer = null;
    if (get(chatConversationState).activeConversationId) {
      bootstrapPending = false;
      return;
    }
    if (bootstrapRecoveryUsed) {
      enableLegacyChatFallback();
      return;
    }
    void requestConversationCreate(ws, sessionId, true);
  }, BOOTSTRAP_WATCHDOG_MS);
}

async function requestConversationCreate(
  ws: NativeWebSocketService,
  sessionId: string,
  fromWatchdog = false,
): Promise<void> {
  if (get(chatConversationState).activeConversationId) {
    return;
  }
  if (fromWatchdog) {
    bootstrapRecoveryUsed = true;
  }
  bootstrapPending = true;
  await ws.send(buildChatSessionCreateMessage(sessionId));
  scheduleBootstrapWatchdog(ws, sessionId);
}

export function waitForActiveConversation(
  timeoutMs = CONVERSATION_READY_TIMEOUT_MS,
): Promise<string> {
  const active = get(chatConversationState).activeConversationId;
  if (active) {
    return Promise.resolve(active);
  }
  const state = get(chatConversationState);
  if (state.legacyChatMode) {
    return Promise.resolve("");
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      conversationReadyWaiters.delete(resolveConversation);
      conversationReadyRejecters.delete(rejectConversation);
      reject(new Error("conversation_not_ready"));
    }, timeoutMs);

    function resolveConversation(conversationId: string): void {
      clearTimeout(timer);
      resolve(conversationId);
    }

    function rejectConversation(error: Error): void {
      clearTimeout(timer);
      reject(error);
    }

    conversationReadyWaiters.add(resolveConversation);
    conversationReadyRejecters.add(rejectConversation);
  });
}

export function buildChatSessionsListMessage(sessionId: string, limit = 20): WsMessage {
  return {
    id: crypto.randomUUID(),
    type: "chat.sessions.list",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: sessionId,
      limit,
    },
  };
}

export function buildChatSessionCreateMessage(sessionId: string): WsMessage {
  return {
    id: crypto.randomUUID(),
    type: "chat.session.create",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: sessionId,
    },
  };
}

export function buildChatSessionLoadMessage(
  sessionId: string,
  conversationId: string,
): WsMessage {
  return {
    id: crypto.randomUUID(),
    type: "chat.session.load",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: sessionId,
      conversation_id: conversationId,
    },
  };
}

export function buildChatCancelMessage(
  sessionId: string,
  conversationId: string,
  requestId: string,
): WsMessage {
  return {
    id: crypto.randomUUID(),
    type: "chat.cancel",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: sessionId,
      conversation_id: conversationId,
      request_id: requestId,
    },
  };
}

export function applyLoadedConversationMessages(
  messages: LoadedConversationMessage[],
): void {
  chatMessages.clearMessages();
  for (const message of messages) {
    chatMessages.addMessage({
      id: crypto.randomUUID(),
      role: message.role,
      text: message.content,
      timestamp: message.timestamp ?? new Date().toISOString(),
    });
  }
}

function pickBootstrapConversation(
  allSessions: ChatSessionSummary[],
  lastConversationId: string | null,
): ChatSessionSummary | null {
  const visibleSessions = filterVisibleChatSessions(allSessions);

  if (lastConversationId) {
    const lastVisible = visibleSessions.find((session) => session.id === lastConversationId);
    if (lastVisible) {
      return lastVisible;
    }

    const lastAny = allSessions.find((session) => session.id === lastConversationId);
    if (lastAny) {
      return lastAny;
    }
  }

  return visibleSessions[0] ?? null;
}

function activateConversation(
  conversationId: string,
  session?: ChatSessionSummary,
  messages?: LoadedConversationMessage[],
): void {
  if (conversationId) {
    chatConversationState.setActiveConversationId(conversationId);
    void saveLastConversationId(conversationId);
  }
  chatConversationState.setLegacyChatMode(false);
  if (session) {
    chatConversationState.upsertSession(session);
  }
  resolveConversationReady(conversationId);
  if (messages) {
    applyLoadedConversationMessages(messages);
  }
}

export function applyChatSessionPayload(payload: unknown): boolean {
  const normalized = normalizeChatSessionPayload(payload);
  if (normalized) {
    activateConversation(
      normalized.conversation_id,
      normalized.session,
      normalized.messages,
    );
    return true;
  }

  const conversationId = extractConversationIdFromPayload(payload);
  if (!conversationId) {
    return false;
  }

  activateConversation(conversationId);
  return true;
}

export async function handleChatSessionsListResponse(
  ws: NativeWebSocketService,
  payload: unknown,
): Promise<void> {
  const sessionId = get(sessionState).sessionId;
  const normalized = normalizeChatSessionsPayload(payload);

  if (normalized) {
    chatConversationState.setSessions(filterVisibleChatSessions(normalized.sessions));
  }

  if (!sessionId || get(chatConversationState).activeConversationId) {
    return;
  }

  // List refresh runs in parallel with create/load — do not start a second bootstrap.
  if (bootstrapPending) {
    return;
  }

  if (!normalized) {
    await requestConversationCreate(ws, sessionId);
    return;
  }

  const lastId = await loadLastConversationId();
  const target = pickBootstrapConversation(normalized.sessions, lastId);

  bootstrapPending = true;
  bootstrapRecoveryUsed = false;
  scheduleBootstrapWatchdog(ws, sessionId);

  if (target) {
    await ws.send(buildChatSessionLoadMessage(sessionId, target.id));
    return;
  }

  await requestConversationCreate(ws, sessionId);
}

export async function bootstrapChatConversation(
  ws: NativeWebSocketService,
  sessionId: string,
): Promise<void> {
  registerConversationWebSocket(ws);
  const caps = get(sessionState).advertisedCapabilities;
  if (!hasAdvertisedChatSessions(caps)) {
    return;
  }
  if (get(chatConversationState).activeConversationId) {
    return;
  }
  if (bootstrapPending) {
    return;
  }

  bootstrapPending = true;
  bootstrapRecoveryUsed = false;
  scheduleBootstrapWatchdog(ws, sessionId);

  const lastId = await loadLastConversationId();
  if (lastId) {
    await ws.send(buildChatSessionLoadMessage(sessionId, lastId));
  } else {
    await requestConversationCreate(ws, sessionId);
  }

  void ws.send(buildChatSessionsListMessage(sessionId)).catch(() => {
    // Background refresh — non-fatal.
  });
}

export async function recoverConversationBootstrap(
  ws: NativeWebSocketService,
): Promise<boolean> {
  if (!bootstrapPending || bootstrapRecoveryUsed) {
    return false;
  }
  if (get(chatConversationState).activeConversationId) {
    bootstrapPending = false;
    clearBootstrapWatchdog();
    return false;
  }

  const sessionId = get(sessionState).sessionId;
  if (!sessionId || !hasAdvertisedChatSessions(get(sessionState).advertisedCapabilities)) {
    return false;
  }

  await requestConversationCreate(ws, sessionId, true);
  return true;
}

export async function tryResolveBootstrapFromMessage(
  message: WsMessage,
): Promise<boolean> {
  if (!isConversationBootstrapPending()) {
    return false;
  }

  if (
    message.type === "chat.session" ||
    message.type === "chat.session.create" ||
    message.type === "chat.session.load"
  ) {
    return applyChatSessionPayload(message.payload);
  }

  if (message.type === "chat.sessions" || message.type === "chat.sessions.list") {
    return false;
  }

  return applyChatSessionPayload(message.payload);
}

export async function createNewChatConversation(
  ws: NativeWebSocketService,
  sessionId: string,
): Promise<void> {
  chatConversationState.finishRequest();
  chatMessages.clearMessages();
  chatConversationState.clearServerAudioTracking();
  bootstrapPending = true;
  bootstrapRecoveryUsed = false;
  scheduleBootstrapWatchdog(ws, sessionId);
  await ws.send(buildChatSessionCreateMessage(sessionId));
  try {
    await waitForActiveConversation();
  } catch {
    // Reset or timeout during create — caller may retry.
  }
}

export async function loadChatConversation(
  ws: NativeWebSocketService,
  sessionId: string,
  conversationId: string,
): Promise<void> {
  chatConversationState.finishRequest();
  chatConversationState.clearServerAudioTracking();
  bootstrapPending = true;
  bootstrapRecoveryUsed = false;
  scheduleBootstrapWatchdog(ws, sessionId);
  await ws.send(buildChatSessionLoadMessage(sessionId, conversationId));
  try {
    await waitForActiveConversation();
  } catch {
    // Reset or timeout during load — caller may retry.
  }
}

export async function ensureActiveConversation(
  ws: NativeWebSocketService,
  sessionId: string,
): Promise<string | null> {
  const active = get(chatConversationState).activeConversationId;
  if (active) {
    return active;
  }

  const caps = get(sessionState).advertisedCapabilities;
  if (!hasAdvertisedChatSessions(caps)) {
    return null;
  }

  await requestConversationCreate(ws, sessionId);
  try {
    return await waitForActiveConversation();
  } catch {
    return get(chatConversationState).activeConversationId;
  }
}

export function resetChatConversationRuntimeState(): void {
  bootstrapPending = false;
  bootstrapRecoveryUsed = false;
  chatConversationState.setLegacyChatMode(false);
  clearBootstrapWatchdog();
  rejectConversationReady(new Error("conversation_reset"));
  chatConversationState.reset();
  stopAllChatAssistantTts();
}

export function isChatConversationReady(advertisedCapabilities: readonly string[]): boolean {
  if (!hasAdvertisedChatSessions(advertisedCapabilities)) {
    return true;
  }
  if (get(chatConversationState).legacyChatMode) {
    return true;
  }
  return Boolean(get(chatConversationState).activeConversationId);
}

export function resetChatConversationLocalState(): void {
  resetChatConversationRuntimeState();
  void clearLastConversationId();
}

export function registerConversationWebSocket(_ws: NativeWebSocketService): void {
  // Reserved for future queued sends while conversation bootstraps.
}

export function clearConversationWebSocket(): void {
  // no-op
}
