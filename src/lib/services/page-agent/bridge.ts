import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { get } from "svelte/store";
import { sessionState } from "../../stores/session";
import { settings } from "../../stores/settings";
import type { WsMessage } from "../../types/protocol";
import { sendLocalAgentLlm } from "../local-agent/remote-bridge";
import { parseOpenAiChatRequest, toOpenAiChatCompletion } from "./openai-map";
import {
  PAGE_AGENT_COSMETIC_MODEL,
  PAGE_AGENT_EVENT,
  PAGE_AGENT_PAGE_READY_EVENT,
  invokePageAgentEnsure,
  invokePageAgentNavigate,
  invokePageAgentResolve,
} from "./inject";

interface PageAgentBridgeEvent {
  id: string;
  body?: string;
  /** Absolute URL for CDP navigation (go_to_url custom tool). */
  navigate?: string;
  /** Task to resume on the new document after CDP navigation. */
  resumeTask?: string;
}

let unlisten: UnlistenFn | null = null;
let unlistenPageReady: UnlistenFn | null = null;
let starting = false;
let generation = 0;
const inFlight = new Set<string>();
let ensureTimer: ReturnType<typeof setTimeout> | null = null;

/** Sends WS envelopes directly through the Tauri transport (no ChatView needed). */
const wsSend = (message: WsMessage): Promise<void> =>
  invoke("agodesk_send", { envelope: JSON.stringify(message) });

function scheduleEnsureAfterNavigation(): void {
  if (ensureTimer) {
    clearTimeout(ensureTimer);
  }
  // Debounce rapid load events (redirect chains).
  ensureTimer = setTimeout(() => {
    ensureTimer = null;
    void invokePageAgentEnsure().catch((error) => {
      console.warn("[agodesk:page-agent] ensure after navigation failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, 200);
}

async function handleNavigate(id: string, url: string): Promise<void> {
  const destination = new URL(url);
  if (
    !["http:", "https:"].includes(destination.protocol) ||
    destination.username ||
    destination.password
  ) {
    throw new Error("Page-agent navigation only supports HTTP(S) URLs without credentials.");
  }
  await invokePageAgentNavigate(id, url);
}

async function handleRequest(id: string, bodyText: string): Promise<void> {
  const currentGeneration = generation;
  const session = get(sessionState);
  const localAgent = get(settings).localAgent;
  try {
    if (!session.sessionId || session.status !== "accepted") {
      throw new Error("Keine AuraGo-Session. Verbinde dich zuerst, bevor du den Page-Agent nutzt.");
    }
    const request = parseOpenAiChatRequest(bodyText);
    // Match local-agent's llm-client: omit `model` so AuraGo uses the provider's
    // configured default. page-agent always sends a cosmetic model label that
    // must never reach AuraGo (that caused non_retryable_config).
    const result = await sendLocalAgentLlm(wsSend, {
      session_id: session.sessionId,
      request_id: `pa:llm:${id}`,
      provider_id: localAgent.auragoProviderId,
      messages: request.messages,
      tools: request.tools,
      tool_choice: request.tool_choice,
    });
    if (!result.success) {
      console.warn("[agodesk:page-agent] llm proxy failed", {
        request_id: result.request_id,
        error_code: result.error_code,
        error_message: result.error_message,
        provider_id: localAgent.auragoProviderId ?? null,
      });
    }
    const completion = toOpenAiChatCompletion(
      result,
      localAgent.auragoProviderId || PAGE_AGENT_COSMETIC_MODEL,
    );
    if (currentGeneration !== generation || get(sessionState).sessionId !== session.sessionId)
      return;
    await invokePageAgentResolve(id, true, JSON.stringify(completion));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[agodesk:page-agent] llm request error", { id, message });
    if (currentGeneration === generation)
      await invokePageAgentResolve(id, false, message).catch(() => {});
  }
}

/** Starts forwarding in-page page-agent LLM requests to the AuraGo proxy. */
export async function startPageAgentBridge(): Promise<void> {
  if (unlisten || starting) {
    return;
  }
  starting = true;
  const currentGeneration = generation;
  try {
    const stopRequests = await listen<string>(PAGE_AGENT_EVENT, (event) => {
      if (
        currentGeneration !== generation ||
        typeof event.payload !== "string" ||
        event.payload.length > 524288
      )
        return;
      let parsed: PageAgentBridgeEvent | null = null;
      try {
        parsed = JSON.parse(event.payload) as PageAgentBridgeEvent;
      } catch {
        parsed = null;
      }
      if (
        !parsed ||
        typeof parsed.id !== "string" ||
        !parsed.id ||
        parsed.id.length > 128 ||
        inFlight.has(parsed.id) ||
        inFlight.size >= 8 ||
        get(sessionState).status !== "accepted" ||
        !get(settings).pageAgentEnabled ||
        !get(settings).desktopControlEnabled ||
        !get(settings).browserControlEnabled
      ) {
        return;
      }
      if (typeof parsed.navigate === "string" && parsed.navigate.trim()) {
        inFlight.add(parsed.id);
        void handleNavigate(parsed.id, parsed.navigate)
          .catch((error) => {
            console.warn("[agodesk:page-agent] navigate failed", {
              id: parsed.id,
              message: error instanceof Error ? error.message : String(error),
            });
            if (currentGeneration === generation) {
              void invokePageAgentResolve(
                parsed.id,
                false,
                error instanceof Error ? error.message : String(error),
              ).catch(() => {});
            }
          })
          .finally(() => inFlight.delete(parsed.id));
        return;
      }
      if (typeof parsed.body !== "string") return;
      inFlight.add(parsed.id);
      void handleRequest(parsed.id, parsed.body).finally(() => inFlight.delete(parsed.id));
    });
    if (currentGeneration !== generation) {
      stopRequests();
      return;
    }
    unlisten = stopRequests;
    const stopReady = await listen(PAGE_AGENT_PAGE_READY_EVENT, () => {
      if (currentGeneration === generation) scheduleEnsureAfterNavigation();
    });
    if (currentGeneration !== generation) {
      stopReady();
      return;
    }
    unlistenPageReady = stopReady;
  } finally {
    starting = false;
  }
}

export function stopPageAgentBridge(): void {
  generation += 1;
  inFlight.clear();
  if (ensureTimer) {
    clearTimeout(ensureTimer);
    ensureTimer = null;
  }
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
  if (unlistenPageReady) {
    unlistenPageReady();
    unlistenPageReady = null;
  }
}

export function pageAgentBridgeActive(): boolean {
  return unlisten !== null;
}
