/**
 * Interface for Voice Activity Detectors.
 * Implementations can be energy-based, Silero, WebRTC VAD, etc.
 */
export interface VoiceActivityDetector {
  /** Process a chunk of audio samples (float32 -1..1 or raw). Returns true if speech detected. */
  process(samples: Float32Array): boolean;
  /** Reset internal state (e.g. after turn change). */
  reset(): void;
  /** Optional: get current confidence/energy. */
  getConfidence?(): number;
}

const MSG_SPEECH_START = "SPEECH_START";
const MSG_SPEECH_END = "SPEECH_END";

function vadAssetBase(): string {
  const base = import.meta.env?.BASE_URL ?? "/";
  return `${base}vad/`;
}

type SileroFrameProcessor = {
  process: (frame: Float32Array) => Promise<{ msg?: string; probs?: { isSpeech: number } }>;
  reset?: () => void;
};

function vadAssetUrl(fileName: string): string {
  return `${vadAssetBase()}${fileName}`;
}

async function configureOnnxRuntime(ort: typeof import("onnxruntime-web")): Promise<void> {
  ort.env.wasm.wasmPaths = vadAssetBase();
  // Tauri/WebView2 is often not crossOriginIsolated — single-thread WASM is more reliable.
  ort.env.wasm.numThreads = 1;
}

/**
 * Simple but improved energy-based VAD with attack/release and adaptive threshold.
 * Good baseline before adding Silero WASM.
 */
export class EnergyVoiceActivityDetector implements VoiceActivityDetector {
  private smoothedEnergy = 0.02;
  private speaking = false;
  private consecutiveSpeechFrames = 0;
  private consecutiveSilenceFrames = 0;

  private readonly speakOnThreshold = 0.065;
  private readonly speakOffThreshold = 0.045;
  private readonly minSpeechFrames = 3;
  private readonly minSilenceFrames = 8;

  process(samples: Float32Array): boolean {
    if (!samples || samples.length === 0) {
      return this.speaking;
    }

    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i] ?? 0;
      sumSquares += s * s;
    }
    const rms = Math.sqrt(sumSquares / samples.length);

    const attack = this.speaking ? 0.35 : 0.22;
    const release = this.speaking ? 0.08 : 0.06;
    const blend = rms > this.smoothedEnergy ? attack : release;
    this.smoothedEnergy += (rms - this.smoothedEnergy) * blend;

    const currentThreshold = this.speaking ? this.speakOffThreshold : this.speakOnThreshold;

    if (this.smoothedEnergy > currentThreshold) {
      this.consecutiveSpeechFrames += 1;
      this.consecutiveSilenceFrames = 0;
    } else {
      this.consecutiveSilenceFrames += 1;
      this.consecutiveSpeechFrames = Math.max(0, this.consecutiveSpeechFrames - 1);
    }

    if (!this.speaking && this.consecutiveSpeechFrames >= this.minSpeechFrames) {
      this.speaking = true;
    } else if (this.speaking && this.consecutiveSilenceFrames >= this.minSilenceFrames) {
      this.speaking = false;
    }

    return this.speaking;
  }

  reset(): void {
    this.smoothedEnergy = 0.02;
    this.speaking = false;
    this.consecutiveSpeechFrames = 0;
    this.consecutiveSilenceFrames = 0;
  }

  getConfidence(): number {
    return this.smoothedEnergy;
  }
}

export function createDefaultVAD(): VoiceActivityDetector {
  return new EnergyVoiceActivityDetector();
}

/**
 * Silero-based VAD via onnxruntime-web + bundled model in /public/vad.
 * Uses the non-real-time frame processor (no AudioWorklet) — suitable for Tauri/Vite.
 */
export class SileroVoiceActivityDetector implements VoiceActivityDetector {
  private frameProcessor: SileroFrameProcessor | null = null;
  private isSpeech = false;
  private frameBuffer: Float32Array[] = [];
  private readonly frameSize = 512;
  private loaded = false;
  private loadError = "";

  async initialize(): Promise<void> {
    if (this.loaded) {
      return;
    }

    try {
      const ort = await import("onnxruntime-web");
      await configureOnnxRuntime(ort);

      const modelUrl = vadAssetUrl("silero_vad.onnx");
      const modelFetcher = async (): Promise<ArrayBuffer> => {
        const response = await fetch(modelUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${modelUrl}`);
        }
        return response.arrayBuffer();
      };

      const { PlatformAgnosticNonRealTimeVAD } = await import(
        "@ricky0123/vad-web/dist/_common/non-real-time-vad.js"
      );

      const vad = await PlatformAgnosticNonRealTimeVAD._new(modelFetcher, ort, {
        frameSamples: 512,
        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.35,
        redemptionFrames: 3,
        preSpeechPadFrames: 0,
        minSpeechFrames: 1,
      });

      this.frameProcessor = (vad.frameProcessor as SileroFrameProcessor | undefined) ?? null;
      if (!this.frameProcessor) {
        throw new Error("Silero frame processor not initialized");
      }

      this.loaded = true;
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err);
      console.error("Failed to initialize Silero VAD:", err);
      this.frameProcessor = null;
      this.loaded = false;
    }
  }

  process(samples: Float32Array): boolean {
    if (!this.frameProcessor || !this.loaded) {
      return false;
    }

    this.frameBuffer.push(samples);

    let flat: Float32Array;
    if (this.frameBuffer.length === 1) {
      flat = this.frameBuffer[0];
    } else {
      const total = this.frameBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
      flat = new Float32Array(total);
      let offset = 0;
      for (const chunk of this.frameBuffer) {
        flat.set(chunk, offset);
        offset += chunk.length;
      }
      this.frameBuffer = [flat];
    }

    while (flat.length >= this.frameSize) {
      const frame = flat.subarray(0, this.frameSize);
      void this.processFrameAsync(frame);

      if (flat.length > this.frameSize) {
        flat = flat.subarray(this.frameSize);
        this.frameBuffer = [flat];
      } else {
        this.frameBuffer = [];
        flat = new Float32Array(0);
      }
    }

    return this.isSpeech;
  }

  private async processFrameAsync(frame: Float32Array): Promise<void> {
    if (!this.frameProcessor) {
      return;
    }

    try {
      const { msg, probs } = await this.frameProcessor.process(frame);
      if (msg === MSG_SPEECH_START) {
        this.isSpeech = true;
      } else if (msg === MSG_SPEECH_END) {
        this.isSpeech = false;
      } else if (probs && probs.isSpeech > 0.5) {
        this.isSpeech = true;
      }
    } catch (err) {
      console.warn("Silero frame processing error:", err);
    }
  }

  reset(): void {
    this.isSpeech = false;
    this.frameBuffer = [];
    this.frameProcessor?.reset?.();
  }

  getConfidence(): number {
    return this.isSpeech ? 1.0 : 0.0;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getLoadError(): string {
    return this.loadError;
  }
}

/**
 * Tries to create a Silero VAD. Returns null when loading fails (caller uses energy fallback).
 */
export async function tryCreateSileroVAD(): Promise<SileroVoiceActivityDetector | null> {
  const silero = new SileroVoiceActivityDetector();
  await silero.initialize();
  return silero.isLoaded() ? silero : null;
}

/** @deprecated Use tryCreateSileroVAD — kept for compatibility. */
export async function createSileroVAD(): Promise<VoiceActivityDetector> {
  const silero = await tryCreateSileroVAD();
  return silero ?? new EnergyVoiceActivityDetector();
}
