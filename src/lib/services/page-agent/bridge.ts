import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { get } from "svelte/store";
import { sessionState } from "../../stores/session";
import { settings } from "../../stores/settings";
import type { WsMessage } from "../../types/protocol";
import { sendLocalAgentLlm } from "../local-agent/remote-bridge";
import { parseOpenAiChatRequest, toOpenAiChatCompletion } from "./openai-map";
import { PAGE_AGENT_EVENT, invokePageAgentResolve } from "./inject";

interface PageAgentBridgeEvent {
  id: string;
  body: string;
}

let unlisten: UnlistenFn | null = null;
let starting = false;

/** Sends WS envelopes directly through the Tauri transport (no ChatView needed). */
const wsSend = (message: WsMessage): Promise<void> =>
  invoke("agodesk_send", { envelope: JSON.stringify(message) });

async function handleRequest(id: string, bodyText: string): Promise<void> {
  const session = get(sessionState);
  const localAgent = get(settings).localAgent;
  try {
    const request = parseOpenAiChatRequest(bodyText);
    const model = request.model || localAgent.auragoProviderId || "aurago";
    const result = await sendLocalAgentLlm(wsSend, {
      session_id: session.sessionId,
      request_id: `pa:llm:${id}`,
      provider_id: localAgent.auragoProviderId,
      model,
      messages: request.messages,
      tools: request.tools,
      tool_choice: request.tool_choice,
    });
    const completion = toOpenAiChatCompletion(result, model);
    await invokePageAgentResolve(id, true, JSON.stringify(completion));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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
      void handleRequest(parsed.id, typeof parsed.body === "string" ? parsed.body : "{}");
    });
  } finally {
    starting = false;
  }
}

export function stopPageAgentBridge(): void {
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
}

export function pageAgentBridgeActive(): boolean {
  return unlisten !== null;
}
