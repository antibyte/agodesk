import type { AgentMoodMetadata, SpeechSettings } from "../types/protocol";
import type { SpeechAgentContext } from "../types/speech";
import {
  isGrokSpeechProvider,
  isMistralSpeechProvider,
  speechProviderRequiresGeminiApiKey,
} from "../types/protocol";
import { GeminiLiveSession } from "./gemini-live";
import { GrokVoiceSession } from "./grok-voice";
import { LocalSpeechSession } from "./local-speech-session";
import { MistralVoiceSession } from "./mistral-voice-session";
import type { ActiveSpeechSession, SpeechSessionCallbacks } from "./speech-session";

export function createActiveSpeechSession(
  speech: SpeechSettings,
  callbacks: SpeechSessionCallbacks,
  agentContext?: SpeechAgentContext,
  initialMood?: AgentMoodMetadata | null,
): ActiveSpeechSession {
  if (isGrokSpeechProvider(speech.provider)) {
    return new GrokVoiceSession(speech, callbacks, agentContext, initialMood ?? null);
  }

  if (isMistralSpeechProvider(speech.provider)) {
    return new MistralVoiceSession(speech, callbacks);
  }

  if (speechProviderRequiresGeminiApiKey(speech.provider)) {
    return new GeminiLiveSession(speech, callbacks, agentContext, initialMood ?? null);
  }

  return new LocalSpeechSession(speech, callbacks);
}
