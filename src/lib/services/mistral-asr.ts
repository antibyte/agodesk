import { invoke } from "@tauri-apps/api/core";
import type { SpeechSettings } from "../types/protocol";
import { DEFAULT_MISTRAL_ASR_MODEL } from "../types/protocol";

interface MistralTranscription {
  text: string;
}

/**
 * Transcribe one captured utterance (16-bit mono PCM base64 @ 16 kHz) via the
 * Rust-proxied Voxtral batch ASR endpoint.
 */
export async function transcribeMistralUtterance(
  pcmBase64: string,
  speech: SpeechSettings,
  sampleRate = 16_000,
): Promise<string> {
  const result = await invoke<MistralTranscription>("mistral_transcribe", {
    pcmBase64,
    sampleRate,
    model: speech.mistralAsrModel?.trim() || DEFAULT_MISTRAL_ASR_MODEL,
    language: speech.language?.trim() || undefined,
  });
  return (result?.text ?? "").trim();
}
