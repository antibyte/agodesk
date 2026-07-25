import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { SpeechSettings } from "../types/protocol";
import { isMistralSpeechProvider, DEFAULT_MISTRAL_TTS_MODEL } from "../types/protocol";
import { plainTextForSpeech } from "./chat-format";
import { SpeechAudioPlayback } from "./speech-audio-playback";
import { isDesktopShell } from "./window-controls";

const playback = new SpeechAudioPlayback();

interface MistralSynthesis {
  audioBase64: string;
  sampleRate: number;
  encoding: string;
  playedNatively?: boolean;
}

interface MistralTtsChunk {
  audioBase64: string;
  sampleRate: number;
  encoding: string;
}

let streamCancelled = false;

export function shouldUseMistralTtsForChat(
  speech: SpeechSettings,
  options?: { chatTtsOff?: boolean; speakerMuted?: boolean },
): boolean {
  if (options?.chatTtsOff || options?.speakerMuted) {
    return false;
  }
  return isMistralSpeechProvider(speech.provider) && speech.voiceResponses !== false;
}

async function enqueueMistralAudio(
  target: SpeechAudioPlayback,
  audioBase64: string,
  encoding: string,
  sampleRate: number,
): Promise<void> {
  if (encoding === "f32le") {
    await target.enqueueBase64Float32Pcm(audioBase64, sampleRate);
    return;
  }
  if (encoding === "mp3" || encoding === "mpeg" || encoding === "audio/mpeg") {
    await target.enqueueBase64Audio(audioBase64, "audio/mpeg");
    return;
  }
  if (encoding === "wav" || encoding === "wave" || encoding === "audio/wav") {
    await target.enqueueBase64Audio(audioBase64, "audio/wav");
    return;
  }
  await target.enqueueBase64Audio(audioBase64, `audio/pcm;rate=${sampleRate}`);
}

function concatBase64Chunks(chunks: string[]): string {
  if (chunks.length === 0) {
    return "";
  }
  if (chunks.length === 1) {
    return chunks[0] ?? "";
  }
  let total = 0;
  const parts: Uint8Array[] = [];
  for (const chunk of chunks) {
    const binary = atob(chunk);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
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
  const slice = 0x8000;
  for (let i = 0; i < merged.length; i += slice) {
    binary += String.fromCharCode(...merged.subarray(i, i + slice));
  }
  return btoa(binary);
}

/**
 * Stream TTS via SSE (proxied through Rust).
 *
 * Chunks are buffered and played once at `mistral-tts:done` so partial MP3/PCM
 * frames are not fed to `decodeAudioData` / the queue one-by-one. Success is
 * only reported when at least one audio chunk was received and enqueued.
 */
export async function synthesizeMistralSpeechStreaming(
  text: string,
  speech: SpeechSettings,
  target: SpeechAudioPlayback,
): Promise<boolean> {
  const spoken = plainTextForSpeech(text);
  if (!spoken || !isDesktopShell()) {
    return false;
  }

  streamCancelled = false;
  const unlisteners: UnlistenFn[] = [];
  const audioChunks: string[] = [];
  let sampleRate = 24_000;
  let encoding = "f32le";
  let streamError: Error | null = null;

  const deferred: { resolve: ((finished: boolean) => void) | null } = { resolve: null };
  const doneWait = new Promise<boolean>((resolve) => {
    deferred.resolve = resolve;
  });
  const settleDone = (finished: boolean): void => {
    deferred.resolve?.(finished);
    deferred.resolve = null;
  };

  try {
    try {
      await target.warmUp();
    } catch (error) {
      console.warn("Mistral TTS playback warm-up failed:", error);
    }

    unlisteners.push(
      await listen<MistralTtsChunk>("mistral-tts:chunk", (event) => {
        if (streamCancelled) {
          return;
        }
        const { audioBase64, sampleRate: rate, encoding: enc } = event.payload;
        if (!audioBase64) {
          return;
        }
        audioChunks.push(audioBase64);
        if (Number.isFinite(rate) && rate > 0) {
          sampleRate = rate;
        }
        if (enc) {
          encoding = enc;
        }
      }),
    );

    unlisteners.push(
      await listen("mistral-tts:done", () => {
        settleDone(true);
      }),
    );

    unlisteners.push(
      await listen<{ message: string }>("mistral-tts:error", (event) => {
        const message =
          event.payload.message?.trim() || "Mistral streaming TTS failed";
        streamError = new Error(message);
        settleDone(true);
      }),
    );

    const invokePromise = invoke("mistral_synthesize_stream", {
      text: spoken,
      voiceId: speech.mistralVoiceId?.trim() || undefined,
      model: speech.mistralTtsModel?.trim() || DEFAULT_MISTRAL_TTS_MODEL,
    }).then(
      () => {
        // Invoke can resolve before the WebView has delivered all events.
        window.setTimeout(() => settleDone(true), 250);
      },
      (error: unknown) => {
        streamError =
          error instanceof Error
            ? error
            : new Error(typeof error === "string" ? error : "Mistral streaming TTS failed");
        settleDone(true);
      },
    );

    await Promise.race([
      doneWait,
      new Promise<boolean>((resolve) => {
        window.setTimeout(() => resolve(true), 90_000);
      }),
    ]);
    await invokePromise.catch(() => {
      // already reflected in streamError / settleDone
    });

    if (streamError) {
      throw streamError;
    }
    if (streamCancelled) {
      return false;
    }
    if (audioChunks.length === 0) {
      console.warn("Mistral streaming TTS finished with zero audio chunks");
      return false;
    }

    const merged = concatBase64Chunks(audioChunks);
    await enqueueMistralAudio(target, merged, encoding || "f32le", sampleRate);
    return true;
  } finally {
    settleDone(true);
    for (const unlisten of unlisteners) {
      try {
        unlisten();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Speak text via Voxtral TTS (unary MP3).
 *
 * Audio is played natively in Rust (Windows MediaPlayer) because WebView2
 * autoplay/gesture tokens expire across the async `invoke` boundary — FE
 * decode/HTMLAudio then reports success while remaining silent.
 */
export async function synthesizeMistralSpeech(
  text: string,
  speech: SpeechSettings,
  target: SpeechAudioPlayback = playback,
): Promise<boolean> {
  const spoken = plainTextForSpeech(text);
  if (!spoken || !isDesktopShell()) {
    return false;
  }

  try {
    // Keep WebView audio unlocked for visualizers / fallback, but primary
    // playback is native (see `play: true` below).
    try {
      await target.warmUp();
    } catch (error) {
      console.warn("Mistral TTS playback warm-up failed:", error);
    }

    const result = await invoke<MistralSynthesis>("mistral_synthesize", {
      text: spoken,
      voiceId: speech.mistralVoiceId?.trim() || undefined,
      model: speech.mistralTtsModel?.trim() || DEFAULT_MISTRAL_TTS_MODEL,
      play: true,
    });
    if (!result?.audioBase64) {
      console.warn("Mistral unary TTS returned empty audio");
      return false;
    }
    if (result.playedNatively) {
      return true;
    }
    // Fallback if native play was disabled by the backend.
    await enqueueMistralAudio(
      target,
      result.audioBase64,
      result.encoding || "mp3",
      result.sampleRate || 24_000,
    );
    return true;
  } catch (error) {
    console.warn("Mistral TTS failed:", error);
    return false;
  }
}

export async function speakWithMistralTts(
  text: string,
  speech: SpeechSettings,
): Promise<boolean> {
  if (!shouldUseMistralTtsForChat(speech)) {
    console.warn("Mistral chat TTS skipped (provider/voiceResponses/mute)");
    return false;
  }
  return synthesizeMistralSpeech(text, speech, playback);
}

/** Settings/smoke test: synthesize + native play, always reports ok/error. */
export async function testMistralSpeechTts(
  speech: SpeechSettings,
  text: string,
): Promise<{ ok: boolean; error?: string; bytes?: number; playedNatively?: boolean }> {
  const spoken = plainTextForSpeech(text);
  if (!spoken) {
    return { ok: false, error: "empty text" };
  }
  if (!isDesktopShell()) {
    return { ok: false, error: "not running in Tauri desktop shell" };
  }
  try {
    const result = await invoke<MistralSynthesis>("mistral_synthesize", {
      text: spoken,
      voiceId: speech.mistralVoiceId?.trim() || undefined,
      model: speech.mistralTtsModel?.trim() || DEFAULT_MISTRAL_TTS_MODEL,
      play: true,
    });
    if (!result?.audioBase64) {
      return { ok: false, error: "empty audio_data from API" };
    }
    const approxBytes = Math.floor((result.audioBase64.length * 3) / 4);
    if (!result.playedNatively) {
      await enqueueMistralAudio(
        playback,
        result.audioBase64,
        result.encoding || "wav",
        result.sampleRate || 24_000,
      );
      await playback.waitUntilIdle(30_000);
    }
    return { ok: true, bytes: approxBytes, playedNatively: Boolean(result.playedNatively) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function interruptMistralTtsPlayback(): void {
  streamCancelled = true;
  playback.interrupt();
  void invoke("mistral_native_playback_cancel").catch(() => {
    // ignore
  });
  void invoke("mistral_synthesize_stream_cancel").catch(() => {
    // ignore — unary playback may still be active without a stream task
  });
}
