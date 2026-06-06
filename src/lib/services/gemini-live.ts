import type { SpeechSettings, AgentMoodMetadata } from "../types/protocol";
import { SpeechAudioPlayback } from "./speech-audio-playback";
import {
  buildAgentSystemInstruction,
  buildAgentToolDeclarations,
  buildTranscriptionSystemInstruction,
  type GeminiFunctionCall,
  type GeminiFunctionResponse,
} from "./speech-tools";
import {
  buildGeminiLiveWsUrl,
  isNativeAudioLiveModel,
  normalizeModelId,
  resolveLiveApiVersions,
  resolveResponseModalities,
  toGeminiModelPath,
  type SpeechAgentContext,
  type SpeechStatus,
} from "../types/speech";

export interface GeminiLiveCallbacks {
  onStatus?: (status: SpeechStatus) => void;
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onAssistantText?: (text: string) => void;
  onToolCalls?: (calls: GeminiFunctionCall[]) => Promise<GeminiFunctionResponse[]>;
  onError?: (message: string) => void;
}

export interface GeminiLiveMessage {
  setupComplete?: Record<string, unknown> | null;
  toolCall?: {
    functionCalls?: Array<{
      id?: string;
      name?: string;
      args?: Record<string, unknown>;
    }>;
  };
  serverContent?: {
    turnComplete?: boolean;
    interrupted?: boolean;
    inputTranscription?: { text?: string; finished?: boolean };
    outputTranscription?: { text?: string; finished?: boolean };
    modelTurn?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
        functionCall?: {
          id?: string;
          name?: string;
          args?: Record<string, unknown>;
        };
      }>;
    };
  };
  error?: {
    message?: string;
    code?: number;
    status?: string;
  };
}

const SETUP_TIMEOUT_MS = 30_000;
const TURN_FINALIZE_GRACE_MS = 1500;

export function normalizeGeminiWsPayload(
  data: string | ArrayBuffer | Blob,
): string {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  return "";
}

export function parseGeminiLiveMessage(raw: string): GeminiLiveMessage | null {
  if (!raw.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeGeminiLiveMessage(parsed);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readTranscription(
  value: unknown,
): { text?: string; finished?: boolean } | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const text = typeof record.text === "string" ? record.text : undefined;
  const finished =
    typeof record.finished === "boolean" ? record.finished : undefined;
  if (!text && finished === undefined) {
    return undefined;
  }
  return { text, finished };
}

export function normalizeGeminiLiveMessage(
  parsed: Record<string, unknown>,
): GeminiLiveMessage {
  const serverRaw = asRecord(parsed.serverContent ?? parsed.server_content);
  const errorRaw = asRecord(parsed.error);
  const toolCallRaw = asRecord(parsed.toolCall ?? parsed.tool_call);

  let serverContent: GeminiLiveMessage["serverContent"] | undefined;
  if (serverRaw) {
    const modelRaw = asRecord(serverRaw.modelTurn ?? serverRaw.model_turn);
    const partsRaw = modelRaw?.parts;
    const parts = Array.isArray(partsRaw)
      ? partsRaw
          .map((part) => {
            const partRecord = asRecord(part);
            if (!partRecord) {
              return null;
            }
            const functionCallRaw = asRecord(
              partRecord.functionCall ?? partRecord.function_call,
            );
            const inlineDataRaw = asRecord(
              partRecord.inlineData ?? partRecord.inline_data,
            );
            return {
              text:
                typeof partRecord.text === "string" ? partRecord.text : undefined,
              inlineData: inlineDataRaw
                ? {
                    mimeType:
                      typeof inlineDataRaw.mimeType === "string"
                        ? inlineDataRaw.mimeType
                        : typeof inlineDataRaw.mime_type === "string"
                          ? inlineDataRaw.mime_type
                          : undefined,
                    data:
                      typeof inlineDataRaw.data === "string"
                        ? inlineDataRaw.data
                        : undefined,
                  }
                : undefined,
              functionCall: functionCallRaw
                ? {
                    id:
                      typeof functionCallRaw.id === "string"
                        ? functionCallRaw.id
                        : undefined,
                    name:
                      typeof functionCallRaw.name === "string"
                        ? functionCallRaw.name
                        : undefined,
                    args: asRecord(functionCallRaw.args) ?? undefined,
                  }
                : undefined,
            };
          })
          .filter((part): part is NonNullable<typeof part> => part !== null)
      : undefined;

    serverContent = {
      turnComplete:
        serverRaw.turnComplete === true || serverRaw.turn_complete === true
          ? true
          : undefined,
      interrupted:
        serverRaw.interrupted === true ? true : undefined,
      inputTranscription: readTranscription(
        serverRaw.inputTranscription ?? serverRaw.input_transcription,
      ),
      outputTranscription: readTranscription(
        serverRaw.outputTranscription ?? serverRaw.output_transcription,
      ),
      modelTurn: modelRaw
        ? {
            parts,
          }
        : undefined,
    };
  }

  const functionCallsRaw = toolCallRaw?.functionCalls ?? toolCallRaw?.function_calls;
  const functionCalls = Array.isArray(functionCallsRaw)
    ? functionCallsRaw
        .map((call) => {
          const callRecord = asRecord(call);
          if (!callRecord) {
            return null;
          }
          return {
            id: typeof callRecord.id === "string" ? callRecord.id : undefined,
            name:
              typeof callRecord.name === "string" ? callRecord.name : undefined,
            args: asRecord(callRecord.args) ?? undefined,
          };
        })
        .filter((call): call is NonNullable<typeof call> => call !== null)
    : undefined;

  const message: GeminiLiveMessage = {};

  if (
    Object.prototype.hasOwnProperty.call(parsed, "setupComplete") ||
    Object.prototype.hasOwnProperty.call(parsed, "setup_complete")
  ) {
    message.setupComplete =
      asRecord(parsed.setupComplete ?? parsed.setup_complete) ?? {};
  }

  if (serverContent) {
    message.serverContent = serverContent;
  }

  if (toolCallRaw) {
    message.toolCall = { functionCalls };
  }

  if (errorRaw) {
    message.error = {
      message:
        typeof errorRaw.message === "string" ? errorRaw.message : undefined,
      code: typeof errorRaw.code === "number" ? errorRaw.code : undefined,
      status:
        typeof errorRaw.status === "string" ? errorRaw.status : undefined,
    };
  }

  return message;
}

export function isSetupCompleteMessage(message: GeminiLiveMessage): boolean {
  return Object.prototype.hasOwnProperty.call(message, "setupComplete");
}

export function extractGeminiLiveError(
  raw: string,
  message: GeminiLiveMessage | null,
): string | null {
  if (message?.error?.message) {
    const status = message.error.status ? ` (${message.error.status})` : "";
    return `${message.error.message}${status}`;
  }

  if (!message) {
    return raw.trim().length > 0
      ? `Ungültige Gemini-Antwort: ${raw.slice(0, 180)}`
      : "Leere Gemini-Antwort.";
  }

  return null;
}

export function extractTranscriptFromMessage(message: GeminiLiveMessage): {
  partial: string;
  final: string;
} {
  const content = message.serverContent;
  if (!content) {
    return { partial: "", final: "" };
  }

  const inputText = content.inputTranscription?.text?.trim() ?? "";
  const outputText = content.outputTranscription?.text?.trim() ?? "";
  const modelParts =
    content.modelTurn?.parts
      ?.map((part) => part.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n")
      .trim() ?? "";

  const combined = inputText || outputText || modelParts;
  if (!combined) {
    return { partial: "", final: "" };
  }

  if (content.turnComplete) {
    return { partial: "", final: combined };
  }

  return { partial: combined, final: "" };
}

export function extractUserTranscript(message: GeminiLiveMessage): {
  partial: string;
  final: string;
} {
  const inputText = message.serverContent?.inputTranscription?.text?.trim() ?? "";
  if (!inputText) {
    return { partial: "", final: "" };
  }

  if (message.serverContent?.turnComplete) {
    return { partial: "", final: inputText };
  }

  return { partial: inputText, final: "" };
}

export function extractAssistantText(message: GeminiLiveMessage): string {
  const parts = message.serverContent?.modelTurn?.parts ?? [];
  const textParts = parts
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean);

  if (textParts.length > 0) {
    return textParts.join("\n").trim();
  }

  return message.serverContent?.outputTranscription?.text?.trim() ?? "";
}

export function extractToolCalls(message: GeminiLiveMessage): GeminiFunctionCall[] {
  const calls: GeminiFunctionCall[] = [];

  for (const call of message.toolCall?.functionCalls ?? []) {
    if (!call.name) {
      continue;
    }
    calls.push({
      id: call.id ?? crypto.randomUUID(),
      name: call.name,
      args: call.args ?? {},
    });
  }

  for (const part of message.serverContent?.modelTurn?.parts ?? []) {
    if (!part.functionCall?.name) {
      continue;
    }
    calls.push({
      id: part.functionCall.id ?? crypto.randomUUID(),
      name: part.functionCall.name,
      args: part.functionCall.args ?? {},
    });
  }

  return calls;
}

export function extractModelAudioChunks(
  message: GeminiLiveMessage,
): Array<{ data: string; mimeType?: string }> {
  const chunks: Array<{ data: string; mimeType?: string }> = [];

  for (const part of message.serverContent?.modelTurn?.parts ?? []) {
    const data = part.inlineData?.data?.trim();
    if (!data) {
      continue;
    }
    chunks.push({
      data,
      mimeType: part.inlineData?.mimeType,
    });
  }

  return chunks;
}

function buildGenerationConfig(
  normalizedModel: string,
  voiceName?: string,
): Record<string, unknown> {
  const responseModalities = resolveResponseModalities(normalizedModel);
  const config: Record<string, unknown> = {
    responseModalities,
  };

  if (responseModalities.includes("AUDIO")) {
    config.speechConfig = {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: voiceName || "Zephyr",
        },
      },
    };
  }

  return config;
}

function buildInputAudioTranscription(): Record<string, unknown> {
  // AudioTranscriptionConfig hat laut Gemini Live API keine Felder.
  return {};
}

export function buildGeminiSetupMessage(
  speech: SpeechSettings,
  agentContext?: SpeechAgentContext,
  agentMood?: AgentMoodMetadata | null,
): Record<string, unknown> {
  const agentMode = speech.agentMode && !!agentContext;
  const normalizedModel = normalizeModelId(speech.modelId);
  const modelPath = toGeminiModelPath(normalizedModel);
  const usesAudioOutput = resolveResponseModalities(normalizedModel).includes("AUDIO");

  return {
    setup: {
      model: modelPath,
      generationConfig: buildGenerationConfig(normalizedModel, speech.voiceName),
      inputAudioTranscription: buildInputAudioTranscription(),
      ...(usesAudioOutput ? { outputAudioTranscription: {} } : {}),
      ...(agentMode ? { tools: buildAgentToolDeclarations() } : {}),
      systemInstruction: {
        parts: [
          {
            text: agentMode
              ? buildAgentSystemInstruction(speech, agentContext, agentMood)
              : buildTranscriptionSystemInstruction(speech, usesAudioOutput, agentMood),
          },
        ],
      },
    },
  };
}

export function buildGeminiAudioMessage(base64Pcm: string): Record<string, unknown> {
  return {
    realtimeInput: {
      audio: {
        mimeType: "audio/pcm;rate=16000",
        data: base64Pcm,
      },
    },
  };
}

export class InputTranscriptAccumulator {
  private buffer = "";

  push(text: string | undefined): string {
    const trimmed = text?.trim() ?? "";
    if (!trimmed) {
      return this.buffer;
    }

    this.buffer = mergeTranscriptChunks(this.buffer, trimmed);
    return this.buffer;
  }

  finalize(): string {
    const final = this.buffer.trim();
    this.buffer = "";
    return final;
  }

  clear(): void {
    this.buffer = "";
  }

  get current(): string {
    return this.buffer;
  }
}

/** @internal Exported for unit tests. */
export function mergeTranscriptChunks(existing: string, incoming: string): string {
  const trimmed = incoming.trim();
  if (!trimmed) {
    return existing;
  }
  if (!existing) {
    return trimmed;
  }
  if (trimmed.startsWith(existing)) {
    return trimmed;
  }
  if (existing.startsWith(trimmed) || existing.endsWith(trimmed)) {
    return existing;
  }

  const overlap = longestSuffixPrefixOverlap(existing, trimmed);
  if (overlap >= 2) {
    return existing + trimmed.slice(overlap);
  }

  // Kurze Fragmente (<3 Zeichen) oft Silben/Fortsetzung desselben Worts (z. B. "Hal"+"lo").
  if (trimmed.length < 3) {
    return existing + trimmed;
  }

  return existing + (shouldInsertSpaceBetween(existing, trimmed) ? " " : "") + trimmed;
}

function shouldInsertSpaceBetween(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }
  if (/\s$/.test(left) || /^\s/.test(right)) {
    return false;
  }
  const leftLast = left[left.length - 1] ?? "";
  const rightFirst = right[0] ?? "";
  if (/^[,.!?;:)\]}]/.test(right)) {
    return false;
  }
  if (/[(\[{]$/.test(left)) {
    return false;
  }
  if (leftLast === "-" || rightFirst === "-") {
    return false;
  }
  return true;
}

function longestSuffixPrefixOverlap(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  for (let len = max; len > 0; len -= 1) {
    if (left.endsWith(right.slice(0, len))) {
      return len;
    }
  }
  return 0;
}

export function buildGeminiToolResponseMessage(
  responses: GeminiFunctionResponse[],
): Record<string, unknown> {
  return {
    toolResponse: {
      functionResponses: responses.map((entry) => ({
        id: entry.id,
        name: entry.name,
        response: entry.response,
      })),
    },
  };
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private setupDone = false;
  private closed = false;
  private callbacks: GeminiLiveCallbacks;
  private speech: SpeechSettings;
  private agentContext?: SpeechAgentContext;
  private resolveSetup: (() => void) | null = null;
  private rejectSetup: ((error: Error) => void) | null = null;
  private handlingTools = false;
  private connectionId = 0;
  private inputTranscripts = new InputTranscriptAccumulator();
  private turnFinalizeTimer: ReturnType<typeof window.setTimeout> | null = null;
  private audioPlayback: SpeechAudioPlayback | null = null;
  private agentMood: AgentMoodMetadata | null = null;

  constructor(
    speech: SpeechSettings,
    callbacks: GeminiLiveCallbacks,
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
  }

  /** Returns true while the AI is currently playing voice audio (for barge-in detection). */
  get isAiSpeaking(): boolean {
    return !!this.audioPlayback?.isActive;
  }

  /**
   * Client-initiated immediate stop of AI voice playback (barge-in).
   * This is local and instant. The ongoing Gemini generation may also
   * react when new user audio arrives on the wire.
   */
  requestClientInterrupt(): void {
    this.audioPlayback?.interrupt();
  }

  /** Returns an analyser for the AI voice playback (for lip-sync, visualizers, or enhanced barge metrics). */
  getPlaybackAnalyser(): AnalyserNode | null {
    return this.audioPlayback?.getPlaybackAnalyser() ?? null;
  }

  async connect(options?: { apiKey?: string }): Promise<void> {
    const apiKey = options?.apiKey?.trim();
    if (!apiKey) {
      throw new Error("Gemini API-Key fehlt.");
    }
    const normalizedModel = normalizeModelId(this.speech.modelId);
    const errors: string[] = [];

    for (const apiVersion of resolveLiveApiVersions(normalizedModel)) {
      try {
        await this.connectOnce(apiKey, apiVersion, false);
        return;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Gemini Live Verbindung fehlgeschlagen.";
        errors.push(`[${apiVersion}] ${message}`);
        this.cleanupConnection();

        if (this.agentMood) {
          try {
            await this.connectOnce(apiKey, apiVersion, true);
            return;
          } catch (retryError) {
            const retryMessage =
              retryError instanceof Error
                ? retryError.message
                : "Gemini Live Verbindung fehlgeschlagen.";
            errors.push(`[${apiVersion}, ohne Mood-Hint] ${retryMessage}`);
            this.cleanupConnection();
          }
        }
      }
    }

    throw new Error(
      `${errors.join(" · ")} (Modell: ${normalizedModel})`,
    );
  }

  private cleanupConnection(): void {
    this.closed = true;
    this.connectionId += 1;
    this.resolveSetup = null;
    this.rejectSetup = null;

    const ws = this.ws;
    this.ws = null;
    this.setupDone = false;
    this.inputTranscripts.clear();
    this.clearTurnFinalizeTimer();
    this.audioPlayback?.stop();
    this.audioPlayback = null;

    if (!ws) {
      return;
    }

    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;

    if (
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING
    ) {
      ws.close(1000, "session ended");
    }
  }

  private async connectOnce(
    apiKey: string,
    apiVersion: "v1beta" | "v1alpha",
    skipAgentMood = false,
  ): Promise<void> {
    if (this.ws) {
      return;
    }

    const activeConnectionId = ++this.connectionId;
    this.closed = false;
    this.setupDone = false;
    this.callbacks.onStatus?.("connecting");

    const url = buildGeminiLiveWsUrl(apiKey, apiVersion);
    const ws = new WebSocket(url);
    this.ws = ws;

    const setupWait = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (activeConnectionId !== this.connectionId) {
          return;
        }
        this.resolveSetup = null;
        this.rejectSetup = null;
        reject(
          new Error(
            `Setup-Timeout. Modell „${normalizeModelId(this.speech.modelId)}“ prüfen.`,
          ),
        );
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

    ws.onmessage = (event) => {
      if (activeConnectionId !== this.connectionId) {
        return;
      }
      void this.handleRawMessage(event.data, activeConnectionId);
    };

    ws.onerror = () => {
      if (activeConnectionId !== this.connectionId) {
        return;
      }
      this.rejectSetup?.(new Error("WebSocket-Fehler."));
    };

    ws.onclose = (event) => {
      if (activeConnectionId !== this.connectionId) {
        return;
      }

      if (!this.closed && !this.setupDone) {
        const detail =
          event.reason?.trim() ||
          (event.code === 1000
            ? "Verbindung vom Server beendet (kein setupComplete)."
            : `WebSocket Code ${event.code}.`);
        this.rejectSetup?.(
          new Error(`Verbindung getrennt (${apiVersion}): ${detail}`),
        );
      }

      if (this.ws === ws) {
        this.ws = null;
      }

      if (!this.closed && this.setupDone) {
        this.callbacks.onStatus?.("idle");
      }
    };

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error("Verbindungstimeout beim Öffnen."));
      }, SETUP_TIMEOUT_MS);

      ws.onopen = () => {
        if (activeConnectionId !== this.connectionId) {
          window.clearTimeout(timeout);
          return;
        }
        window.clearTimeout(timeout);
        ws.send(
          JSON.stringify(
            buildGeminiSetupMessage(
              this.speech,
              this.agentContext,
              skipAgentMood ? null : this.agentMood,
            ),
          ),
        );
        resolve();
      };

      ws.addEventListener(
        "error",
        () => {
          if (activeConnectionId !== this.connectionId) {
            return;
          }
          window.clearTimeout(timeout);
          reject(new Error("WebSocket-Fehler beim Verbinden."));
        },
        { once: true },
      );
    });

    if (this.setupDone && activeConnectionId === this.connectionId) {
      this.resolveSetup?.();
    }

    await setupWait;
  }

  sendAudio(base64Pcm: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupDone) {
      return;
    }
    this.ws.send(JSON.stringify(buildGeminiAudioMessage(base64Pcm)));
  }

  sendToolResponse(responses: GeminiFunctionResponse[]): void {
    if (
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN ||
      responses.length === 0
    ) {
      return;
    }
    this.ws.send(JSON.stringify(buildGeminiToolResponseMessage(responses)));
  }

  disconnect(): void {
    this.cleanupConnection();
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

  private async handleRawMessage(
    data: string | ArrayBuffer | Blob,
    connectionId: number,
  ): Promise<void> {
    if (connectionId !== this.connectionId) {
      return;
    }

    let raw = normalizeGeminiWsPayload(data);
    if (data instanceof Blob) {
      raw = await data.text();
    }

    await this.handleMessage(raw, connectionId);
  }

  private async handleMessage(raw: string, connectionId: number): Promise<void> {
    if (connectionId !== this.connectionId) {
      return;
    }

    const message = parseGeminiLiveMessage(raw);
    const errorMessage = extractGeminiLiveError(raw, message);

    if (errorMessage) {
      this.rejectSetup?.(new Error(errorMessage));
      this.callbacks.onError?.(errorMessage);
      return;
    }

    if (!message) {
      return;
    }

    if (isSetupCompleteMessage(message)) {
      this.completeSetup();
      return;
    }

    const toolCalls = extractToolCalls(message);
    if (toolCalls.length > 0 && this.callbacks.onToolCalls && !this.handlingTools) {
      this.handlingTools = true;
      this.callbacks.onStatus?.("processing");
      try {
        const responses = await this.callbacks.onToolCalls(toolCalls);
        this.sendToolResponse(responses);
      } catch (error) {
        this.callbacks.onError?.(
          error instanceof Error
            ? error.message
            : "Tool-Ausführung fehlgeschlagen.",
        );
      } finally {
        this.handlingTools = false;
        this.callbacks.onStatus?.("listening");
      }
    }

    this.processInputTranscription(message);
    this.handleModelAudioOutput(message);

    const assistantText = extractAssistantText(message);
    if (
      assistantText &&
      message.serverContent?.turnComplete &&
      (this.speech.agentMode || this.speech.voiceResponses)
    ) {
      this.callbacks.onAssistantText?.(assistantText);
    }

    if (this.speech.agentMode) {
      return;
    }

    if (
      !isNativeAudioLiveModel(this.speech.modelId) &&
      !message.serverContent?.inputTranscription?.text?.trim()
    ) {
      const { partial, final } = extractTranscriptFromMessage(message);
      if (partial) {
        this.callbacks.onPartialTranscript?.(partial);
      }
      if (final) {
        this.callbacks.onStatus?.("processing");
        this.callbacks.onFinalTranscript?.(final);
        this.callbacks.onStatus?.("listening");
      }
    }
  }

  private handleModelAudioOutput(message: GeminiLiveMessage): void {
    if (!this.speech.voiceResponses || !this.audioPlayback) {
      return;
    }

    if (message.serverContent?.interrupted) {
      this.audioPlayback.interrupt();
      return;
    }

    for (const chunk of extractModelAudioChunks(message)) {
      void this.audioPlayback.enqueueBase64Pcm(chunk.data, chunk.mimeType);
    }
  }

  private clearTurnFinalizeTimer(): void {
    if (this.turnFinalizeTimer !== null) {
      window.clearTimeout(this.turnFinalizeTimer);
      this.turnFinalizeTimer = null;
    }
  }

  private emitFinalTranscript(): void {
    const final = this.inputTranscripts.finalize();
    if (this.speech.agentMode || !final) {
      return;
    }

    this.callbacks.onPartialTranscript?.("");
    this.callbacks.onStatus?.("processing");
    this.callbacks.onFinalTranscript?.(final);
    this.callbacks.onStatus?.("listening");
  }

  private scheduleTurnFinalize(): void {
    this.clearTurnFinalizeTimer();
    this.turnFinalizeTimer = window.setTimeout(() => {
      this.turnFinalizeTimer = null;
      this.emitFinalTranscript();
    }, TURN_FINALIZE_GRACE_MS) as any;
  }

  private processInputTranscription(message: GeminiLiveMessage): void {
    const content = message.serverContent;
    if (!content) {
      return;
    }

    const accumulated = this.inputTranscripts.push(
      content.inputTranscription?.text,
    );
    if (accumulated) {
      this.callbacks.onPartialTranscript?.(accumulated);
      if (this.turnFinalizeTimer !== null) {
        this.clearTurnFinalizeTimer();
        this.emitFinalTranscript();
        return;
      }
    }

    const shouldFinalize =
      content.turnComplete === true ||
      content.inputTranscription?.finished === true;

    if (shouldFinalize) {
      if (this.inputTranscripts.current || accumulated) {
        this.clearTurnFinalizeTimer();
        this.emitFinalTranscript();
      } else {
        this.scheduleTurnFinalize();
      }
      return;
    }

    // interrupted ohne turnComplete: nur leeres Zwischenfeedback zurücksetzen
    if (content.interrupted && !this.inputTranscripts.current) {
      this.clearTurnFinalizeTimer();
      this.callbacks.onPartialTranscript?.("");
    }
  }
}

export {
  buildAgentSystemInstruction,
  buildTranscriptionSystemInstruction,
} from "./speech-tools";
