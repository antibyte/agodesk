import { get } from "svelte/store";
import { chatConversationState } from "../stores/chat-conversation";
import {
  claimServerAudioEnqueue,
  onServerAssistantAudioArriving,
  resetAssistantTtsTracking,
} from "./chat-assistant-tts";
import { fetchFirstServerAssetDataUrl } from "./server-asset-fetch";
import { SpeechAudioPlayback } from "./speech-audio-playback";

interface QueuedAudio {
  requestId: string;
  conversationId: string;
  serverUrl: string;
  path: string;
  mimeType?: string;
}

let queue: QueuedAudio[] = [];
let activeRequestId: string | null = null;
let playbackBusy = false;
let playbackChain: Promise<void> = Promise.resolve();
const chatPlayback = new SpeechAudioPlayback();
let warmupPromise: Promise<void> | null = null;

function warnChatAudio(event: string, details?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) {
    return;
  }
  if (details) {
    console.warn("[agodesk:chat-audio]", event, details);
    return;
  }
  console.warn("[agodesk:chat-audio]", event);
}

function extractBase64FromDataUrl(dataUrl: string): string | null {
  if (!dataUrl.startsWith("data:")) {
    return null;
  }
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    return null;
  }
  return dataUrl.slice(commaIndex + 1);
}

async function ensureChatPlaybackReady(): Promise<void> {
  if (!warmupPromise) {
    warmupPromise = chatPlayback.warmUp().catch(() => {});
  }
  await warmupPromise;
}

function isActiveContext(requestId: string, conversationId: string): boolean {
  const state = get(chatConversationState);
  if (!conversationId || !state.activeConversationId) {
    return false;
  }
  if (state.activeConversationId !== conversationId) {
    warnChatAudio("conversation-mismatch", {
      expected: state.activeConversationId,
      received: conversationId,
      requestId,
    });
    return false;
  }
  if (state.stoppedRequestIds.includes(requestId)) {
    return false;
  }
  if (state.requestInFlight && state.activeRequestId && state.activeRequestId !== requestId) {
    warnChatAudio("request-superseded", {
      activeRequestId: state.activeRequestId,
      requestId,
    });
    return false;
  }
  return true;
}

function audioPathLabel(path: string): string {
  return path.split("/").pop()?.split("?")[0] ?? path;
}

async function resolvePlayableAudio(
  serverUrl: string,
  path: string,
  mimeType?: string,
): Promise<{ base64: string; mime: string } | null> {
  const fetched = await fetchFirstServerAssetDataUrl(serverUrl, path);
  if (!fetched) {
    warnChatAudio("fetch-failed", { file: audioPathLabel(path) });
    return null;
  }

  const base64 = extractBase64FromDataUrl(fetched.dataUrl);
  if (!base64) {
    warnChatAudio("invalid-data-url", { file: audioPathLabel(path) });
    return null;
  }

  return {
    base64,
    mime: mimeType || fetched.mime,
  };
}

async function playNextItem(): Promise<void> {
  if (playbackBusy) {
    return;
  }
  const next = queue.shift();
  if (!next) {
    activeRequestId = null;
    return;
  }

  if (!isActiveContext(next.requestId, next.conversationId)) {
    await playNextItem();
    return;
  }

  const audio = await resolvePlayableAudio(next.serverUrl, next.path, next.mimeType);
  if (!audio) {
    await playNextItem();
    return;
  }

  activeRequestId = next.requestId;
  playbackBusy = true;

  try {
    await ensureChatPlaybackReady();
    await chatPlayback.enqueueBase64Audio(audio.base64, audio.mime);
    await chatPlayback.waitUntilIdle();
  } catch (error) {
    warnChatAudio("playback-error", {
      requestId: next.requestId,
      file: audioPathLabel(next.path),
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    playbackBusy = false;
    activeRequestId = null;
    await playNextItem();
  }
}

export function enqueueChatAudio(
  serverUrl: string,
  conversationId: string,
  requestId: string,
  path: string,
  mimeType?: string,
): void {
  if (!isActiveContext(requestId, conversationId)) {
    return;
  }

  if (!claimServerAudioEnqueue(requestId, path)) {
    warnChatAudio("duplicate-skipped", {
      requestId,
      file: audioPathLabel(path),
    });
    return;
  }

  onServerAssistantAudioArriving(requestId);
  chatConversationState.markServerAudio(requestId);
  queue.push({
    requestId,
    conversationId,
    serverUrl,
    path,
    mimeType,
  });
  playbackChain = playbackChain.then(() => playNextItem()).catch(() => {});
}

export function stopChatAudioPlayback(): void {
  queue = [];
  chatPlayback.stop();
  warmupPromise = null;
  playbackBusy = false;
  activeRequestId = null;
}

export function stopAllChatAssistantTts(requestId?: string): void {
  stopChatAudioPlayback();
  resetAssistantTtsTracking(requestId);
}

export function serverAudioActiveForRequest(requestId: string): boolean {
  return activeRequestId === requestId;
}