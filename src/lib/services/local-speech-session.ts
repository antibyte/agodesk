import type { AgentMoodMetadata, SpeechSettings } from "../types/protocol";
import { getTranslateFn } from "../i18n/store";
import type { ActiveSpeechSession, SpeechSessionCallbacks } from "./speech-session";
import { LocalSpeechUtteranceEndpoint } from "./local-speech-utterance";
import {
  speechSidecarPing,
  speechSidecarSynthesize,
  speechSidecarTranscribe,
} from "./speech-sidecar";
import { SpeechAudioPlayback } from "./speech-audio-playback";

/**
 * Hybrid (local ASR + online TTS) and offline (local ASR + Piper) speech pipeline
 * via the agodesk-speech sidecar (in-process in dev, spawned binary in release).
 */
export class LocalSpeechSession implements ActiveSpeechSession {
  private closed = true;
  private mood: AgentMoodMetadata | null = null;
  private endpoint: LocalSpeechUtteranceEndpoint | null = null;
  private readonly playback = new SpeechAudioPlayback();
  private transcribing = false;
  private speaking = false;

  constructor(
    private readonly speech: SpeechSettings,
    private readonly callbacks: SpeechSessionCallbacks,
  ) {}

  get isAiSpeaking(): boolean {
    return this.playback.isActive || this.speaking;
  }

  applyAgentMood(mood: AgentMoodMetadata | null): void {
    this.mood = mood;
  }

  requestClientInterrupt(): void {
    this.playback.interrupt();
    this.speaking = false;
  }

  getPlaybackAnalyser(): AnalyserNode | null {
    return this.playback.getPlaybackAnalyser();
  }

  sendAudio(base64Pcm: string): void {
    if (this.closed || this.transcribing) {
      return;
    }
    this.endpoint?.pushBase64Chunk(base64Pcm);
  }

  async connect(): Promise<void> {
    this.closed = false;
    this.callbacks.onStatus?.("connecting");

    try {
      await speechSidecarPing();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      const translated = getTranslateFn()("speechFlow.error.sidecarUnavailable", {
        message,
      });
      this.callbacks.onError?.(translated);
      this.callbacks.onStatus?.("error");
      this.closed = true;
      throw new Error(translated);
    }

    this.endpoint = new LocalSpeechUtteranceEndpoint((pcmBase64) => {
      void this.handleUtterance(pcmBase64);
    });

    this.callbacks.onStatus?.("listening");
  }

  disconnect(): void {
    this.closed = true;
    this.endpoint?.reset();
    this.endpoint = null;
    this.playback.interrupt();
    this.speaking = false;
    this.transcribing = false;
    this.callbacks.onStatus?.("idle");
  }

  async speakText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || this.closed) {
      return;
    }

    const backend =
      this.speech.provider === "hybrid"
        ? this.speech.hybridTtsBackend
        : "piper";
    const voice =
      this.speech.provider === "hybrid"
        ? this.speech.hybridTtsVoice
        : this.speech.offlineTtsVoice;

    this.speaking = true;
    this.callbacks.onStatus?.("speaking");

    try {
      const result = await speechSidecarSynthesize({
        text: trimmed,
        voice,
        backend,
      });
      if (this.closed) {
        return;
      }
      await this.playback.enqueueBase64Pcm(
        result.pcm_base64,
        result.mime_type ?? `audio/pcm;rate=${result.sample_rate}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.callbacks.onError?.(
        getTranslateFn()("speechFlow.error.synthesizeFailed", { message }),
      );
    } finally {
      this.speaking = false;
      if (!this.closed) {
        this.callbacks.onStatus?.("listening");
      }
    }
  }

  private async handleUtterance(pcmBase64: string): Promise<void> {
    if (this.closed || this.transcribing) {
      return;
    }

    this.transcribing = true;
    this.callbacks.onStatus?.("processing");
    this.callbacks.onPartialTranscript?.(
      getTranslateFn()("speechFlow.processingUtterance"),
    );

    try {
      const result = await speechSidecarTranscribe({
        pcmBase64,
        sampleRate: 16_000,
        language: this.speech.language,
        model: this.speech.localAsrModel,
      });

      if (this.closed) {
        return;
      }

      const text = result.text.trim();
      if (text) {
        this.callbacks.onPartialTranscript?.(text);
        this.callbacks.onFinalTranscript?.(text);
        this.callbacks.onPartialTranscript?.("");
      } else {
        const hint = getTranslateFn()("speechFlow.error.noSpeechDetected");
        this.callbacks.onPartialTranscript?.(hint);
        window.setTimeout(() => {
          if (!this.closed) {
            this.callbacks.onPartialTranscript?.("");
          }
        }, 1500);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.callbacks.onError?.(
        getTranslateFn()("speechFlow.error.transcribeFailed", { message }),
      );
    } finally {
      this.transcribing = false;
      if (!this.closed) {
        this.callbacks.onStatus?.("listening");
      }
    }
  }

  get storedMood(): AgentMoodMetadata | null {
    return this.mood;
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
