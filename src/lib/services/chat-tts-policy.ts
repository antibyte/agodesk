import type { AppSettings, ChatTtsMode } from "../types/protocol";
import { auragoServerTtsAvailable, hasAdvertisedChatVoiceOutput } from "../types/protocol";
import { resolveChatSpeakerMode } from "./chat-voice-output-status";

export function shouldSendVoiceOutputFlag(
  mode: ChatTtsMode,
  advertisedCapabilities: readonly string[],
  speakerMode = true,
): boolean {
  if (!speakerMode || mode === "off" || mode === "frontend") {
    return false;
  }
  if (mode === "aurago" || mode === "auto") {
    return hasAdvertisedChatVoiceOutput(advertisedCapabilities);
  }
  return false;
}

export function shouldSendVoiceOutputForSettings(
  appSettings: AppSettings,
  advertisedCapabilities: readonly string[],
): boolean {
  return shouldSendVoiceOutputFlag(
    appSettings.chatTtsMode,
    advertisedCapabilities,
    resolveChatSpeakerMode(appSettings),
  );
}

export function shouldUseFrontendTtsForResponse(
  mode: ChatTtsMode,
  advertisedCapabilities: readonly string[],
  serverAudioReceived: boolean,
  speakerMode = true,
): boolean {
  if (!speakerMode || mode === "off") {
    return false;
  }
  if (mode === "frontend") {
    return true;
  }
  if (mode === "aurago") {
    return false;
  }
  // auto
  if (serverAudioReceived) {
    return false;
  }
  if (auragoServerTtsAvailable(advertisedCapabilities)) {
    return true;
  }
  return true;
}

export function shouldUseFrontendTtsForSettings(
  appSettings: AppSettings,
  advertisedCapabilities: readonly string[],
  serverAudioReceived: boolean,
): boolean {
  return shouldUseFrontendTtsForResponse(
    appSettings.chatTtsMode,
    advertisedCapabilities,
    serverAudioReceived,
    resolveChatSpeakerMode(appSettings),
  );
}

export function auragoTtsUnavailable(
  mode: ChatTtsMode,
  advertisedCapabilities: readonly string[],
): boolean {
  return mode === "aurago" && !auragoServerTtsAvailable(advertisedCapabilities);
}
