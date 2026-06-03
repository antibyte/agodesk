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

  async enqueueBase64Pcm(base64: string, mimeType?: string): Promise<void> {
    const sourceRate = parseSampleRate(mimeType);
    const pcm = base64ToInt16(base64);
    if (pcm.length === 0) {
      return;
    }

    const floatSamples = int16ToFloat32(pcm);
    this.queue.push({ samples: floatSamples, rate: sourceRate });
    await this.drainQueue();
  }

  interrupt(): void {
    this.queue = [];
    this.nextStartTime = 0;
    this.draining = false;

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
        source.connect(context.destination);

        const startTime = Math.max(context.currentTime + 0.02, this.nextStartTime);
        source.start(startTime);
        this.nextStartTime = startTime + buffer.duration;
      }
    } finally {
      this.draining = false;
      if (this.queue.length > 0) {
        void this.drainQueue();
      }
    }
  }
}
