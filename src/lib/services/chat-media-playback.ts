import { get, writable } from "svelte/store";
import { chatConversationState } from "../stores/chat-conversation";
import { sanitizeServerMediaRef } from "../types/protocol";
import { fetchFirstChatMediaAssetDataUrl } from "./server-asset-fetch";
import { SpeechAudioPlayback } from "./speech-audio-playback";

export const chatMediaPlaybackState = writable({ playing: false });

interface QueuedMediaAudio {
  requestId: string;
  conversationId: string;
  serverUrl: string;
  path: string;
  mimeType?: string;
}

let queue: QueuedMediaAudio[] = [];
let playbackBusy = false;
let playbackChain: Promise<void> = Promise.resolve();
const mediaPlayback = new SpeechAudioPlayback();
const activeVideoElements = new Set<HTMLMediaElement>();
const enqueuedMediaKeys = new Set<string>();

export function buildChatMediaAudioDedupKey(requestId: string, path: string): string {
  const sanitized = sanitizeServerMediaRef(path);
  const basename = (sanitized.split("?")[0] ?? sanitized).split("/").pop() ?? sanitized;
  return `${requestId}::${basename.toLowerCase()}`;
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

function isNativeMediaPlaying(): boolean {
  for (const element of activeVideoElements) {
    if (!element.paused && !element.ended) {
      return true;
    }
  }
  return false;
}

function syncPlaybackState(): void {
  chatMediaPlaybackState.set({
    playing: playbackBusy || queue.length > 0 || mediaPlayback.isActive || isNativeMediaPlaying(),
  });
}

function isActiveContext(requestId: string | undefined, conversationId: string): boolean {
  const state = get(chatConversationState);
  if (!conversationId || !state.activeConversationId) {
    return false;
  }
  if (state.activeConversationId !== conversationId) {
    return false;
  }
  if (requestId && state.stoppedRequestIds.includes(requestId)) {
    return false;
  }
  if (
    requestId &&
    state.requestInFlight &&
    state.activeRequestId &&
    state.activeRequestId !== requestId
  ) {
    return false;
  }
  return true;
}

async function playNextMediaAudio(): Promise<void> {
  if (playbackBusy) {
    return;
  }
  const next = queue.shift();
  if (!next) {
    return;
  }

  if (!isActiveContext(next.requestId, next.conversationId)) {
    syncPlaybackState();
    await playNextMediaAudio();
    return;
  }

  const fetched = await fetchFirstChatMediaAssetDataUrl(next.serverUrl, next.path);
  const base64 = fetched ? extractBase64FromDataUrl(fetched.dataUrl) : null;
  if (!base64) {
    syncPlaybackState();
    await playNextMediaAudio();
    return;
  }

  playbackBusy = true;
  syncPlaybackState();
  try {
    await mediaPlayback.enqueueBase64Audio(base64, next.mimeType || fetched?.mime || "audio/mpeg");
    await mediaPlayback.waitUntilIdle();
  } catch {
    // ignore playback errors
  } finally {
    playbackBusy = false;
    syncPlaybackState();
    await playNextMediaAudio();
  }
}

export function enqueueChatMediaAudio(
  serverUrl: string,
  conversationId: string,
  requestId: string | undefined,
  path: string,
  mimeType?: string,
): void {
  if (!isActiveContext(requestId, conversationId)) {
    return;
  }
  const dedupKey = buildChatMediaAudioDedupKey(requestId ?? conversationId, path);
  if (enqueuedMediaKeys.has(dedupKey)) {
    return;
  }
  enqueuedMediaKeys.add(dedupKey);
  queue.push({
    requestId: requestId ?? "",
    conversationId,
    serverUrl,
    path,
    mimeType,
  });
  syncPlaybackState();
  playbackChain = playbackChain.then(() => playNextMediaAudio()).catch(() => {});
}

export function registerActiveChatMediaElement(element: HTMLMediaElement): () => void {
  activeVideoElements.add(element);
  const onStateChange = (): void => {
    syncPlaybackState();
  };
  element.addEventListener("play", onStateChange);
  element.addEventListener("playing", onStateChange);
  element.addEventListener("pause", onStateChange);
  element.addEventListener("ended", onStateChange);
  syncPlaybackState();
  return () => {
    element.removeEventListener("play", onStateChange);
    element.removeEventListener("playing", onStateChange);
    element.removeEventListener("pause", onStateChange);
    element.removeEventListener("ended", onStateChange);
    activeVideoElements.delete(element);
    syncPlaybackState();
  };
}

export function stopChatMediaPlayback(): void {
  queue = [];
  enqueuedMediaKeys.clear();
  mediaPlayback.stop();
  playbackBusy = false;
  for (const element of activeVideoElements) {
    try {
      element.pause();
      if (Number.isFinite(element.currentTime)) {
        element.currentTime = 0;
      }
    } catch {
      // ignore
    }
  }
  syncPlaybackState();
}
