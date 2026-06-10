import { invoke } from "@tauri-apps/api/core";



export interface SpeechSidecarPingData {

  version: string;

  dev_mode?: boolean;

  models_root?: string;

  capabilities?: string[];

}



export interface SpeechTranscribeResult {

  text: string;

  language?: string;

  dev_mode?: boolean;

  model_ready?: boolean;

}



export interface SpeechSynthesizeResult {

  /** Base64-encoded audio (PCM or compressed, see mime_type). */
  audio_base64: string;

  sample_rate: number;

  mime_type?: string;

  dev_mode?: boolean;

}



function isTauriRuntime(): boolean {

  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

}



function isRecord(value: unknown): value is Record<string, unknown> {

  return typeof value === "object" && value !== null;

}



function normalizeTranscribeResult(raw: unknown): SpeechTranscribeResult {

  if (!isRecord(raw)) {

    throw new Error("Invalid transcribe response from speech sidecar.");

  }

  const nested = isRecord(raw.data) ? raw.data : raw;

  const text = typeof nested.text === "string" ? nested.text : "";

  return {

    text,

    language: typeof nested.language === "string" ? nested.language : undefined,

    dev_mode: nested.dev_mode === true,

    model_ready: nested.model_ready === true,

  };

}



function normalizeSynthesizeResult(raw: unknown): SpeechSynthesizeResult {

  if (!isRecord(raw)) {

    throw new Error("Invalid synthesize response from speech sidecar.");

  }

  const nested = isRecord(raw.data) ? raw.data : raw;

  const audioBase64 =
    typeof nested.audio_base64 === "string"
      ? nested.audio_base64
      : typeof nested.pcm_base64 === "string"
        ? nested.pcm_base64
        : "";

  const sampleRate =

    typeof nested.sample_rate === "number" && Number.isFinite(nested.sample_rate)

      ? nested.sample_rate

      : 22_050;

  if (!audioBase64) {

    throw new Error("Speech synthesis response missing audio data.");

  }

  return {

    audio_base64: audioBase64,

    sample_rate: sampleRate,

    mime_type: typeof nested.mime_type === "string" ? nested.mime_type : undefined,

    dev_mode: nested.dev_mode === true,

  };

}



async function invokeSpeech<T>(command: string, args?: Record<string, unknown>): Promise<T> {

  if (!isTauriRuntime()) {

    throw new Error("Speech sidecar requires the Tauri desktop app.");

  }

  return invoke<T>(command, args ?? {});

}



export async function speechSidecarPing(): Promise<SpeechSidecarPingData> {

  const data = await invokeSpeech<SpeechSidecarPingData>("speech_sidecar_ping");

  return data;

}

export interface SpeechAsrStatus {
  model_id: string;
  ready: boolean;
  model_path?: string | null;
  tokens_path?: string | null;
  models_root: string;
  download_hint: string;
}

export async function speechAsrStatus(model?: string): Promise<SpeechAsrStatus> {
  return invokeSpeech<SpeechAsrStatus>("speech_asr_status", {
    model: model ?? null,
  });
}

export interface SpeechTtsStatus {
  voice_id: string;
  ready: boolean;
  model_path?: string | null;
  tokens_path?: string | null;
  models_root: string;
  download_hint: string;
}

export async function speechTtsStatus(voice?: string): Promise<SpeechTtsStatus> {
  return invokeSpeech<SpeechTtsStatus>("speech_tts_status", {
    voice: voice ?? null,
  });
}

export interface SpeechModelDownloadProgress {
  model_id: string;
  phase: "downloading" | "extracting" | "complete" | "error";
  progress: number;
  message?: string;
}

const SPEECH_MODEL_DOWNLOAD_EVENT = "agodesk:speech-model-download";

export async function downloadSpeechAsrModel(model: string): Promise<void> {
  await invokeSpeech<void>("speech_download_asr_model", { model });
}

export async function listenSpeechModelDownload(
  handler: (progress: SpeechModelDownloadProgress) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<SpeechModelDownloadProgress>(
    SPEECH_MODEL_DOWNLOAD_EVENT,
    (event) => handler(event.payload),
  );
  return unlisten;
}

export async function speechSidecarTranscribe(params: {
  pcmBase64: string;
  sampleRate?: number;
  language?: string;
  model?: string;
}): Promise<SpeechTranscribeResult> {

  if (!params.pcmBase64.trim()) {

    return { text: "" };

  }

  const data = await invokeSpeech<unknown>("speech_sidecar_transcribe", {

    pcmBase64: params.pcmBase64,

    sampleRate: params.sampleRate ?? 16_000,

    language: params.language ?? null,

    model: params.model ?? null,

  });

  return normalizeTranscribeResult(data);

}



export async function speechSidecarSynthesize(params: {

  text: string;

  voice: string;

  backend: string;

  rate?: number;

  pitch?: number;

}): Promise<SpeechSynthesizeResult> {

  const data = await invokeSpeech<unknown>("speech_sidecar_synthesize", {

    text: params.text,

    voice: params.voice,

    backend: params.backend,

    rate: params.rate ?? null,

    pitch: params.pitch ?? null,

  });

  return normalizeSynthesizeResult(data);

}

const DEV_ASR_PATTERN = /^\[Dev-ASR ~(\d+)ms/i;

/** Placeholder text from sidecar when no sherpa-onnx model is installed yet. */
export function isDevAsrPlaceholder(text: string): boolean {
  return DEV_ASR_PATTERN.test(text.trim());
}

export function parseDevAsrDurationMs(text: string): number | null {
  const match = DEV_ASR_PATTERN.exec(text.trim());
  if (!match) {
    return null;
  }
  const duration = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(duration) ? duration : null;
}
