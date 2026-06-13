import { get } from "svelte/store";
import { chatConversationState } from "../stores/chat-conversation";
import { fetchFirstChatMediaAssetDataUrl } from "./server-asset-fetch";
import { SpeechAudioPlayback } from "./speech-audio-playback";

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
    await playNextMediaAudio();
    return;
  }

  const fetched = await fetchFirstChatMediaAssetDataUrl(next.serverUrl, next.path);
  const base64 = fetched ? extractBase64FromDataUrl(fetched.dataUrl) : null;
  if (!base64) {
    await playNextMediaAudio();
    return;
  }

  playbackBusy = true;
  try {
    await mediaPlayback.enqueueBase64Audio(base64, next.mimeType || fetched?.mime || "audio/mpeg");
    await mediaPlayback.waitUntilIdle();
  } catch {
    // ignore playback errors
  } finally {
    playbackBusy = false;
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
  queue.push({
    requestId: requestId ?? "",
    conversationId,
    serverUrl,
    path,
    mimeType,
  });
  playbackChain = playbackChain.then(() => playNextMediaAudio()).catch(() => {});
}

export function registerActiveChatMediaElement(element: HTMLMediaElement): () => void {
  activeVideoElements.add(element);
  return () => {
    activeVideoElements.delete(element);
  };
}

export function stopChatMediaPlayback(): void {
  queue = [];
  mediaPlayback.stop();
  playbackBusy = false;
  for (const element of activeVideoElements) {
    try {
      element.pause();
      element.removeAttribute("src");
      element.load();
    } catch {
      // ignore
    }
  }
  activeVideoElements.clear();
}
