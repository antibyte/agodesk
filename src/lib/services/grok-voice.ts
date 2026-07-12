import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AgentMoodMetadata, SpeechSettings } from "../types/protocol";
import {
  GROK_INPUT_SAMPLE_RATE,
  GROK_OUTPUT_SAMPLE_RATE,
  normalizeGrokVoiceModelId,
  normalizeGrokVoiceName,
  toGrokLanguageHint,
} from "../types/grok-voice";
import type { SpeechAgentContext, SpeechStatus } from "../types/speech";
import { SpeechAudioPlayback } from "./speech-audio-playback";
import {
  AURAGO_AGENT_NAME,
  buildAgentSystemInstruction,
  buildGrokAgentTools,
  buildTranscriptionSystemInstruction,
  type GeminiFunctionCall,
  type GeminiFunctionResponse,
} from "./speech-tools";

export interface GrokVoiceCallbacks {
  onStatus?: (status: SpeechStatus) => void;
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onAssistantText?: (text: string) => void;
  onToolCalls?: (calls: GeminiFunctionCall[]) => Promise<GeminiFunctionResponse[]>;
  onError?: (message: string) => void;
}

const SETUP_TIMEOUT_MS = 30_000;
const PLAYBACK_WAIT_TIMEOUT_MS = 45_000;
const PLAYBACK_POLL_MS = 40;

export function buildGrokSessionUpdate(
  speech: SpeechSettings,
  agentContext?: SpeechAgentContext,
  agentMood?: AgentMoodMetadata | null,
): Record<string, unknown> {
  const agentMode = speech.agentMode && !!agentContext;
  const voice = normalizeGrokVoiceName(speech.voiceName);
  const languageHint = toGrokLanguageHint(speech.language);

  const instructions = agentMode
    ? buildAgentSystemInstruction(speech, agentContext, agentMood)
    : buildTranscriptionSystemInstruction(speech, speech.voiceResponses, agentMood);

  const session: Record<string, unknown> = {
    voice,
    instructions,
    // Defaults aligned with xAI Voice Agent docs (server_vad + documented VAD fields).
    turn_detection: {
      type: "server_vad",
      threshold: 0.85,
      silence_duration_ms: 500,
      prefix_padding_ms: 333,
    },
    audio: {
      input: {
        format: {
          type: "audio/pcm",
          rate: GROK_INPUT_SAMPLE_RATE,
        },
        // Bias ASR toward product names (reduces AuraGo → Auramon style mishearings).
        transcription: {
          ...(languageHint ? { language_hint: languageHint } : {}),
          keyterms: [AURAGO_AGENT_NAME, "Aura Go", "agodesk", "AuraGo Agent"],
        },
      },
      output: {
        format: {
          type: "audio/pcm",
          rate: GROK_OUTPUT_SAMPLE_RATE,
        },
      },
    },
    reasoning: {
      effort: "none",
    },
  };

  if (agentMode) {
    session.tools = buildGrokAgentTools();
  }

  return {
    type: "session.update",
    session,
  };
}

export function buildGrokAudioAppendMessage(base64Pcm: string): Record<string, unknown> {
  return {
    type: "input_audio_buffer.append",
    audio: base64Pcm,
  };
}

export function buildGrokFunctionCallOutputMessage(
  callId: string,
  output: unknown,
): Record<string, unknown> {
  return {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: typeof output === "string" ? output : JSON.stringify(output),
    },
  };
}

export function buildGrokResponseCreateMessage(): Record<string, unknown> {
  return { type: "response.create" };
}

export function buildGrokResponseCancelMessage(): Record<string, unknown> {
  return { type: "response.cancel" };
}

/**
 * xAI extension: TTS-synthesize exact text without involving the model.
 * Used so AuraGo chat replies play in the configured Grok voice.
 */
export function buildGrokForceMessage(
  text: string,
  options?: { interruptible?: boolean },
): Record<string, unknown> {
  return {
    type: "conversation.item.create",
    item: {
      type: "force_message",
      role: "assistant",
      interruptible: options?.interruptible !== false,
      content: [{ type: "output_text", text }],
    },
  };
}

/** Soft cap so huge tool dumps do not flood the realtime session. */
export const GROK_FORCE_MESSAGE_MAX_CHARS = 4_000;

export function truncateForGrokForceMessage(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= GROK_FORCE_MESSAGE_MAX_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, GROK_FORCE_MESSAGE_MAX_CHARS - 1)}…`;
}

export function normalizeGrokWsPayload(data: string | ArrayBuffer | Blob): string {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseGrokEvent(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

export function extractGrokEventType(event: Record<string, unknown>): string {
  return typeof event.type === "string" ? event.type : "";
}

export function extractGrokErrorMessage(event: Record<string, unknown>): string | null {
  const type = extractGrokEventType(event);
  if (type === "error") {
    const error = asRecord(event.error) ?? event;
    const message =
      (typeof error.message === "string" && error.message) ||
      (typeof event.message === "string" && event.message) ||
      "Grok Voice API-Fehler.";
    return message;
  }
  return null;
}

/** User transcript text from input-audio transcription events. */
export function extractGrokInputTranscript(event: Record<string, unknown>): {
  text: string;
  final: boolean;
} {
  const type = extractGrokEventType(event);
  const transcript =
    (typeof event.transcript === "string" && event.transcript) ||
    (typeof asRecord(event.item)?.transcript === "string" &&
      (asRecord(event.item)?.transcript as string)) ||
    "";

  if (
    type === "conversation.item.input_audio_transcription.completed" ||
    type === "conversation.item.input_audio_transcription.done"
  ) {
    return { text: transcript.trim(), final: true };
  }

  if (
    type === "conversation.item.input_audio_transcription.delta" ||
    type === "conversation.item.input_audio_transcription.updated"
  ) {
    // xAI "updated" is cumulative; "delta" is incremental — callers treat text as partial.
    return { text: transcript.trim(), final: false };
  }

  return { text: "", final: false };
}

export function extractGrokOutputAudioDelta(event: Record<string, unknown>): string | null {
  const type = extractGrokEventType(event);
  if (
    type !== "response.output_audio.delta" &&
    type !== "response.audio.delta"
  ) {
    return null;
  }
  if (typeof event.delta === "string" && event.delta) {
    return event.delta;
  }
  if (typeof event.audio === "string" && event.audio) {
    return event.audio;
  }
  return null;
}

export function extractGrokOutputTranscriptDelta(event: Record<string, unknown>): string {
  const type = extractGrokEventType(event);
  if (
    type === "response.output_audio_transcript.delta" ||
    type === "response.audio_transcript.delta"
  ) {
    return typeof event.delta === "string" ? event.delta : "";
  }
  if (
    type === "response.output_audio_transcript.done" ||
    type === "response.audio_transcript.done"
  ) {
    return typeof event.transcript === "string" ? event.transcript : "";
  }
  return "";
}

export function extractGrokFunctionCall(event: Record<string, unknown>): GeminiFunctionCall | null {
  if (extractGrokEventType(event) !== "response.function_call_arguments.done") {
    return null;
  }
  const name = typeof event.name === "string" ? event.name : "";
  if (!name) {
    return null;
  }
  const callId =
    (typeof event.call_id === "string" && event.call_id) ||
    (typeof event.id === "string" && event.id) ||
    crypto.randomUUID();

  let args: Record<string, unknown> = {};
  if (typeof event.arguments === "string") {
    try {
      const parsed = JSON.parse(event.arguments) as unknown;
      args = asRecord(parsed) ?? {};
    } catch {
      args = {};
    }
  } else if (asRecord(event.arguments)) {
    args = asRecord(event.arguments) ?? {};
  }

  return { id: callId, name, args };
}

export class GrokVoiceSession {
  /** True while the native Rust transport is open. */
  private transportOpen = false;
  private setupDone = false;
  private closed = false;
  private callbacks: GrokVoiceCallbacks;
  private speech: SpeechSettings;
  private agentContext?: SpeechAgentContext;
  private resolveSetup: (() => void) | null = null;
  private rejectSetup: ((error: Error) => void) | null = null;
  private connectionId = 0;
  private audioPlayback: SpeechAudioPlayback | null = null;
  private agentMood: AgentMoodMetadata | null = null;
  private assistantTranscript = "";
  private pendingToolCalls: GeminiFunctionCall[] = [];
  private handlingTools = false;
  private userPartial = "";
  private unlisteners: UnlistenFn[] = [];
  private sessionUpdateSent = false;

  constructor(
    speech: SpeechSettings,
    callbacks: GrokVoiceCallbacks,
    agentContext?: SpeechAgentContext,
    agentMood?: AgentMoodMetadata | null,
  ) {
    this.speech = speech;
    this.callbacks = callbacks;
    this.agentContext = agentContext;
    this.agentMood = agentMood ?? null;
  }

  applyAgentMood(mood: AgentMoodMetadata | null): void {
    this.agentMood = mood;
    if (this.transportOpen && this.setupDone) {
      void this.sendJson(
        buildGrokSessionUpdate(this.speech, this.agentContext, this.agentMood),
      );
    }
  }

  get isAiSpeaking(): boolean {
    return !!this.audioPlayback?.isActive;
  }

  requestClientInterrupt(): void {
    this.audioPlayback?.interrupt();
    if (this.transportOpen && this.setupDone) {
      void this.sendJson(buildGrokResponseCancelMessage());
    }
  }

  getPlaybackAnalyser(): AnalyserNode | null {
    return this.audioPlayback?.getPlaybackAnalyser() ?? null;
  }

  async connect(_options?: { apiKey?: string }): Promise<void> {
    if (this.transportOpen || this.unlisteners.length > 0) {
      return;
    }

    const activeConnectionId = ++this.connectionId;
    this.closed = false;
    this.setupDone = false;
    this.sessionUpdateSent = false;
    this.callbacks.onStatus?.("connecting");

    const modelId = normalizeGrokVoiceModelId(this.speech.modelId);

    const setupWait = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (activeConnectionId !== this.connectionId) {
          return;
        }
        this.resolveSetup = null;
        this.rejectSetup = null;
        reject(new Error(`Setup-Timeout. Modell „${modelId}“ und API-Key prüfen.`));
      }, SETUP_TIMEOUT_MS);

      this.resolveSetup = () => {
        if (activeConnectionId !== this.connectionId) {
          return;
        }
        window.clearTimeout(timeout);
        this.resolveSetup = null;
        this.rejectSetup = null;
        resolve();
      };
      this.rejectSetup = (error) => {
        if (activeConnectionId !== this.connectionId) {
          return;
        }
        window.clearTimeout(timeout);
        this.resolveSetup = null;
        this.rejectSetup = null;
        reject(error);
      };
    });

    try {
      await this.attachNativeListeners(activeConnectionId);
      let lastConnectError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await invoke("xai_realtime_connect", { model: modelId });
          lastConnectError = null;
          break;
        } catch (error) {
          lastConnectError = error;
          const text =
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : String(error);
          const lower = text.toLowerCase();
          const transient =
            lower.includes("failed to fetch") ||
            lower.includes("connection refused") ||
            lower.includes("err_connection_refused") ||
            lower.includes("ipc custom protocol failed");
          if (!transient || attempt === 2) {
            throw error;
          }
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 120 + attempt * 180);
          });
        }
      }
      if (lastConnectError) {
        throw lastConnectError;
      }
    } catch (error) {
      this.cleanupConnection();
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Grok Voice Verbindung fehlgeschlagen.";
      throw new Error(message);
    }

    if (activeConnectionId !== this.connectionId || this.closed) {
      throw new Error("Grok Voice Session abgebrochen.");
    }

    await setupWait;
  }

  sendAudio(base64Pcm: string): void {
    if (!this.transportOpen || !this.setupDone) {
      return;
    }
    void this.sendJson(buildGrokAudioAppendMessage(base64Pcm));
  }

  /**
   * Speak AuraGo (or other) text in the configured Grok voice via force_message.
   * Does not use the chat TTS path (Edge/Piper/AuraGo server audio).
   */
  async speakText(text: string): Promise<void> {
    const spoken = truncateForGrokForceMessage(text);
    if (!spoken) {
      return;
    }
    if (!this.transportOpen || !this.setupDone || this.closed) {
      throw new Error("Grok Voice Session ist nicht bereit für Vorlesen.");
    }
    if (!this.speech.voiceResponses) {
      return;
    }
    // Ensure playback path exists (same as setup).
    if (!this.audioPlayback) {
      this.audioPlayback = new SpeechAudioPlayback();
    }
    this.callbacks.onStatus?.("speaking");
    await this.sendJson(buildGrokForceMessage(spoken, { interruptible: true }));
  }

  disconnect(): void {
    this.cleanupConnection();
  }

  private async attachNativeListeners(connectionId: number): Promise<void> {
    const onMessage = await listen<{ data: string }>("xai-realtime:message", (event) => {
      if (connectionId !== this.connectionId) {
        return;
      }
      void this.handleEvent(event.payload?.data ?? "", connectionId);
    });

    const onState = await listen<{ state: string }>("xai-realtime:state", (event) => {
      if (connectionId !== this.connectionId) {
        return;
      }
      const state = event.payload?.state ?? "";
      if (state === "open") {
        this.transportOpen = true;
        if (!this.sessionUpdateSent) {
          this.sessionUpdateSent = true;
          void this.sendJson(
            buildGrokSessionUpdate(this.speech, this.agentContext, this.agentMood),
          );
        }
      } else if (state === "closed") {
        this.transportOpen = false;
        if (!this.closed && !this.setupDone) {
          this.rejectSetup?.(
            new Error("Grok Voice WebSocket geschlossen (kein session.updated)."),
          );
        } else if (!this.closed && this.setupDone) {
          this.callbacks.onStatus?.("idle");
        }
      }
    });

    const onError = await listen<{ message: string }>("xai-realtime:error", (event) => {
      if (connectionId !== this.connectionId) {
        return;
      }
      const message =
        event.payload?.message?.trim() || "Grok Voice WebSocket-Fehler.";
      this.rejectSetup?.(new Error(message));
      if (this.setupDone) {
        this.callbacks.onError?.(message);
      }
    });

    this.unlisteners = [onMessage, onState, onError];
  }

  private async sendJson(payload: Record<string, unknown>): Promise<void> {
    if (!this.transportOpen && !this.sessionUpdateSent) {
      // Allow first session.update race right after open event.
    }
    try {
      await invoke("xai_realtime_send", { payload: JSON.stringify(payload) });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Senden an Grok Voice fehlgeschlagen.";
      if (!this.setupDone) {
        this.rejectSetup?.(new Error(message));
      } else {
        this.callbacks.onError?.(message);
      }
    }
  }

  private completeSetup(): void {
    if (this.setupDone) {
      return;
    }
    this.setupDone = true;
    if (this.speech.voiceResponses) {
      this.audioPlayback = new SpeechAudioPlayback();
    }
    this.resolveSetup?.();
    this.callbacks.onStatus?.("listening");
  }

  private cleanupConnection(): void {
    this.closed = true;
    this.connectionId += 1;
    this.resolveSetup = null;
    this.rejectSetup = null;
    this.pendingToolCalls = [];
    this.handlingTools = false;
    this.assistantTranscript = "";
    this.userPartial = "";
    this.sessionUpdateSent = false;
    this.transportOpen = false;
    this.setupDone = false;
    this.audioPlayback?.stop();
    this.audioPlayback = null;

    const unlisteners = this.unlisteners.splice(0, this.unlisteners.length);
    for (const unlisten of unlisteners) {
      try {
        unlisten();
      } catch {
        // ignore
      }
    }

    void invoke("xai_realtime_disconnect").catch(() => {
      // ignore
    });
  }

  private async handleEvent(raw: string, connectionId: number): Promise<void> {
    if (connectionId !== this.connectionId) {
      return;
    }

    const event = parseGrokEvent(raw);
    if (!event) {
      return;
    }

    const errorMessage = extractGrokErrorMessage(event);
    if (errorMessage) {
      this.rejectSetup?.(new Error(errorMessage));
      this.callbacks.onError?.(errorMessage);
      return;
    }

    const type = extractGrokEventType(event);

    // session.created is automatic on connect; session.updated acknowledges our session.update.
    if (type === "session.created" || type === "session.updated") {
      if (!this.sessionUpdateSent) {
        this.sessionUpdateSent = true;
        void this.sendJson(
          buildGrokSessionUpdate(this.speech, this.agentContext, this.agentMood),
        );
      }
      // Complete on first session event so the mic path is ready; session.update still applies.
      this.completeSetup();
      return;
    }

    if (type === "input_audio_buffer.speech_started") {
      this.audioPlayback?.interrupt();
      this.callbacks.onStatus?.("listening");
      return;
    }

    if (type === "input_audio_buffer.speech_stopped") {
      this.callbacks.onStatus?.("processing");
      return;
    }

    const inputTranscript = extractGrokInputTranscript(event);
    if (inputTranscript.text) {
      if (inputTranscript.final) {
        this.userPartial = "";
        this.callbacks.onPartialTranscript?.("");
        if (!this.speech.agentMode) {
          this.callbacks.onStatus?.("processing");
          this.callbacks.onFinalTranscript?.(inputTranscript.text);
          this.callbacks.onStatus?.("listening");
        }
      } else {
        // "updated" is cumulative; "delta" appends.
        if (type === "conversation.item.input_audio_transcription.updated") {
          this.userPartial = inputTranscript.text;
        } else {
          this.userPartial = `${this.userPartial}${inputTranscript.text}`;
        }
        this.callbacks.onPartialTranscript?.(this.userPartial);
      }
    }

    const audioDelta = extractGrokOutputAudioDelta(event);
    if (audioDelta && this.speech.voiceResponses && this.audioPlayback) {
      this.callbacks.onStatus?.("speaking");
      void this.audioPlayback.enqueueBase64Pcm(
        audioDelta,
        `audio/pcm;rate=${GROK_OUTPUT_SAMPLE_RATE}`,
      );
    }

    const outDelta = extractGrokOutputTranscriptDelta(event);
    if (outDelta) {
      if (
        type === "response.output_audio_transcript.done" ||
        type === "response.audio_transcript.done"
      ) {
        this.assistantTranscript = outDelta.trim() || this.assistantTranscript;
      } else {
        this.assistantTranscript += outDelta;
      }
    }

    const toolCall = extractGrokFunctionCall(event);
    if (toolCall) {
      this.pendingToolCalls.push(toolCall);
    }

    if (type === "response.created") {
      this.assistantTranscript = "";
      return;
    }

    if (type === "response.done" || type === "response.completed") {
      const assistantText = this.assistantTranscript.trim();
      if (assistantText && (this.speech.agentMode || this.speech.voiceResponses)) {
        this.callbacks.onAssistantText?.(assistantText);
      }
      this.assistantTranscript = "";

      if (this.pendingToolCalls.length > 0 && this.callbacks.onToolCalls && !this.handlingTools) {
        const calls = this.pendingToolCalls.splice(0, this.pendingToolCalls.length);
        await this.runToolCalls(calls, connectionId);
        return;
      }

      this.callbacks.onStatus?.("listening");
    }
  }

  private async runToolCalls(
    calls: GeminiFunctionCall[],
    connectionId: number,
  ): Promise<void> {
    if (connectionId !== this.connectionId || !this.callbacks.onToolCalls) {
      return;
    }

    this.handlingTools = true;
    this.callbacks.onStatus?.("processing");

    try {
      const responses = await this.callbacks.onToolCalls(calls);
      if (connectionId !== this.connectionId || this.closed) {
        return;
      }

      for (const response of responses) {
        this.sendJson(
          buildGrokFunctionCallOutputMessage(response.id, {
            name: response.name,
            ...response.response,
          }),
        );
      }

      // Avoid overlapping audio: wait for current turn playback to finish.
      await this.waitForPlaybackIdle();
      if (connectionId !== this.connectionId || this.closed) {
        return;
      }

      this.sendJson(buildGrokResponseCreateMessage());
    } catch (error) {
      this.callbacks.onError?.(
        error instanceof Error ? error.message : "Tool-Ausführung fehlgeschlagen.",
      );
    } finally {
      this.handlingTools = false;
      if (connectionId === this.connectionId && !this.closed) {
        this.callbacks.onStatus?.("listening");
      }
    }
  }

  private async waitForPlaybackIdle(): Promise<void> {
    const start = Date.now();
    while (this.audioPlayback?.isActive && Date.now() - start < PLAYBACK_WAIT_TIMEOUT_MS) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, PLAYBACK_POLL_MS);
      });
    }
  }
}
