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

export class SpeechAudioPlayback {
  private context: AudioContext | null = null;
  private queue: Array<{ samples: Float32Array; rate: number }> = [];
  private nextStartTime = 0;
  private draining = false;
  private active = false;
  private activeSources = 0;
  private playbackAnalyser: AnalyserNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();

  /** True while AI voice audio is queued or actively playing (including the tail of the last buffer). */
  get isActive(): boolean {
    return this.active || this.queue.length > 0 || this.activeSources > 0;
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

  async enqueueBase64Audio(base64: string, mimeType?: string): Promise<void> {
    if (isPcmMimeType(mimeType)) {
      await this.enqueueBase64Pcm(base64, mimeType);
      return;
    }

    const bytes = base64ToBytes(base64);
    if (bytes.length === 0) {
      return;
    }

    if (!this.active) {
      this.active = true;
    }

    const context = await this.ensureContext();
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const audioBuffer = await context.decodeAudioData(copy);
    const channel = audioBuffer.getChannelData(0);
    this.queue.push({ samples: channel.slice(), rate: audioBuffer.sampleRate });
    await this.drainQueue();
  }

  interrupt(): void {
    this.queue = [];
    this.nextStartTime = 0;
    this.draining = false;
    this.active = false;

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
      this.context = new AudioContext({ sampleRate: DEFAULT_OUTPUT_SAMPLE_RATE });
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

        const buffer = context.createBuffer(1, item.samples.length, item.rate);
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
