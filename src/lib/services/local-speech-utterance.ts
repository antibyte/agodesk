import { createUtteranceVAD, type VoiceActivityDetector } from "./speech-vad";

const SAMPLE_RATE = 16_000;
const MIN_SPEECH_MS = 280;
const END_SILENCE_MS = 550;
const MAX_UTTERANCE_MS = 30_000;

function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

function int16ToFloat32(pcm: Int16Array): Float32Array {
  const output = new Float32Array(pcm.length);
  for (let index = 0; index < pcm.length; index += 1) {
    output[index] = (pcm[index] ?? 0) / 0x8000;
  }
  return output;
}

function concatBase64Pcm(chunks: string[]): string {
  if (chunks.length === 0) {
    return "";
  }
  if (chunks.length === 1) {
    return chunks[0] ?? "";
  }

  const parts: Uint8Array[] = [];
  let total = 0;
  for (const chunk of chunks) {
    const binary = atob(chunk);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    parts.push(bytes);
    total += bytes.length;
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < merged.length; index += chunkSize) {
    const slice = merged.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export type UtteranceCompleteHandler = (pcmBase64: string, durationMs: number) => void;

/**
 * Buffers microphone PCM and emits one utterance when energy-VAD detects end-of-speech.
 */
export class LocalSpeechUtteranceEndpoint {
  private readonly vad: VoiceActivityDetector;
  private readonly onUtteranceComplete: UtteranceCompleteHandler;
  private chunks: string[] = [];
  private inSpeech = false;
  private speechMs = 0;
  private silenceMs = 0;
  private utteranceMs = 0;

  constructor(onUtteranceComplete: UtteranceCompleteHandler, vad?: VoiceActivityDetector) {
    this.onUtteranceComplete = onUtteranceComplete;
    this.vad = vad ?? createUtteranceVAD();
  }

  pushBase64Chunk(base64: string, chunkDurationMs?: number): void {
    const pcm = base64ToInt16(base64);
    if (pcm.length === 0) {
      return;
    }

    const durationMs = chunkDurationMs ?? Math.round((pcm.length / SAMPLE_RATE) * 1000);
    const floatSamples = int16ToFloat32(pcm);
    const speaking = this.vad.process(floatSamples);

    if (speaking) {
      this.chunks.push(base64);
      this.inSpeech = true;
      this.speechMs += durationMs;
      this.silenceMs = 0;
      this.utteranceMs += durationMs;

      if (this.utteranceMs >= MAX_UTTERANCE_MS) {
        this.finishUtterance();
      }
      return;
    }

    if (this.inSpeech) {
      this.chunks.push(base64);
      this.utteranceMs += durationMs;
      this.silenceMs += durationMs;

      if (this.silenceMs >= END_SILENCE_MS) {
        this.finishUtterance();
      }
    }
  }

  reset(): void {
    this.chunks = [];
    this.inSpeech = false;
    this.speechMs = 0;
    this.silenceMs = 0;
    this.utteranceMs = 0;
    this.vad.reset();
  }

  private finishUtterance(): void {
    if (!this.inSpeech || this.speechMs < MIN_SPEECH_MS) {
      this.reset();
      return;
    }

    const pcmBase64 = concatBase64Pcm(this.chunks);
    const durationMs = this.utteranceMs;
    this.reset();

    if (pcmBase64) {
      this.onUtteranceComplete(pcmBase64, durationMs);
    }
  }
}
