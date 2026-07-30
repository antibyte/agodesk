import type { WsMessage } from "./protocol";

/**
 * Wire types for the optional local agent (agodesk executes chat turns locally and
 * uses AuraGo for memory, short queries, full handoff, journal sync, and optional
 * LLM proxying). See docs/AURAGO_LOCAL_AGENT_HANDOFF.md.
 */

export type LocalAgentTurnStatus = "completed" | "failed" | "cancelled";

/**
 * Go `time.RFC3339` rejects fractional seconds from `Date.toISOString()`.
 * AuraGo validates local-agent payloads with that layout.
 */
export function toRfc3339(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface LocalAgentProviderInfo {
  source: "aurago" | "local" | "ollama";
  provider_id?: string;
  model?: string;
}

export interface LocalAgentToolTraceEntry {
  tool: string;
  target?: string;
  status: "success" | "error" | "waiting_approval";
  error_code?: string;
}

export interface LocalAgentTranscriptEntry {
  role: "user" | "assistant";
  content: string;
}

/** Common fields AuraGo expects on every local.agent.* request. */
export interface LocalAgentClientMeta {
  /** Client wall-clock; must be RFC3339 without fractional seconds. */
  client_timestamp: string;
}

// --- remote_tool (memory_search / memory_get / query_aurago) ---

export interface LocalAgentRemoteToolPayload extends LocalAgentClientMeta {
  session_id: string;
  conversation_id?: string;
  request_id: string;
  tool: string;
  arguments: Record<string, unknown>;
}

export interface LocalAgentRemoteToolResultPayload {
  session_id?: string;
  request_id: string;
  tool?: string;
  success: boolean;
  result?: unknown;
  error_code?: string | null;
  error_message?: string | null;
}

// --- handoff (full AuraGo agent turn) ---

export interface LocalAgentHandoffPayload extends LocalAgentClientMeta {
  session_id: string;
  conversation_id?: string;
  request_id: string;
  user_message: string;
  reason?: string;
  transcript?: LocalAgentTranscriptEntry[];
}

// --- turn (journal sync, fire-and-forget) ---

export interface LocalAgentTurnPayload extends LocalAgentClientMeta {
  session_id: string;
  conversation_id?: string;
  request_id: string;
  status: LocalAgentTurnStatus;
  user_message: string;
  assistant_message: string;
  provider?: LocalAgentProviderInfo;
  tool_trace?: LocalAgentToolTraceEntry[];
  started_at?: string;
  finished_at?: string;
}

// --- llm proxy (providerSource=aurago) ---

export interface LocalAgentLlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  /** OpenAI-style tool_calls carried on assistant turns (raw wire shape). */
  tool_calls?: unknown[];
}

export interface LocalAgentLlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LocalAgentLlmPayload extends LocalAgentClientMeta {
  session_id: string;
  request_id: string;
  provider_id?: string;
  model?: string;
  messages: LocalAgentLlmMessage[];
  tools?: Record<string, unknown>[];
  /**
   * OpenAI `tool_choice` forwarded verbatim (e.g. "required" or
   * { type: "function", function: { name } }). page-agent forces a tool call,
   * so a cooperating backend must pass this through to the provider unchanged.
   */
  tool_choice?: unknown;
}

export interface LocalAgentLlmResultPayload {
  session_id?: string;
  request_id: string;
  success: boolean;
  message?: {
    role: "assistant";
    content?: string;
    tool_calls?: LocalAgentLlmToolCall[];
  };
  error_code?: string | null;
  error_message?: string | null;
}

// --- builders ---

function withClientTimestamp<T extends object>(
  payload: T & Partial<LocalAgentClientMeta>,
): T & LocalAgentClientMeta {
  const existing = (payload as Partial<LocalAgentClientMeta>).client_timestamp;
  if (typeof existing === "string" && existing.length > 0) {
    return payload as T & LocalAgentClientMeta;
  }
  return { ...payload, client_timestamp: toRfc3339() };
}

function envelope<T>(type: WsMessage["type"], payload: T, id?: string): WsMessage<T> {
  return {
    id: id ?? crypto.randomUUID(),
    type,
    timestamp: toRfc3339(),
    payload,
  };
}

export function buildLocalAgentRemoteToolMessage(
  payload: Omit<LocalAgentRemoteToolPayload, "client_timestamp"> &
    Partial<LocalAgentClientMeta>,
): WsMessage<LocalAgentRemoteToolPayload> {
  return envelope("local.agent.remote_tool", withClientTimestamp(payload));
}

export function buildLocalAgentHandoffMessage(
  payload: Omit<LocalAgentHandoffPayload, "client_timestamp"> & Partial<LocalAgentClientMeta>,
): WsMessage<LocalAgentHandoffPayload> {
  return envelope("local.agent.handoff", withClientTimestamp(payload));
}

export function buildLocalAgentTurnMessage(
  payload: Omit<LocalAgentTurnPayload, "client_timestamp"> & Partial<LocalAgentClientMeta>,
): WsMessage<LocalAgentTurnPayload> {
  return envelope("local.agent.turn", withClientTimestamp(payload));
}

export function buildLocalAgentLlmMessage(
  payload: Omit<LocalAgentLlmPayload, "client_timestamp"> & Partial<LocalAgentClientMeta>,
): WsMessage<LocalAgentLlmPayload> {
  return envelope("local.agent.llm", withClientTimestamp(payload));
}

// --- normalizers (tolerant of snake_case / camelCase) ---

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

export function normalizeLocalAgentRemoteToolResult(
  payload: unknown,
): LocalAgentRemoteToolResultPayload | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  const requestId = readString(record, "request_id", "requestId");
  if (!requestId) {
    return null;
  }
  const success = record.success === true;
  return {
    request_id: requestId,
    session_id: readString(record, "session_id", "sessionId"),
    tool: readString(record, "tool"),
    success,
    result: record.result,
    error_code: readString(record, "error_code", "errorCode") ?? null,
    error_message: readString(record, "error_message", "errorMessage") ?? null,
  };
}

export function normalizeLocalAgentLlmResult(
  payload: unknown,
): LocalAgentLlmResultPayload | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  const requestId = readString(record, "request_id", "requestId");
  if (!requestId) {
    return null;
  }

  const message = extractLlmAssistantMessage(record);
  const explicitError =
    readString(record, "error_code", "errorCode") ||
    readString(record, "error_message", "errorMessage") ||
    readString(record, "error");

  const success = inferLlmSuccess(record, message, explicitError);

  return {
    request_id: requestId,
    session_id: readString(record, "session_id", "sessionId"),
    success,
    message: message ?? undefined,
    error_code: readString(record, "error_code", "errorCode") ?? null,
    error_message: readString(record, "error_message", "errorMessage", "error") ?? null,
  };
}

function inferLlmSuccess(
  record: Record<string, unknown>,
  message: LocalAgentLlmResultPayload["message"] | null,
  explicitError: string | undefined,
): boolean {
  if (record.success === true || record.ok === true || record.status === "ok") {
    return true;
  }
  if (record.success === false || record.ok === false || record.status === "error") {
    return false;
  }
  // Backend sometimes omits success and only returns the completion body.
  if (message && !explicitError) {
    return true;
  }
  return false;
}

function extractLlmAssistantMessage(
  record: Record<string, unknown>,
): LocalAgentLlmResultPayload["message"] | null {
  // Backend may send message as a plain string instead of an OpenAI message object.
  if (typeof record.message === "string" && record.message.length > 0) {
    return { role: "assistant", content: record.message };
  }

  const direct = asRecord(record.message);
  if (direct) {
    return normalizeAssistantMessageRecord(direct);
  }

  for (const wrapperKey of ["result", "data", "completion", "response"] as const) {
    const wrapped = asRecord(record[wrapperKey]);
    if (!wrapped) {
      if (typeof record[wrapperKey] === "string" && record[wrapperKey].length > 0) {
        return { role: "assistant", content: record[wrapperKey] as string };
      }
      continue;
    }
    if (typeof wrapped.message === "string" && wrapped.message.length > 0) {
      return { role: "assistant", content: wrapped.message };
    }
    const nested = asRecord(wrapped.message);
    if (nested) {
      return normalizeAssistantMessageRecord(nested);
    }
    const fromWrappedChoices = messageFromOpenAiChoices(wrapped);
    if (fromWrappedChoices) {
      return fromWrappedChoices;
    }
    const flatWrapped = extractFlatTextMessage(wrapped);
    if (flatWrapped) {
      return flatWrapped;
    }
  }

  const fromChoices = messageFromOpenAiChoices(record);
  if (fromChoices) {
    return fromChoices;
  }

  return extractFlatTextMessage(record);
}

function extractFlatTextMessage(
  record: Record<string, unknown>,
): LocalAgentLlmResultPayload["message"] | null {
  if (
    typeof record.content === "string" ||
    Array.isArray(record.content) ||
    Array.isArray(record.tool_calls) ||
    Array.isArray(record.toolCalls)
  ) {
    return normalizeAssistantMessageRecord(record);
  }

  for (const key of ["text", "answer", "output", "output_text", "response_text"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return { role: "assistant", content: value };
    }
  }

  return null;
}

function messageFromOpenAiChoices(
  record: Record<string, unknown>,
): LocalAgentLlmResultPayload["message"] | null {
  const choices = Array.isArray(record.choices) ? record.choices : null;
  if (!choices || choices.length === 0) {
    return null;
  }
  const first = asRecord(choices[0]);
  if (!first) {
    return null;
  }

  if (typeof first.message === "string" && first.message.length > 0) {
    return { role: "assistant", content: first.message };
  }

  const message = asRecord(first.message);
  if (message) {
    return normalizeAssistantMessageRecord(message);
  }

  // Legacy completions API: choices[0].text
  if (typeof first.text === "string" && first.text.length > 0) {
    return { role: "assistant", content: first.text };
  }

  const delta = asRecord(first.delta);
  if (delta) {
    return normalizeAssistantMessageRecord(delta);
  }

  return null;
}

function coerceAssistantContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        const record = asRecord(part);
        if (!record) {
          return "";
        }
        if (typeof record.text === "string") {
          return record.text;
        }
        if (typeof record.content === "string") {
          return record.content;
        }
        return "";
      })
      .join("");
  }
  return "";
}

function normalizeAssistantMessageRecord(
  messageRecord: Record<string, unknown>,
): LocalAgentLlmResultPayload["message"] {
  const toolCallsRaw = Array.isArray(messageRecord.tool_calls)
    ? messageRecord.tool_calls
    : Array.isArray(messageRecord.toolCalls)
      ? messageRecord.toolCalls
      : [];
  const toolCalls = toolCallsRaw
    .map((entry) => normalizeToolCallEntry(entry))
    .filter((call): call is LocalAgentLlmToolCall => call !== null);

  const content =
    coerceAssistantContent(messageRecord.content) ||
    (typeof messageRecord.reasoning_content === "string"
      ? messageRecord.reasoning_content
      : "") ||
    (typeof messageRecord.text === "string" ? messageRecord.text : "");

  return {
    role: "assistant",
    content,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };
}

function normalizeToolCallEntry(entry: unknown): LocalAgentLlmToolCall | null {
  const call = asRecord(entry);
  if (!call) {
    return null;
  }

  // Flat: { id, name, arguments } or OpenAI: { id, function: { name, arguments } }
  const fn = asRecord(call.function);
  const name = readString(call, "name") ?? (fn ? readString(fn, "name") : undefined);
  if (!name) {
    return null;
  }

  let args: Record<string, unknown> = {};
  const rawArgs = call.arguments ?? call.args ?? fn?.arguments ?? fn?.args;
  if (typeof rawArgs === "string") {
    try {
      args = JSON.parse(rawArgs) as Record<string, unknown>;
    } catch {
      args = {};
    }
  } else if (asRecord(rawArgs)) {
    args = rawArgs as Record<string, unknown>;
  }

  return {
    id: readString(call, "id") ?? crypto.randomUUID(),
    name,
    arguments: args,
  };
}

export function isLocalAgentRemoteToolResult(message: WsMessage): boolean {
  return message.type === "local.agent.remote_tool.result";
}

export function isLocalAgentLlmResult(message: WsMessage): boolean {
  return message.type === "local.agent.llm.result";
}
