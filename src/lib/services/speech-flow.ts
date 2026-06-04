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
let liveSession: GeminiLiveSession | null = null;
let audioCapture: SpeechAudioCapture | null = null;
let activeConnectingSession: GeminiLiveSession | null = null;

const MAX_PENDING_AUDIO_CHUNKS = 120;

export interface SpeechSessionOptions {

  onFinalTranscript: (text: string) => void | Promise<void>;

  getToolContext?: () => SpeechToolContext;

  getAgentContext?: () => SpeechAgentContext;

  onAssistantText?: (text: string) => void;

}

export function isSpeechSessionActive(): boolean {

  return liveSession !== null || activeConnectingSession !== null;

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

  liveSession?.disconnect();

  liveSession = null;

  activeConnectingSession?.disconnect();

  activeConnectingSession = null;

  speechState.reset();

}

export function getSpeechAudioAnalyser(): AnalyserNode | null {
  return audioCapture?.getAnalyser() ?? null;
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


