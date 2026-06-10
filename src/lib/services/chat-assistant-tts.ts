import { get } from "svelte/store";
import { chatConversationState } from "../stores/chat-conversation";
import { settings } from "../stores/settings";
import {
  interruptLocalSpeechPlayback,
  speakChatAssistantText,
} from "./local-speech-tts";

interface PendingFallback {
  requestId: string;
  timerId: number;
}

const pendingFallbacks = new Map<string, PendingFallback>();
const frontendTtsStarted = new Set<string>();
const enqueuedServerAudioKeys = new Set<string>();

export function buildServerAudioDedupKey(requestId: string, path: string): string {
  return `${requestId}::${path.trim()}`;
}

export function cancelAssistantFrontendTts(requestId?: string): void {
  if (requestId) {
    const pending = pendingFallbacks.get(requestId);
    if (pending) {
      clearTimeout(pending.timerId);
      pendingFallbacks.delete(requestId);
    }
    return;
  }

  for (const pending of pendingFallbacks.values()) {
    clearTimeout(pending.timerId);
  }
  pendingFallbacks.clear();
}

export function resetAssistantTtsTracking(requestId?: string): void {
  cancelAssistantFrontendTts(requestId);
  if (requestId) {
    frontendTtsStarted.delete(requestId);
    for (const key of enqueuedServerAudioKeys) {
      if (key.startsWith(`${requestId}::`)) {
        enqueuedServerAudioKeys.delete(key);
      }
    }
    return;
  }

  frontendTtsStarted.clear();
  enqueuedServerAudioKeys.clear();
}

/** Returns false when this server audio frame was already queued. */
export function claimServerAudioEnqueue(requestId: string, path: string): boolean {
  const key = buildServerAudioDedupKey(requestId, path);
  if (enqueuedServerAudioKeys.has(key)) {
    return false;
  }
  enqueuedServerAudioKeys.add(key);
  return true;
}

export function onServerAssistantAudioArriving(requestId: string): void {
  cancelAssistantFrontendTts(requestId);
  interruptLocalSpeechPlayback();
}

/**
 * Schedule frontend/native TTS for one assistant response.
 * Returns false when a fallback is already pending or frontend TTS already ran.
 */
export function scheduleAssistantFrontendTts(options: {
  requestId: string;
  text: string;
  delayMs: number;
}): boolean {
  const { requestId, text, delayMs } = options;
  if (frontendTtsStarted.has(requestId) || pendingFallbacks.has(requestId)) {
    return false;
  }

  const timerId = window.setTimeout(() => {
    pendingFallbacks.delete(requestId);

    const latest = get(chatConversationState);
    if (latest.stoppedRequestIds.includes(requestId)) {
      return;
    }
    if (latest.serverAudioRequestIds.includes(requestId)) {
      return;
    }

    frontendTtsStarted.add(requestId);
    void import("./chat-audio").then(({ stopChatAudioPlayback }) => {
      stopChatAudioPlayback();
      void speakChatAssistantText(text, get(settings).speech);
    });
  }, delayMs);

  pendingFallbacks.set(requestId, { requestId, timerId });
  return true;
}
