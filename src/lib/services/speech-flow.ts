import type { SpeechSettings } from "../types/protocol";

import type { SpeechAgentContext } from "../types/speech";

import { loadGeminiApiKey } from "./gemini-credentials";

import { GeminiLiveSession } from "./gemini-live";

import { isMicrophoneSupported, SpeechAudioCapture } from "./speech-audio";

import {

  executeSpeechToolCalls,

  type SpeechToolContext,

} from "./speech-tool-router";

import { speechState } from "../stores/speech";
import { getTranslateFn } from "../i18n/store";
import { createBargeInDetector, type BargeInDetector } from "./speech-barge-detector";
import { createSpeechAudioSampler } from "./speech-visualizer-audio";
import { tryCreateSileroVAD, type VoiceActivityDetector } from "./speech-vad";

let liveSession: GeminiLiveSession | null = null;
let audioCapture: SpeechAudioCapture | null = null;
let activeConnectingSession: GeminiLiveSession | null = null;
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

  const apiKey = await loadGeminiApiKey();

  if (!apiKey) {

    speechState.setError(getTranslateFn()("speechFlow.error.noApiKey"));

    return;

  }

  speechState.setAgentMode(Boolean(speech.agentMode));

  speechState.setStatus("connecting");

  speechState.setPartialTranscript("");

  const agentContext =

    speech.agentMode && options.getAgentContext

      ? options.getAgentContext()

      : undefined;

  const session = new GeminiLiveSession(

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

        speechState.setError(message);

        void stopSpeechSession();

      },

    },

    agentContext,

  );

  activeConnectingSession = session;
  const capture = new SpeechAudioCapture();
  const pendingChunks: string[] = [];

  try {

    await capture.start((chunk) => {

      if (liveSession) {

        liveSession.sendAudio(chunk);

        return;

      }

      if (pendingChunks.length >= MAX_PENDING_AUDIO_CHUNKS) {

        pendingChunks.shift();

      }

      pendingChunks.push(chunk);

    });

    audioCapture = capture;

    await session.connect(apiKey);

    if (activeConnectingSession === session) {

      liveSession = session;

      activeConnectingSession = null;

      for (const chunk of pendingChunks) {

        session.sendAudio(chunk);

      }

      pendingChunks.length = 0;

      // Decide VAD based on settings
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
          console.warn("Silero VAD initialization failed, falling back to energy-based detection.", e);
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

  speechState.reset();

}

export function getSpeechAudioAnalyser(): AnalyserNode | null {
  return audioCapture?.getAnalyser() ?? null;
}

/** Returns analyser for the AI's voice output (playback). Useful for lip-sync or AI-specific metrics. */
export function getSpeechPlaybackAnalyser(): AnalyserNode | null {
  return liveSession?.getPlaybackAnalyser() ?? null;
}



export async function testGeminiConnection(

  speech: SpeechSettings,

  apiKey: string,

): Promise<void> {

  const session = new GeminiLiveSession(

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

    await session.connect(apiKey.trim());

  } finally {

    session.disconnect();

  }

}


