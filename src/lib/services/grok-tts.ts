import { invoke } from "@tauri-apps/api/core";
import type { SpeechSettings } from "../types/protocol";
import { isGrokSpeechProvider } from "../types/protocol";
import { normalizeGrokVoiceName, toGrokLanguageHint } from "../types/grok-voice";
import { plainTextForSpeech } from "./chat-format";
import { SpeechAudioPlayback } from "./speech-audio-playback";
import { isDesktopShell } from "./window-controls";

const playback = new SpeechAudioPlayback();

export function shouldUseGrokTtsForChat(
  speech: SpeechSettings,
  options?: { chatTtsOff?: boolean; speakerMuted?: boolean },
): boolean {
  if (options?.chatTtsOff || options?.speakerMuted) {
    return false;
  }
  return isGrokSpeechProvider(speech.provider) && speech.voiceResponses !== false;
}

/**
 * Speak text via unary Grok TTS API (POST /v1/tts) using the same voice_id as Voice Agent.
 * Used when the live Grok session is not recording/connected.
 */
export async function speakWithGrokTts(
  text: string,
  speech: SpeechSettings,
): Promise<boolean> {
  if (!shouldUseGrokTtsForChat(speech) || !isDesktopShell()) {
    return false;
  }

  const spoken = plainTextForSpeech(text);
  if (!spoken) {
    return false;
  }

  const voiceId = normalizeGrokVoiceName(speech.voiceName);
  const language =
    toGrokLanguageHint(speech.language) ??
    (speech.language.trim() || "de");

  try {
    const result = await invoke<{ audioBase64: string; contentType: string }>(
      "xai_tts_synthesize",
      {
        text: spoken,
        voiceId,
        language,
      },
    );
    if (!result?.audioBase64) {
      return false;
    }
    const mime =
      result.contentType?.split(";")[0]?.trim() ||
      "audio/mpeg";
    await playback.enqueueBase64Audio(result.audioBase64, mime);
    return true;
  } catch (error) {
    console.warn("Grok TTS failed:", error);
    return false;
  }
}

export function interruptGrokTtsPlayback(): void {
  playback.interrupt();
}
