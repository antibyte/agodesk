import type { SpeechSettings, AgentMoodMetadata } from "../types/protocol";
import { speechProviderRequiresGeminiApiKey } from "../types/protocol";

import type { SpeechAgentContext } from "../types/speech";

import { loadGeminiApiKey } from "./gemini-credentials";

import { isMicrophoneSupported, SpeechAudioCapture } from "./speech-audio";

import { executeSpeechToolCalls, type SpeechToolContext } from "./speech-tool-router";

import { speechState } from "../stores/speech";
import { agentMoodState } from "../stores/agent-mood";
import { get } from "svelte/store";
import { getTranslateFn } from "../i18n/store";
import { createBargeInDetector, type BargeInDetector } from "./speech-barge-detector";
import { createSpeechAudioSampler } from "./speech-visualizer-audio";
import { tryCreateSileroVAD, type VoiceActivityDetector } from "./speech-vad";
import type { ActiveSpeechSession } from "./speech-session";
import { createActiveSpeechSession } from "./speech-session-factory";
import { LocalSpeechSession } from "./local-speech-session";
import { registerActiveLocalSpeechSession } from "./local-speech-tts";

let liveSession: ActiveSpeechSession | null = null;
let audioCapture: SpeechAudioCapture | null = null;
let activeConnectingSession: ActiveSpeechSession | null = null;
let bargeDetector: BargeInDetector | null = null;

const MAX_PENDING_AUDIO_CHUNKS = 120;

export interface SpeechSessionOptions {
  onFinalTranscript: (text: string) => void | Promise<void>;

  getToolContext?: () => SpeechToolContext;

  getAgentContext?: () => SpeechAgentContext;

  onAssistantText?: (text: string) => void;

  /** Called when client-side barge-in (user interrupting AI speech) is detected. */
  onBargeIn?: () => void;
}

export function applyAgentMoodToSpeechSession(mood: AgentMoodMetadata): void {
  liveSession?.applyAgentMood(mood);
  activeConnectingSession?.applyAgentMood(mood);
}

/** @deprecated Use applyAgentMoodToSpeechSession */
export const applyAgentMoodToLiveSession = applyAgentMoodToSpeechSession;

export function isSpeechSessionActive(): boolean {
  return liveSession !== null || activeConnectingSession !== null;
}

export function isAiSpeaking(): boolean {
  return liveSession?.isAiSpeaking ?? false;
}

/**
 * Immediately stops local AI voice playback (barge-in).
 * Should be called by a client-side VAD detector.
 */
export function requestBargeInInterrupt(): void {
  liveSession?.requestClientInterrupt();
}

export async function toggleSpeechSession(
  speech: SpeechSettings,

  options: SpeechSessionOptions,
): Promise<void> {
  if (liveSession || activeConnectingSession) {
    await stopSpeechSession();

    return;
  }

  if (!speech.enabled) {
    speechState.setError(getTranslateFn()("speechFlow.error.disabled"));

    return;
  }

  if (!isMicrophoneSupported()) {
    speechState.setError(getTranslateFn()("speechFlow.error.noMicrophone"));

    return;
  }

  speechState.setProvider(speech.provider);
  speechState.setAgentMode(Boolean(speech.agentMode));
  speechState.setStatus("connecting");
  speechState.setPartialTranscript("");

  let apiKey: string | undefined;
  if (speechProviderRequiresGeminiApiKey(speech.provider)) {
    apiKey = (await loadGeminiApiKey()) ?? undefined;
    if (!apiKey) {
      speechState.setError(getTranslateFn()("speechFlow.error.noApiKey"));
      return;
    }
  }

  const agentContext =
    speech.agentMode && options.getAgentContext ? options.getAgentContext() : undefined;

  const initialMood = get(agentMoodState).mood;

  const session = createActiveSpeechSession(
    speech,

    {
      onStatus: (status) => {
        speechState.setStatus(status);
      },

      onPartialTranscript: (text) => {
        speechState.setPartialTranscript(text);
      },

      onFinalTranscript: (text) => {
        if (text.trim()) {
          speechState.setPartialTranscript("");

          void Promise.resolve(options.onFinalTranscript(text.trim()));
        }
      },

      onAssistantText: (text) => {
        options.onAssistantText?.(text);
      },

      onToolCalls: async (calls) => {
        const context = options.getToolContext?.();

        if (!context) {
          return calls.map((call) => ({
            id: call.id,

            name: call.name,

            response: {
              success: false,

              error: getTranslateFn()("speechFlow.error.toolContextUnavailable"),
            },
          }));
        }

        return executeSpeechToolCalls(calls, context);
      },

      onError: (message) => {
        if (session instanceof LocalSpeechSession) {
          speechState.setStatus("listening");
          speechState.setPartialTranscript(message);
          window.setTimeout(() => {
            speechState.setPartialTranscript("");
          }, 3000);
          return;
        }

        speechState.setError(message);

        void stopSpeechSession();
      },
    },

    agentContext,

    initialMood ?? null,
  );

  activeConnectingSession = session;
  const capture = new SpeechAudioCapture();
  const pendingChunks: string[] = [];

  try {
    await capture.start((chunk) => {
      if (liveSession?.sendAudio) {
        liveSession.sendAudio(chunk);

        return;
      }

      if (pendingChunks.length >= MAX_PENDING_AUDIO_CHUNKS) {
        pendingChunks.shift();
      }

      pendingChunks.push(chunk);
    });

    audioCapture = capture;

    await session.connect(apiKey ? { apiKey } : undefined);

    if (activeConnectingSession === session) {
      liveSession = session;

      activeConnectingSession = null;

      registerActiveLocalSpeechSession(session instanceof LocalSpeechSession ? session : null);

      if (session.sendAudio) {
        for (const chunk of pendingChunks) {
          session.sendAudio(chunk);
        }

        pendingChunks.length = 0;
      }

      // Barge-in applies to any pipeline with voice playback (Gemini + local TTS).
      const mode = speech.bargeInMode ?? "auto";
      const t = getTranslateFn();
      speechState.setVadLoading(mode !== "energy");
      speechState.clearVadError();

      let activeVAD: VoiceActivityDetector | undefined;

      if (mode === "energy") {
        // force energy only
        activeVAD = undefined;
        speechState.setVadLoading(false);
      } else {
        // auto or silero → try Silero
        try {
          const silero = await tryCreateSileroVAD();
          if (silero) {
            activeVAD = silero;
          } else {
            throw new Error(t("speechFlow.error.vadSileroFailed"));
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(
            "Silero VAD initialization failed, falling back to energy-based detection.",
            e,
          );
          speechState.setVadError(t("speechFlow.error.vadSileroFallback", { message: msg }));
          activeVAD = undefined;
        } finally {
          speechState.setVadLoading(false);
        }
      }

      if (mode === "silero" && !activeVAD) {
        speechState.setVadError(t("speechFlow.error.vadSileroFailed"));
      }

      const playbackAnalyser = getSpeechPlaybackAnalyser();
      let playbackSampler: ReturnType<typeof createSpeechAudioSampler> | null = null;
      if (playbackAnalyser) {
        playbackSampler = createSpeechAudioSampler(playbackAnalyser);
      }

      // Start client-side barge-in detector.
      // Phase 2: uses direct low-latency path via capture VAD processors when possible.
      bargeDetector?.stop();
      bargeDetector = createBargeInDetector({
        getIsAiSpeaking: () => !!liveSession?.isAiSpeaking,
        onBargeIn: () => {
          // Immediate local stop of AI voice
          requestBargeInInterrupt();

          // Give user immediate feedback that we heard them
          speechState.setPartialTranscript("");
          speechState.setStatus("listening");

          // Notify the UI layer (ChatView) if they provided a handler
          options.onBargeIn?.();
        },
        energyThreshold: 0.105,
        minSpeakingSamples: 2,
        getPlaybackEnergy: () => {
          if (!playbackSampler) {
            return 0;
          }
          try {
            return playbackSampler().energy ?? 0;
          } catch {
            return 0;
          }
        },
        vad: activeVAD,
      });

      // Attach direct raw-audio VAD path for low latency (preferred)
      if (audioCapture && bargeDetector.processRawAudio) {
        const processRawAudio = bargeDetector.processRawAudio.bind(bargeDetector);
        audioCapture.addVadProcessor(processRawAudio);
      }

      bargeDetector.start();
    }
  } catch (error) {
    if (activeConnectingSession === session) {
      capture.stop();
      audioCapture = null;

      session.disconnect();

      activeConnectingSession = null;
      registerActiveLocalSpeechSession(null);

      speechState.setError(
        error instanceof Error
          ? error.message
          : getTranslateFn()("speechFlow.error.sessionStartFailed"),
      );
    }
  }
}

export async function stopSpeechSession(): Promise<void> {
  audioCapture?.stop();

  audioCapture = null;

  bargeDetector?.stop();
  bargeDetector = null;

  liveSession?.disconnect();

  liveSession = null;

  activeConnectingSession?.disconnect();

  activeConnectingSession = null;

  registerActiveLocalSpeechSession(null);

  speechState.reset();
}

export function getSpeechAudioAnalyser(): AnalyserNode | null {
  return audioCapture?.getAnalyser() ?? null;
}

/** Returns analyser for the AI's voice output (playback). Useful for lip-sync or AI-specific metrics. */
export function getSpeechPlaybackAnalyser(): AnalyserNode | null {
  return liveSession?.getPlaybackAnalyser() ?? null;
}

export {
  speakLocalAssistantText,
  shouldUseLocalSpeechTts,
  testLocalSpeechTts,
  localTtsTestPhrase,
  DEFAULT_LOCAL_TTS_TEST_PHRASE,
} from "./local-speech-tts";

export async function testGeminiConnection(
  speech: SpeechSettings,

  apiKey: string,
): Promise<void> {
  if (!speechProviderRequiresGeminiApiKey(speech.provider)) {
    throw new Error(getTranslateFn()("settings.speech.apiKey.error.testGeminiOnly"));
  }

  const session = createActiveSpeechSession(
    speech,
    {
      onError: (message) => {
        throw new Error(message);
      },
    },
    speech.agentMode
      ? {
          connectionStatus: "disconnected",
          sessionStatus: "idle",
          remoteControlActive: false,
          remoteControlPending: false,
          canSendChat: false,
        }
      : undefined,
  );

  try {
    await session.connect({ apiKey: apiKey.trim() });
  } finally {
    session.disconnect();
  }
}
