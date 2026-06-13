import type { SpeechSettings } from "../types/protocol";
import { speechProviderRequiresGeminiApiKey } from "../types/protocol";
import {
  defaultEdgeTtsVoiceForSpeechLanguage,
  defaultPiperVoiceForSpeechLanguage,
  localTtsTestPhraseForAppLocale,
} from "./speech-locale";
import type { UiLocaleSetting } from "../i18n/locales";
import { SpeechAudioPlayback } from "./speech-audio-playback";
import { piperVoiceCandidateOrder } from "./speech-piper-voice";
import { plainTextForSpeech } from "./chat-format";
import { speechSidecarSynthesize } from "./speech-sidecar";

interface SpeakableLocalSession {
  speakText(text: string): Promise<void>;
  requestClientInterrupt(): void;
  readonly isClosed: boolean;
}

let activeLocalSession: SpeakableLocalSession | null = null;
const standalonePlayback = new SpeechAudioPlayback();

export const DEFAULT_LOCAL_TTS_TEST_PHRASE = localTtsTestPhraseForAppLocale("de");

export function localTtsTestPhrase(locale: UiLocaleSetting = "system"): string {
  return localTtsTestPhraseForAppLocale(locale);
}

export interface LocalSpeechTtsTestResult {
  ok: boolean;
  backend?: string;
  voice?: string;
  error?: string;
}

export interface LocalSpeechSynthesisOutcome {
  backend: string;
  voice: string;
  mimeType?: string;
  sampleRate: number;
  audioBase64: string;
}

export interface SynthesizeLocalSpeechOptions {
  /** When false, edge_tts will not silently fall back to Piper. Default: false. */
  allowPiperFallback?: boolean;
}

export interface ResolvedLocalTtsConfig {
  backend: "piper" | "edge_tts";
  voice: string;
  /** Piper voice used when edge_tts is configured but unavailable. */
  piperFallbackVoice: string;
}

export function registerActiveLocalSpeechSession(session: SpeakableLocalSession | null): void {
  activeLocalSession = session;
}

export function shouldSpeakAssistantText(speech: SpeechSettings): boolean {
  return speech.voiceResponses && !speechProviderRequiresGeminiApiKey(speech.provider);
}

/** @deprecated Use shouldSpeakAssistantText */
export function shouldUseLocalSpeechTts(speech: SpeechSettings, _sessionActive: boolean): boolean {
  return shouldSpeakAssistantText(speech);
}

export function resolveLocalTtsConfig(speech: SpeechSettings): ResolvedLocalTtsConfig {
  const piperFallbackVoice =
    speech.offlineTtsVoice.trim() || defaultPiperVoiceForSpeechLanguage(speech.language);

  if (speech.provider === "offline") {
    return {
      backend: "piper",
      voice: piperFallbackVoice,
      piperFallbackVoice,
    };
  }

  const configuredBackend = speech.hybridTtsBackend;
  const configuredVoice =
    speech.hybridTtsVoice.trim() || defaultEdgeTtsVoiceForSpeechLanguage(speech.language);

  if (configuredBackend === "edge_tts") {
    return {
      backend: "edge_tts",
      voice: configuredVoice,
      piperFallbackVoice,
    };
  }

  return {
    backend: "piper",
    voice: piperFallbackVoice,
    piperFallbackVoice,
  };
}

export async function synthesizeLocalSpeech(
  text: string,
  speech: SpeechSettings,
  options: SynthesizeLocalSpeechOptions = {},
): Promise<LocalSpeechSynthesisOutcome> {
  const trimmed = plainTextForSpeech(text);
  if (!trimmed) {
    throw new Error("TTS text is empty.");
  }

  const config = resolveLocalTtsConfig(speech);
  const allowPiperFallback = options.allowPiperFallback === true;
  const attempts: Array<{ backend: string; voice: string }> = [];

  if (config.backend === "edge_tts") {
    attempts.push({ backend: "edge_tts", voice: config.voice });
    if (allowPiperFallback) {
      for (const voice of piperVoiceCandidateOrder(speech.language, config.piperFallbackVoice)) {
        attempts.push({ backend: "piper", voice });
      }
    }
  } else if (config.backend === "piper") {
    for (const voice of piperVoiceCandidateOrder(speech.language, config.voice)) {
      attempts.push({ backend: "piper", voice });
    }
  } else {
    attempts.push({ backend: config.backend, voice: config.voice });
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const result = await speechSidecarSynthesize({
        text: trimmed,
        voice: attempt.voice,
        backend: attempt.backend,
      });
      return {
        backend: attempt.backend,
        voice: attempt.voice,
        mimeType: result.mime_type,
        sampleRate: result.sample_rate,
        audioBase64: result.audio_base64,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${attempt.backend} (${attempt.voice}): ${message}`);
    }
  }

  throw new Error(errors.join(" · "));
}

export async function synthesizeAndPlayLocalSpeech(
  text: string,
  speech: SpeechSettings,
  playback: SpeechAudioPlayback,
  options: SynthesizeLocalSpeechOptions = {},
): Promise<LocalSpeechSynthesisOutcome> {
  const synthesis = await synthesizeLocalSpeech(text, speech, options);
  await playback.warmUp();
  await playback.enqueueBase64Audio(
    synthesis.audioBase64,
    synthesis.mimeType ?? `audio/pcm;rate=${synthesis.sampleRate}`,
  );
  await playback.waitUntilIdle();
  return synthesis;
}

export async function testLocalSpeechTts(
  speech: SpeechSettings,
  text: string = DEFAULT_LOCAL_TTS_TEST_PHRASE,
): Promise<LocalSpeechTtsTestResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Test text is empty." };
  }

  const playback = new SpeechAudioPlayback();
  try {
    const result = await synthesizeAndPlayLocalSpeech(trimmed, speech, playback);
    return {
      ok: true,
      backend: result.backend,
      voice: result.voice,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    playback.interrupt();
  }
}

export async function speakLocalAssistantText(text: string, speech: SpeechSettings): Promise<void> {
  if (!shouldSpeakAssistantText(speech)) {
    return;
  }

  await speakChatAssistantText(text, speech);
}

/** Chat-TTS fallback — unabhängig von speech.voiceResponses (Gemini Live). */
export async function speakChatAssistantText(text: string, speech: SpeechSettings): Promise<void> {
  const spoken = plainTextForSpeech(text);
  if (!spoken) {
    return;
  }

  if (activeLocalSession && !activeLocalSession.isClosed) {
    await activeLocalSession.speakText(spoken);
    return;
  }

  try {
    await synthesizeAndPlayLocalSpeech(spoken, speech, standalonePlayback);
  } catch (error) {
    console.warn("Chat assistant TTS failed:", error);
  }
}

export function interruptLocalSpeechPlayback(): void {
  activeLocalSession?.requestClientInterrupt();
  standalonePlayback.interrupt();
}
