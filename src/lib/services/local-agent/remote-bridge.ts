import type { WsMessage } from "../../types/protocol";
import type {
  LocalAgentClientMeta,
  LocalAgentHandoffPayload,
  LocalAgentLlmPayload,
  LocalAgentLlmResultPayload,
  LocalAgentRemoteToolPayload,
  LocalAgentRemoteToolResultPayload,
  LocalAgentTurnPayload,
} from "../../types/local-agent-protocol";
import {
  buildLocalAgentHandoffMessage,
  buildLocalAgentLlmMessage,
  buildLocalAgentRemoteToolMessage,
  buildLocalAgentTurnMessage,
  normalizeLocalAgentLlmResult,
  normalizeLocalAgentRemoteToolResult,
} from "../../types/local-agent-protocol";

const REMOTE_TOOL_TIMEOUT_MS = 30_000;
const LLM_TIMEOUT_MS = 60_000;

type WaiterKind = "remote_tool" | "llm";

type WithOptionalClientTimestamp<T extends LocalAgentClientMeta> = Omit<T, "client_timestamp"> &
  Partial<LocalAgentClientMeta>;

interface Waiter {
  kind: WaiterKind;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const waiters = new Map<string, Waiter>();

export type LocalAgentSend = (message: WsMessage) => Promise<void>;

function registerWaiter<T>(requestId: string, kind: WaiterKind, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const entry: Waiter = {
      kind,
      resolve: resolve as (value: unknown) => void,
      reject,
      timer: setTimeout(() => {
        // Remove primary + any envelope-id aliases sharing this waiter.
        for (const [id, pending] of [...waiters.entries()]) {
          if (pending === entry) {
            waiters.delete(id);
          }
        }
        reject(new Error(`Local agent ${kind} request timed out.`));
      }, timeoutMs),
    };
    waiters.set(requestId, entry);
  });
}

function resolveWaiter(requestId: string, kind: WaiterKind, value: unknown): boolean {
  const waiter = waiters.get(requestId);
  if (!waiter || waiter.kind !== kind) {
    return false;
  }
  clearTimeout(waiter.timer);
  waiters.delete(requestId);
  // Drop any aliases pointing at the same waiter.
  for (const [id, pending] of [...waiters.entries()]) {
    if (pending === waiter) {
      clearTimeout(pending.timer);
      waiters.delete(id);
    }
  }
  waiter.resolve(value);
  return true;
}

function resolveWaiterByAnyId(
  kind: WaiterKind,
  value: unknown,
  ...ids: Array<string | undefined>
): boolean {
  for (const id of ids) {
    if (id && resolveWaiter(id, kind, value)) {
      return true;
    }
  }
  return false;
}

/** Reject all pending local-agent waiters (e.g. on disconnect / cancel). */
export function rejectAllLocalAgentWaiters(error: Error): void {
  const seen = new Set<Waiter>();
  for (const [requestId, waiter] of [...waiters.entries()]) {
    waiters.delete(requestId);
    if (seen.has(waiter)) {
      continue;
    }
    seen.add(waiter);
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }
}

/** Called by the inbound router for local.agent.remote_tool.result. */
export function handleLocalAgentRemoteToolResult(payload: unknown, envelopeId?: string): boolean {
  const normalized = normalizeLocalAgentRemoteToolResult(payload);
  if (!normalized) {
    // Fall back: envelope id only, so we still unblock the waiter.
    if (
      envelopeId &&
      resolveWaiter(envelopeId, "remote_tool", {
        request_id: envelopeId,
        success: false,
        error_message: "Malformed local.agent.remote_tool.result payload.",
      })
    ) {
      return true;
    }
    return false;
  }
  return resolveWaiterByAnyId("remote_tool", normalized, normalized.request_id, envelopeId);
}

/** Called by the inbound router for local.agent.llm.result. */
export function handleLocalAgentLlmResult(payload: unknown, envelopeId?: string): boolean {
  let normalized = normalizeLocalAgentLlmResult(payload);
  if (!normalized && envelopeId) {
    // Backend sometimes omits request_id and only correlates via envelope id.
    normalized = normalizeLocalAgentLlmResult({
      ...(payload && typeof payload === "object" ? payload : {}),
      request_id: envelopeId,
    });
  }
  if (!normalized) {
    console.warn("[agodesk:local-agent] malformed llm.result", {
      envelopeId,
      payloadType: typeof payload,
      keys: payload && typeof payload === "object" ? Object.keys(payload as object) : [],
      preview: safePayloadPreview(payload),
    });
    if (
      envelopeId &&
      resolveWaiter(envelopeId, "llm", {
        request_id: envelopeId,
        success: false,
        error_message: "Malformed local.agent.llm.result payload.",
      })
    ) {
      return true;
    }
    return false;
  }
  if (!normalized.message && normalized.success) {
    console.warn("[agodesk:local-agent] llm.result success without message", {
      request_id: normalized.request_id,
      preview: safePayloadPreview(payload),
    });
  }
  return resolveWaiterByAnyId("llm", normalized, normalized.request_id, envelopeId);
}

function safePayloadPreview(payload: unknown): string {
  try {
    const text = JSON.stringify(payload);
    return text.length > 800 ? `${text.slice(0, 800)}…` : text;
  } catch {
    return String(payload);
  }
}

export async function sendRemoteTool(
  send: LocalAgentSend,
  payload: WithOptionalClientTimestamp<LocalAgentRemoteToolPayload>,
): Promise<LocalAgentRemoteToolResultPayload> {
  const message = buildLocalAgentRemoteToolMessage(payload);
  const wait = registerWaiter<LocalAgentRemoteToolResultPayload>(
    payload.request_id,
    "remote_tool",
    REMOTE_TOOL_TIMEOUT_MS,
  );
  // Alias envelope id — some backends echo the WS message id instead of request_id.
  if (message.id !== payload.request_id) {
    const existing = waiters.get(payload.request_id);
    if (existing) {
      waiters.set(message.id, existing);
    }
  }
  await send(message);
  return wait;
}

export async function sendLocalAgentLlm(
  send: LocalAgentSend,
  payload: WithOptionalClientTimestamp<LocalAgentLlmPayload>,
): Promise<LocalAgentLlmResultPayload> {
  const message = buildLocalAgentLlmMessage(payload);
  const wait = registerWaiter<LocalAgentLlmResultPayload>(
    payload.request_id,
    "llm",
    LLM_TIMEOUT_MS,
  );
  if (message.id !== payload.request_id) {
    const existing = waiters.get(payload.request_id);
    if (existing) {
      waiters.set(message.id, existing);
    }
  }
  await send(message);
  return wait;
}

export async function sendHandoff(
  send: LocalAgentSend,
  payload: WithOptionalClientTimestamp<LocalAgentHandoffPayload>,
): Promise<void> {
  await send(buildLocalAgentHandoffMessage(payload));
}

export async function sendTurnSync(
  send: LocalAgentSend,
  payload: WithOptionalClientTimestamp<LocalAgentTurnPayload>,
): Promise<void> {
  await send(buildLocalAgentTurnMessage(payload));
}
