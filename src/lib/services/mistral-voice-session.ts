import type { UnlistenFn } from "@tauri-apps/api/event";
import type { AgentMoodMetadata, SpeechSettings } from "../types/protocol";
import { getTranslateFn } from "../i18n/store";
import type { ActiveSpeechSession, SpeechSessionCallbacks } from "./speech-session";
import { LocalSpeechUtteranceEndpoint } from "./local-speech-utterance";
import { createUtteranceVAD, tryCreateSileroVAD } from "./speech-vad";
import { transcribeMistralUtterance } from "./mistral-asr";
import { interruptMistralTtsPlayback, synthesizeMistralSpeech } from "./mistral-tts";
import { hasMistralApiKey } from "./mistral-credentials";
import { SpeechAudioPlayback } from "./speech-audio-playback";
import {
  accumulateRealtimeTranscript,
  parseMistralRealtimeEvent,
} from "./mistral-realtime-protocol";
import {
  appendAudioMessage,
  connectMistralRealtime,
  disconnectMistralRealtime,
  endAudioMessage,
  flushAudioMessage,
  sendMistralRealtimeJson,
  subscribeMistralRealtime,
} from "./mistral-realtime";

const UTTERANCE_SAMPLE_RATE = 16_000;
const REALTIME_TRANSCRIPTION_TIMEOUT_MS = 8_000;
const REALTIME_OPEN_TIMEOUT_MS = 10_000;

/**
 * Mistral Voice pipeline: Silero-endpointed microphone utterances → Voxtral
 * batch or realtime ASR → AuraGo/chat reply → Voxtral TTS playback. Mirrors the
 * local utterance loop but proxies ASR/TTS through the cloud instead of the sidecar.
 */
export class MistralVoiceSession implements ActiveSpeechSession {
  private closed = true;
  private mood: AgentMoodMetadata | null = null;
  private endpoint: LocalSpeechUtteranceEndpoint | null = null;
  private readonly playback = new SpeechAudioPlayback();
  private transcribing = false;
  private speaking = false;
  private realtime = false;
  private realtimeOpen = false;
  private unlisteners: UnlistenFn[] = [];
  private partialAcc = "";
  private pendingFinal: {
    resolve: (text: string) => void;
    reject: (error: Error) => void;
    timer: number;
  } | null = null;

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
    interruptMistralTtsPlayback();
    this.playback.interrupt();
    this.speaking = false;
  }

  getPlaybackAnalyser(): AnalyserNode | null {
    return this.playback.getPlaybackAnalyser();
  }

  sendAudio(base64Pcm: string): void {
    if (this.closed) {
      return;
    }
    // Drop mic while TTS plays — otherwise Silero endpointing / realtime ASR
    // eats loudspeaker echo as a new user turn (and barge-in used to kill TTS).
    if (this.speaking || this.playback.isActive) {
      return;
    }
    if (!this.transcribing) {
      this.endpoint?.pushBase64Chunk(base64Pcm);
    }
    if (this.realtime && this.realtimeOpen && !this.transcribing) {
      void sendMistralRealtimeJson(appendAudioMessage(base64Pcm)).catch((error) => {
        console.warn("Mistral realtime audio append failed:", error);
      });
    }
  }

  async connect(): Promise<void> {
    this.closed = false;
    this.callbacks.onStatus?.("connecting");

    const hasKey = await hasMistralApiKey();
    if (!hasKey) {
      const message = getTranslateFn()("speechFlow.error.noApiKey.mistral_voice");
      this.callbacks.onError?.(message);
      this.callbacks.onStatus?.("error");
      this.closed = true;
      throw new Error(message);
    }

    if (this.speech.mistralRealtimeEnabled) {
      await this.tryConnectRealtime();
    }

    // Prefer Silero endpointing; fall back to the sensitive energy VAD on load failure.
    let vad = createUtteranceVAD();
    if (this.speech.bargeInMode !== "energy") {
      try {
        const silero = await tryCreateSileroVAD();
        if (silero) {
          vad = silero;
        }
      } catch (error) {
        console.warn("Silero VAD unavailable for Mistral Voice, using energy VAD:", error);
      }
    }

    if (this.closed) {
      return;
    }

    this.endpoint = new LocalSpeechUtteranceEndpoint((pcmBase64) => {
      void this.handleUtterance(pcmBase64);
    }, vad);

    this.callbacks.onStatus?.("listening");

    try {
      await this.playback.warmUp();
    } catch (error) {
      console.warn("Speech playback warm-up failed:", error);
    }
  }

  disconnect(): void {
    this.closed = true;
    this.clearPendingFinal();
    this.partialAcc = "";
    this.realtime = false;
    this.realtimeOpen = false;
    this.endpoint?.reset();
    this.endpoint = null;
    this.playback.interrupt();
    this.speaking = false;
    this.transcribing = false;

    const unlisteners = this.unlisteners.splice(0, this.unlisteners.length);
    for (const unlisten of unlisteners) {
      try {
        unlisten();
      } catch {
        // ignore
      }
    }

    void disconnectMistralRealtime().catch(() => {
      // ignore — local cleanup already done (same pattern as Grok Voice)
    });

    this.callbacks.onStatus?.("idle");
  }

  async speakText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    if (this.closed) {
      throw new Error("Mistral voice session is closed");
    }

    this.speaking = true;
    this.callbacks.onStatus?.("speaking");

    try {
      const ok = await synthesizeMistralSpeech(trimmed, this.speech, this.playback);
      if (!ok) {
        throw new Error("Mistral TTS produced no audible audio");
      }
      // Native WinMM play finishes inside synthesize; WebView queue is usually empty.
      await this.playback.waitUntilIdle();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.callbacks.onError?.(getTranslateFn()("speechFlow.error.synthesizeFailed", { message }));
      throw error instanceof Error ? error : new Error(message);
    } finally {
      this.speaking = false;
      if (!this.closed) {
        this.callbacks.onStatus?.("listening");
      }
    }
  }

  private async tryConnectRealtime(): Promise<void> {
    let resolveOpen: (() => void) | null = null;
    let rejectOpen: ((error: Error) => void) | null = null;
    const openTimer = window.setTimeout(() => {
      rejectOpen?.(new Error("Mistral realtime connection timeout"));
    }, REALTIME_OPEN_TIMEOUT_MS);

    const openWait = new Promise<void>((resolve, reject) => {
      resolveOpen = resolve;
      rejectOpen = reject;
    });

    const settleOpen = (error?: Error) => {
      window.clearTimeout(openTimer);
      if (error) {
        rejectOpen?.(error);
      } else {
        resolveOpen?.();
      }
      resolveOpen = null;
      rejectOpen = null;
    };

    try {
      this.unlisteners = await subscribeMistralRealtime({
        onMessage: (raw) => this.handleRealtimeMessage(raw),
        onState: (state) => {
          if (state === "open") {
            this.realtimeOpen = true;
            settleOpen();
          } else if (state === "closed") {
            this.realtimeOpen = false;
            this.rejectPendingFinal(new Error("Mistral realtime connection closed"));
            if (!this.closed && this.realtime) {
              this.realtime = false;
            }
          }
        },
        onError: (message) => {
          const error = new Error(message.trim() || "Mistral realtime WebSocket error");
          settleOpen(error);
          this.rejectPendingFinal(error);
          if (!this.closed) {
            this.realtime = false;
            this.realtimeOpen = false;
          }
        },
      });

      await connectMistralRealtime({
        model: this.speech.mistralRealtimeAsrModel,
        targetStreamingDelayMs: this.speech.mistralTargetStreamingDelayMs,
      });

      await openWait;
      this.realtime = true;
    } catch (error) {
      console.warn("Mistral realtime unavailable, using batch ASR:", error);
      this.cleanupRealtimeListeners();
      this.realtime = false;
      this.realtimeOpen = false;
    }
  }

  private cleanupRealtimeListeners(): void {
    const unlisteners = this.unlisteners.splice(0, this.unlisteners.length);
    for (const unlisten of unlisteners) {
      try {
        unlisten();
      } catch {
        // ignore
      }
    }
    void disconnectMistralRealtime().catch(() => {
      // ignore
    });
  }

  private handleRealtimeMessage(raw: unknown): void {
    if (this.closed) {
      return;
    }

    const event = parseMistralRealtimeEvent(raw);

    if (event.type === "error" || event.errorMessage) {
      this.rejectPendingFinal(
        new Error(event.errorMessage ?? "Mistral realtime transcription error"),
      );
      return;
    }

    const prev = this.partialAcc;
    this.partialAcc = accumulateRealtimeTranscript(prev, event);

    if (event.type === "transcription.text.delta" && this.partialAcc !== prev) {
      this.callbacks.onPartialTranscript?.(this.partialAcc);
    }

    if (event.type === "transcription.done") {
      const finalText = this.partialAcc.trim();
      if (this.pendingFinal) {
        this.pendingFinal.resolve(finalText);
        this.clearPendingFinal();
      }
    }
  }

  private waitForTranscriptionDone(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.clearPendingFinal();
        reject(new Error("Mistral realtime transcription timeout"));
      }, REALTIME_TRANSCRIPTION_TIMEOUT_MS);

      this.pendingFinal = { resolve, reject, timer };
    });
  }

  private clearPendingFinal(): void {
    if (!this.pendingFinal) {
      return;
    }
    window.clearTimeout(this.pendingFinal.timer);
    this.pendingFinal = null;
  }

  private rejectPendingFinal(error: Error): void {
    if (!this.pendingFinal) {
      return;
    }
    this.pendingFinal.reject(error);
    this.clearPendingFinal();
  }

  private async handleUtterance(pcmBase64: string): Promise<void> {
    if (this.closed || this.transcribing) {
      return;
    }

    this.transcribing = true;
    this.callbacks.onStatus?.("processing");

    try {
      let text = "";

      if (this.realtime) {
        if (!this.partialAcc.trim()) {
          this.callbacks.onPartialTranscript?.(
            getTranslateFn()("speechFlow.processingUtterance"),
          );
        }
        try {
          const donePromise = this.waitForTranscriptionDone();
          await sendMistralRealtimeJson(flushAudioMessage());
          await sendMistralRealtimeJson(endAudioMessage());
          text = await donePromise;
        } catch (error) {
          console.warn("Mistral realtime transcription failed, falling back to batch:", error);
          text = await transcribeMistralUtterance(
            pcmBase64,
            this.speech,
            UTTERANCE_SAMPLE_RATE,
          );
        }
      } else {
        this.callbacks.onPartialTranscript?.(getTranslateFn()("speechFlow.processingUtterance"));
        text = await transcribeMistralUtterance(pcmBase64, this.speech, UTTERANCE_SAMPLE_RATE);
      }

      if (this.closed) {
        return;
      }

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
      const message = error instanceof Error ? error.message : String(error);
      this.callbacks.onError?.(getTranslateFn()("speechFlow.error.transcribeFailed", { message }));
    } finally {
      this.partialAcc = "";
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
