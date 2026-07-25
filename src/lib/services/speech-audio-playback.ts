import { configureSpeechAnalyser } from "./speech-visualizer-audio";

const DEFAULT_OUTPUT_SAMPLE_RATE = 24_000;

function parseSampleRate(mimeType: string | undefined): number {
  if (!mimeType) {
    return DEFAULT_OUTPUT_SAMPLE_RATE;
  }
  const match = mimeType.match(/rate=(\d+)/i);
  if (!match) {
    return DEFAULT_OUTPUT_SAMPLE_RATE;
  }
  const rate = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_OUTPUT_SAMPLE_RATE;
}

function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isPcmMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) {
    return true;
  }
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return base === "audio/pcm" || base === "audio/l16" || base === "audio/raw";
}

function int16ToFloat32(pcm: Int16Array): Float32Array {
  const output = new Float32Array(pcm.length);
  for (let index = 0; index < pcm.length; index += 1) {
    output[index] = (pcm[index] ?? 0) / 0x8000;
  }
  return output;
}

function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const usable = binary.length - (binary.length % 4);
  if (usable <= 0) {
    return new Float32Array(0);
  }
  const bytes = new Uint8Array(usable);
  for (let index = 0; index < usable; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  // Copy via DataView so we never share a pooled/unaligned buffer with AudioBuffer.
  const view = new DataView(bytes.buffer, bytes.byteOffset, usable);
  const samples = new Float32Array(usable / 4);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getFloat32(index * 4, true);
  }
  return samples;
}

export class SpeechAudioPlayback {
  private context: AudioContext | null = null;
  private queue: Array<{ samples: Float32Array; rate: number }> = [];
  private nextStartTime = 0;
  private draining = false;
  private active = false;
  private activeSources = 0;
  private playbackAnalyser: AnalyserNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private htmlAudio: HTMLAudioElement | null = null;
  private htmlObjectUrl: string | null = null;

  /** True while AI voice audio is queued or actively playing (including the tail of the last buffer). */
  get isActive(): boolean {
    return (
      this.active ||
      this.queue.length > 0 ||
      this.activeSources > 0 ||
      (this.htmlAudio != null && !this.htmlAudio.paused && !this.htmlAudio.ended)
    );
  }

  /**
   * Returns an AnalyserNode connected to the playback output.
   * Useful for lip-sync, AI-voice visualizers, or future barge-in metrics based on output.
   */
  getPlaybackAnalyser(): AnalyserNode | null {
    if (!this.context) return null;
    if (!this.playbackAnalyser) {
      this.playbackAnalyser = this.context.createAnalyser();
      configureSpeechAnalyser(this.playbackAnalyser);
    }
    return this.playbackAnalyser;
  }

  async enqueueBase64Pcm(base64: string, mimeType?: string): Promise<void> {
    const sourceRate = parseSampleRate(mimeType);
    const pcm = base64ToInt16(base64);
    if (pcm.length === 0) {
      return;
    }

    if (!this.active) {
      this.active = true;
    }

    const floatSamples = int16ToFloat32(pcm);
    this.queue.push({ samples: floatSamples, rate: sourceRate });
    await this.drainQueue();
  }

  /** Enqueue raw float32 little-endian PCM (e.g. Voxtral TTS `response_format: "pcm"`). */
  async enqueueBase64Float32Pcm(base64: string, sampleRate: number): Promise<void> {
    const samples = base64ToFloat32(base64);
    if (samples.length === 0) {
      return;
    }
    if (!this.active) {
      this.active = true;
    }
    const rate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : DEFAULT_OUTPUT_SAMPLE_RATE;
    this.queue.push({ samples, rate });
    await this.drainQueue();
  }

  async enqueueBase64Audio(base64: string, mimeType?: string): Promise<void> {
    if (isPcmMimeType(mimeType)) {
      await this.enqueueBase64Pcm(base64, mimeType);
      return;
    }

    const bytes = base64ToBytes(base64);
    if (bytes.length === 0) {
      return;
    }

    // Prefer HTMLAudioElement for compressed formats — more reliable in WebView2
    // than AudioContext.decodeAudioData + BufferSource scheduling.
    const mime = mimeType?.split(";")[0]?.trim() || "audio/mpeg";
    try {
      await this.playHtmlAudio(bytes, mime);
      return;
    } catch (htmlError) {
      console.warn("HTMLAudioElement playback failed, falling back to Web Audio:", htmlError);
    }

    if (!this.active) {
      this.active = true;
    }

    const context = await this.ensureContext();
    // decodeAudioData detaches its argument; pass an exact-sized ArrayBuffer copy.
    const exact = bytes.slice();
    const copy = exact.buffer.slice(exact.byteOffset, exact.byteOffset + exact.byteLength);
    const audioBuffer = await context.decodeAudioData(copy);
    const channel = audioBuffer.getChannelData(0);
    this.queue.push({ samples: channel.slice(), rate: audioBuffer.sampleRate });
    await this.drainQueue();
  }

  private stopHtmlAudio(): void {
    if (this.htmlAudio) {
      try {
        this.htmlAudio.pause();
        this.htmlAudio.removeAttribute("src");
        this.htmlAudio.load();
      } catch {
        // ignore
      }
      this.htmlAudio = null;
    }
    if (this.htmlObjectUrl) {
      try {
        URL.revokeObjectURL(this.htmlObjectUrl);
      } catch {
        // ignore
      }
      this.htmlObjectUrl = null;
    }
  }

  private async playHtmlAudio(bytes: Uint8Array, mimeType: string): Promise<void> {
    this.stopHtmlAudio();

    const copy = bytes.slice();
    const blob = new Blob([copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)], {
      type: mimeType,
    });
    const url = URL.createObjectURL(blob);
    this.htmlObjectUrl = url;

    const audio = new Audio();
    audio.preload = "auto";
    audio.src = url;
    this.htmlAudio = audio;
    this.active = true;

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        audio.onended = null;
        audio.onerror = null;
      };
      audio.onended = () => {
        cleanup();
        this.active = false;
        this.stopHtmlAudio();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        this.active = false;
        const mediaError = audio.error;
        this.stopHtmlAudio();
        reject(
          new Error(
            mediaError
              ? `HTMLAudioElement error code ${mediaError.code}`
              : "HTMLAudioElement playback failed",
          ),
        );
      };
      void audio.play().catch((error) => {
        cleanup();
        this.active = false;
        this.stopHtmlAudio();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  interrupt(): void {
    this.queue = [];
    this.nextStartTime = 0;
    this.draining = false;
    this.active = false;
    this.stopHtmlAudio();

    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped or never started.
      }
      source.disconnect();
    }
    this.sources.clear();
    this.activeSources = 0;

    if (this.playbackAnalyser) {
      this.playbackAnalyser.disconnect();
      this.playbackAnalyser = null;
    }

    if (!this.context) {
      return;
    }

    void this.context.close();
    this.context = null;
  }

  stop(): void {
    this.interrupt();
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.context || this.context.state === "closed") {
      // Prefer the WebView default sample rate. Forcing 24 kHz made some
      // Windows WebView2 builds reject MP3 buffers decoded at 44.1/48 kHz.
      this.context = new AudioContext();
      this.nextStartTime = 0;
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    return this.context;
  }

  /** Unlock output after a user gesture (required in many WebView/browser builds). */
  async warmUp(): Promise<void> {
    const context = await this.ensureContext();
    const buffer = context.createBuffer(1, 1, context.sampleRate);
    buffer.getChannelData(0)[0] = 0;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
  }

  async waitUntilIdle(timeoutMs = 60_000): Promise<void> {
    const started = Date.now();
    while (this.isActive) {
      if (Date.now() - started > timeoutMs) {
        throw new Error("Speech playback timed out.");
      }
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    }
  }

  private async drainQueue(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;

    try {
      while (this.queue.length > 0) {
        const context = await this.ensureContext();
        const item = this.queue.shift();
        if (!item || item.samples.length === 0) {
          continue;
        }

        // Some WebViews only accept createBuffer rates that match the context.
        // Fall back to context.sampleRate (slight pitch/tempo shift) rather than silence.
        let buffer: AudioBuffer;
        try {
          buffer = context.createBuffer(1, item.samples.length, item.rate);
        } catch {
          buffer = context.createBuffer(1, item.samples.length, context.sampleRate);
        }
        buffer.copyToChannel(item.samples, 0);

        const source = context.createBufferSource();
        source.buffer = buffer;
        this.sources.add(source);

        const analyser = this.playbackAnalyser;
        if (analyser) {
          source.connect(analyser);
          analyser.connect(context.destination);
        } else {
          source.connect(context.destination);
        }

        this.activeSources += 1;
        source.onended = () => {
          this.sources.delete(source);
          this.activeSources = Math.max(0, this.activeSources - 1);
          if (this.activeSources === 0 && this.queue.length === 0) {
            this.active = false;
          }
        };

        const startTime = Math.max(context.currentTime + 0.02, this.nextStartTime);
        source.start(startTime);
        this.nextStartTime = startTime + buffer.duration;
      }
    } finally {
      this.draining = false;
      if (this.queue.length > 0) {
        void this.drainQueue();
      } else if (this.activeSources === 0) {
        // No more audio queued and no sources playing → no longer actively speaking
        this.active = false;
      }
    }
  }
}
