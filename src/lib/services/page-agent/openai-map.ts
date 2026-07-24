import type {
  LocalAgentLlmMessage,
  LocalAgentLlmResultPayload,
} from "../../types/local-agent-protocol";

/**
 * Minimal shape of the OpenAI chat-completions request that page-agent's LLM
 * client (`@page-agent/llms`) sends through the injected `customFetch`.
 */
export interface OpenAiChatRequest {
  messages: LocalAgentLlmMessage[];
  tools?: Record<string, unknown>[];
  model?: string;
  tool_choice?: unknown;
}

export interface OpenAiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OpenAiChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAiToolCall[];
    };
    finish_reason: "tool_calls" | "stop";
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Parses the raw request body page-agent handed to `customFetch` and extracts
 * the fields agodesk forwards to the AuraGo LLM proxy. Throws on malformed JSON.
 */
export function parseOpenAiChatRequest(bodyText: string): OpenAiChatRequest {
  const parsed = JSON.parse(bodyText) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("page-agent LLM request body is not an object.");
  }
  return {
    messages: asArray<LocalAgentLlmMessage>(parsed.messages),
    tools: Array.isArray(parsed.tools)
      ? (parsed.tools as Record<string, unknown>[])
      : undefined,
    model: typeof parsed.model === "string" ? parsed.model : undefined,
    tool_choice: parsed.tool_choice,
  };
}

/**
 * Maps AuraGo's `local.agent.llm.result` back into the OpenAI chat-completion
 * shape page-agent expects: `choices[0].message.tool_calls` with stringified
 * arguments and `finish_reason: "tool_calls"` whenever tool calls are present.
 */
export function toOpenAiChatCompletion(
  result: LocalAgentLlmResultPayload,
  model: string,
): OpenAiChatCompletion {
  if (!result.success || !result.message) {
    const detail = [result.error_code, result.error_message]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(": ");
    throw new Error(
      detail || "AuraGo LLM proxy returned no message for page-agent.",
    );
  }

  const message = result.message;
  const toolCalls: OpenAiToolCall[] = (message.tool_calls ?? []).map((call, index) => ({
    id: call.id || `call_${index}`,
    type: "function",
    function: {
      name: call.name,
      arguments: JSON.stringify(call.arguments ?? {}),
    },
  }));
  const hasToolCalls = toolCalls.length > 0;

  return {
    id: `pageagent-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: message.content ?? null,
          ...(hasToolCalls ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: hasToolCalls ? "tool_calls" : "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}
