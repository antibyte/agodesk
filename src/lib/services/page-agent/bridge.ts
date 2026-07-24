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
  invokePageAgentExecute,
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

async function handleNavigate(url: string, resumeTask?: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("page-agent navigate requires a non-empty URL.");
  }
  const task = resumeTask?.trim() || "";
  await invokePageAgentNavigate(trimmed);
  // Soft-ensure reinjects the panel on the new document, then continue the
  // original task automatically (go_to_url wipes the previous JS context).
  await invokePageAgentEnsure();
  if (task) {
    await invokePageAgentExecute(task);
  }
}

async function handleRequest(id: string, bodyText: string): Promise<void> {
  const session = get(sessionState);
  const localAgent = get(settings).localAgent;
  try {
    if (!session.sessionId) {
      throw new Error(
        "Keine AuraGo-Session. Verbinde dich zuerst, bevor du den Page-Agent nutzt.",
      );
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
    await invokePageAgentResolve(id, true, JSON.stringify(completion));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[agodesk:page-agent] llm request error", { id, message });
    await invokePageAgentResolve(id, false, message).catch(() => {});
  }
}

/** Starts forwarding in-page page-agent LLM requests to the AuraGo proxy. */
export async function startPageAgentBridge(): Promise<void> {
  if (unlisten || starting) {
    return;
  }
  starting = true;
  try {
    unlisten = await listen<string>(PAGE_AGENT_EVENT, (event) => {
      let parsed: PageAgentBridgeEvent | null = null;
      try {
        parsed = JSON.parse(event.payload) as PageAgentBridgeEvent;
      } catch {
        parsed = null;
      }
      if (!parsed || typeof parsed.id !== "string") {
        return;
      }
      if (typeof parsed.navigate === "string" && parsed.navigate.trim()) {
        void handleNavigate(
          parsed.navigate,
          typeof parsed.resumeTask === "string" ? parsed.resumeTask : undefined,
        ).catch((error) => {
          console.warn("[agodesk:page-agent] navigate failed", {
            id: parsed.id,
            url: parsed.navigate,
            message: error instanceof Error ? error.message : String(error),
          });
        });
        return;
      }
      void handleRequest(parsed.id, typeof parsed.body === "string" ? parsed.body : "{}");
    });
    unlistenPageReady = await listen(PAGE_AGENT_PAGE_READY_EVENT, () => {
      scheduleEnsureAfterNavigation();
    });
  } finally {
    starting = false;
  }
}

export function stopPageAgentBridge(): void {
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
