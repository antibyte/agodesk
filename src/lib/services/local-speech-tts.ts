import type { SpeechSettings } from "../types/protocol";
import { speechProviderRequiresGeminiApiKey } from "../types/protocol";
import { LocalSpeechSession } from "./local-speech-session";

let activeLocalSession: LocalSpeechSession | null = null;

export function registerActiveLocalSpeechSession(session: LocalSpeechSession | null): void {
  activeLocalSession = session;
}

export function shouldUseLocalSpeechTts(
  speech: SpeechSettings,
  sessionActive: boolean,
): boolean {
  return (
    sessionActive &&
    speech.voiceResponses &&
    !speechProviderRequiresGeminiApiKey(speech.provider) &&
    !speech.agentMode
  );
}

export async function speakLocalAssistantText(
  text: string,
  speech: SpeechSettings,
): Promise<void> {
  if (!shouldUseLocalSpeechTts(speech, activeLocalSession !== null)) {
    return;
  }
  await activeLocalSession?.speakText(text);
}

export function interruptLocalSpeechPlayback(): void {
  activeLocalSession?.requestClientInterrupt();
}
