import { configureSpeechAnalyser } from "./speech-visualizer-audio";

const TARGET_SAMPLE_RATE = 16_000;
/** Registered processor name (may contain hyphens). */
const CAPTURE_WORKLET_NAME = "agodesk-speech-capture-processor";
/** Valid JS class identifier for the inline worklet fallback. */
const CAPTURE_WORKLET_CLASS = "AgodeskSpeechCaptureProcessor";

const captureWorkletByContext = new WeakMap<AudioContext, Promise<void>>();

function workletModuleUrl(): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}audio-worklets/agodesk-speech-capture-processor.js`;
}

function captureWorkletSource(): string {
  return `
class ${CAPTURE_WORKLET_CLASS} extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}
registerProcessor("${CAPTURE_WORKLET_NAME}", ${CAPTURE_WORKLET_CLASS});
`;
}

async function ensureCaptureWorklet(context: AudioContext): Promise<void> {
  const existing = captureWorkletByContext.get(context);
  if (existing) {
    await existing;
    return;
  }

  const loading = (async () => {
    if (!("audioWorklet" in context)) {
      throw new Error("AudioWorklet is not supported in this environment.");
    }

    const moduleUrl = workletModuleUrl();
    try {
      await context.audioWorklet.addModule(moduleUrl);
    } catch (staticError) {
      console.warn(
        "Speech capture worklet URL failed, trying inline module fallback.",
        staticError,
      );
      const blob = new Blob([captureWorkletSource()], {
        type: "application/javascript",
      });
      const blobUrl = URL.createObjectURL(blob);
      try {
        await context.audioWorklet.addModule(blobUrl);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
  })();

  captureWorkletByContext.set(context, loading);
  await loading;
}

export type AudioChunkHandler = (base64Pcm: string) => void;

function floatTo16BitPcm(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function downsampleBuffer(
  buffer: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (outputRate === inputRate) {
    return buffer;
  }
  if (outputRate > inputRate) {
    return buffer;
  }

  const ratio = inputRate / outputRate;
  const length = Math.round(buffer.length / ratio);
  const result = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    const offset = Math.floor(index * ratio);
    result[index] = buffer[offset] ?? 0;
  }

  return result;
}

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const slice = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export class SpeechAudioCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private inputRate = TARGET_SAMPLE_RATE;
  private onChunk: AudioChunkHandler | null = null;
  private vadProcessors: Array<(samples: Float32Array) => void> = [];

  async start(onChunk: AudioChunkHandler): Promise<void> {
    if (this.stream) {
      return;
    }

    this.onChunk = onChunk;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    this.context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    await this.ensureContextRunning();
    this.inputRate = this.context.sampleRate;

    this.source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    configureSpeechAnalyser(this.analyser);
    this.silentGain = this.context.createGain();
    this.silentGain.gain.value = 0;
    this.silentGain.connect(this.context.destination);

    // Visualizer tap — parallel, not in the capture chain.
    this.source.connect(this.analyser);

    try {
      await ensureCaptureWorklet(this.context);
      this.worklet = new AudioWorkletNode(this.context, CAPTURE_WORKLET_NAME);
      this.worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        void this.handleSamples(event.data);
      };
      this.source.connect(this.worklet);
      this.worklet.connect(this.silentGain);
    } catch (error) {
      console.warn(
        "AudioWorklet capture unavailable, using legacy ScriptProcessor fallback.",
        error,
      );
      this.processor = this.context.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (event) => {
        void this.handleSamples(event.inputBuffer.getChannelData(0));
      };
      this.source.connect(this.processor);
      this.processor.connect(this.silentGain);
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /**
   * Register a processor that receives raw float32 mic samples (before downsampling).
   * Used for low-latency barge-in VAD while AI is speaking.
   */
  addVadProcessor(processor: (samples: Float32Array) => void): void {
    if (!this.vadProcessors.includes(processor)) {
      this.vadProcessors.push(processor);
    }
  }

  removeVadProcessor(processor: (samples: Float32Array) => void): void {
    this.vadProcessors = this.vadProcessors.filter((entry) => entry !== processor);
  }

  private async handleSamples(channel: Float32Array): Promise<void> {
    await this.ensureContextRunning();

    for (const proc of this.vadProcessors) {
      try {
        proc(channel);
      } catch {
        // don't let a bad VAD break the pipeline
      }
    }

    if (!this.onChunk) {
      return;
    }

    const downsampled = downsampleBuffer(channel, this.inputRate, TARGET_SAMPLE_RATE);
    if (downsampled.length === 0) {
      return;
    }

    const pcm = floatTo16BitPcm(downsampled);
    this.onChunk(int16ToBase64(pcm));
  }

  private async ensureContextRunning(): Promise<void> {
    if (!this.context || this.context.state !== "suspended") {
      return;
    }
    try {
      await this.context.resume();
    } catch {
      // Mikrofon-Pipeline bleibt aktiv; der nächste Chunk versucht es erneut.
    }
  }

  stop(): void {
    this.onChunk = null;
    this.vadProcessors = [];

    this.worklet?.port.close();
    this.worklet?.disconnect();
    this.processor?.disconnect();
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.silentGain?.disconnect();
    this.worklet = null;
    this.processor = null;
    this.source = null;
    this.analyser = null;
    this.silentGain = null;

    if (this.context) {
      void this.context.close();
      this.context = null;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }
}

export function isMicrophoneSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}
