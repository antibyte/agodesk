import { piperVoicesForSpeechLanguage } from "./speech-locale";
import { speechTtsStatus } from "./speech-sidecar";

/** Piper voices to try, preferred first, then locale catalog, then English. */
export function piperVoiceCandidateOrder(language: string, preferred?: string): string[] {
  const preferredVoice = preferred?.trim();
  const localeVoices = piperVoicesForSpeechLanguage(language);
  const englishVoices = piperVoicesForSpeechLanguage("en-US");
  const ordered: string[] = [];

  for (const voice of [preferredVoice, ...localeVoices, ...englishVoices]) {
    if (!voice || ordered.includes(voice)) {
      continue;
    }
    ordered.push(voice);
  }

  return ordered;
}

export async function resolveReadyPiperVoice(
  language: string,
  preferred?: string,
): Promise<string | null> {
  for (const voice of piperVoiceCandidateOrder(language, preferred)) {
    try {
      const status = await speechTtsStatus(voice);
      if (status.ready) {
        return voice;
      }
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

export async function isPiperVoiceReady(voice: string): Promise<boolean> {
  try {
    const status = await speechTtsStatus(voice);
    return status.ready;
  } catch {
    return false;
  }
}
