import { DEFAULT_OLLAMA_BASE_URL, type LocalAgentSettings } from "../../types/protocol";
import type {
  LocalAgentLlmMessage,
  LocalAgentLlmToolCall,
} from "../../types/local-agent-protocol";
import { sendLocalAgentLlm, type LocalAgentSend } from "./remote-bridge";
import { getTranslateFn } from "../../i18n/store";

export type LlmMessage = LocalAgentLlmMessage;
export type LlmToolCall = LocalAgentLlmToolCall;

export interface LlmStepResult {
  content: string;
  toolCalls: LlmToolCall[];
}

export interface RunLlmStepOptions {
  send: LocalAgentSend;
  sessionId: string;
  requestId: string;
  settings: LocalAgentSettings;
  messages: LlmMessage[];
  tools: Record<string, unknown>[];
}

/** One chat-completion step. Tool calls are executed by the caller (the loop). */
export async function runLlmStep(options: RunLlmStepOptions): Promise<LlmStepResult> {
  if (options.settings.providerSource === "local") {
    return runLocalProviderStep(options);
  }
  if (options.settings.providerSource === "ollama") {
    return runOllamaStep(options);
  }
  return runAuragoProxyStep(options);
}

async function runAuragoProxyStep(options: RunLlmStepOptions): Promise<LlmStepResult> {
  const result = await sendLocalAgentLlm(options.send, {
    session_id: options.sessionId,
    request_id: options.requestId,
    provider_id: options.settings.auragoProviderId,
    messages: options.messages,
    tools: options.tools,
  });
  if (!result.success || !result.message) {
    const detail =
      result.error_message ||
      result.error_code ||
      (result.message ? null : "Antwort ohne message/choices");
    // Always log shape — this is the recurring proxy-parse failure mode.
    console.warn("[agodesk:local-agent] llm.result unusable", {
      success: result.success,
      error_code: result.error_code,
      error_message: result.error_message,
      has_message: Boolean(result.message),
      keys:
        result && typeof result === "object"
          ? Object.keys(result as unknown as Record<string, unknown>)
          : [],
    });
    throw new Error(
      detail
        ? `AuraGo LLM-Proxy: ${detail}`
        : "AuraGo LLM-Proxy lieferte kein Ergebnis.",
    );
  }
  return {
    content: result.message.content ?? "",
    toolCalls: result.message.tool_calls ?? [],
  };
}

interface OpenAiToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAiChoiceMessage {
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
}

async function runLocalProviderStep(options: RunLlmStepOptions): Promise<LlmStepResult> {
  const provider = options.settings.localProvider;
  if (!provider || !provider.baseUrl.trim() || !provider.model.trim()) {
    throw new Error(getTranslateFn()("localAgent.error.providerIncomplete"));
  }

  const endpoint = `${provider.baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
  return runOpenAiCompatibleStep(options, {
    endpoint,
    model: provider.model.trim(),
    apiKey: provider.apiKey.trim(),
    label: getTranslateFn()("localAgent.label.localProvider"),
  });
}

async function runOllamaStep(options: RunLlmStepOptions): Promise<LlmStepResult> {
  const provider = options.settings.ollamaProvider;
  if (!provider || !provider.model.trim()) {
    throw new Error(getTranslateFn()("localAgent.error.ollamaModelMissing"));
  }

  const base = (provider.baseUrl.trim() || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
  // Ollama exposes an OpenAI-compatible surface under /v1; append it unless the
  // user already pointed the base URL at it.
  const root = base.endsWith("/v1") ? base : `${base}/v1`;
  return runOpenAiCompatibleStep(options, {
    endpoint: `${root}/chat/completions`,
    model: provider.model.trim(),
    apiKey: "",
    label: "Ollama",
  });
}

interface OpenAiCompatibleConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  label: string;
}

/** Shared OpenAI-compatible chat-completions call (local provider + Ollama). */
async function runOpenAiCompatibleStep(
  options: RunLlmStepOptions,
  config: OpenAiCompatibleConfig,
): Promise<LlmStepResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: options.messages,
      ...(options.tools.length > 0 ? { tools: options.tools, tool_choice: "auto" } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `${config.label} antwortete mit ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: OpenAiChoiceMessage }>;
  };
  const message = data.choices?.[0]?.message ?? {};
  const toolCalls: LlmToolCall[] = (message.tool_calls ?? [])
    .map((call) => {
      const name = call.function?.name;
      if (!name) {
        return null;
      }
      let args: Record<string, unknown> = {};
      const rawArgs = call.function?.arguments;
      if (typeof rawArgs === "string" && rawArgs.trim()) {
        try {
          args = JSON.parse(rawArgs) as Record<string, unknown>;
        } catch {
          args = {};
        }
      }
      return { id: call.id ?? crypto.randomUUID(), name, arguments: args };
    })
    .filter((call): call is LlmToolCall => call !== null);

  return {
    content: typeof message.content === "string" ? message.content : "",
    toolCalls,
  };
}
