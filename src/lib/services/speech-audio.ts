import { configureSpeechAnalyser } from "./speech-visualizer-audio";

const TARGET_SAMPLE_RATE = 16_000;

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
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.silentGain = this.context.createGain();
    this.silentGain.gain.value = 0;

    this.processor.onaudioprocess = (event) => {
      void this.handleAudioProcess(event);
    };

    this.source.connect(this.analyser);
    this.analyser.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(this.context.destination);
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
    this.vadProcessors = this.vadProcessors.filter(p => p !== processor);
  }

  private async handleAudioProcess(
    event: AudioProcessingEvent,
  ): Promise<void> {
    await this.ensureContextRunning();

    const channel = event.inputBuffer.getChannelData(0);

    // Feed raw samples to VAD processors (low latency for barge-in)
    for (const proc of this.vadProcessors) {
      try {
        proc(channel);
      } catch (e) {
        // don't let a bad VAD break the pipeline
      }
    }

    if (!this.onChunk) {
      return;
    }

    const downsampled = downsampleBuffer(
      channel,
      this.inputRate,
      TARGET_SAMPLE_RATE,
    );
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

    this.processor?.disconnect();
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.silentGain?.disconnect();
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
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}
