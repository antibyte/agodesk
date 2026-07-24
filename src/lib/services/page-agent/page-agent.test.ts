import test from "node:test";
import assert from "node:assert/strict";
import type { LocalAgentLlmResultPayload } from "../../types/local-agent-protocol.ts";
import {
  parseOpenAiChatRequest,
  toOpenAiChatCompletion,
} from "./openai-map.ts";
import {
  buildPageAgentBootstrap,
  resolvePageAgentLanguage,
} from "./bootstrap.ts";

test("parseOpenAiChatRequest extracts messages, tools, model and tool_choice", () => {
  const body = JSON.stringify({
    model: "gpt-4o",
    tool_choice: "required",
    messages: [{ role: "user", content: "open the imprint" }],
    tools: [{ type: "function", function: { name: "macro" } }],
    parallel_tool_calls: false,
  });

  const parsed = parseOpenAiChatRequest(body);
  assert.equal(parsed.model, "gpt-4o");
  assert.equal(parsed.tool_choice, "required");
  assert.equal(parsed.messages.length, 1);
  assert.equal(parsed.tools?.length, 1);
});

test("parseOpenAiChatRequest tolerates missing arrays", () => {
  const parsed = parseOpenAiChatRequest("{}");
  assert.deepEqual(parsed.messages, []);
  assert.equal(parsed.tools, undefined);
  assert.equal(parsed.model, undefined);
});

test("toOpenAiChatCompletion maps tool_calls with stringified arguments", () => {
  const result: LocalAgentLlmResultPayload = {
    request_id: "pa:llm:1",
    success: true,
    message: {
      role: "assistant",
      tool_calls: [
        { id: "call_1", name: "macro", arguments: { action: { click: "#imprint" } } },
      ],
    },
    error_code: null,
    error_message: null,
  };

  const completion = toOpenAiChatCompletion(result, "gpt-4o");
  const choice = completion.choices[0];
  assert.equal(completion.object, "chat.completion");
  assert.equal(choice.finish_reason, "tool_calls");
  const toolCall = choice.message.tool_calls?.[0];
  assert.ok(toolCall);
  assert.equal(toolCall.function.name, "macro");
  // page-agent parses arguments as a JSON string, not an object.
  assert.equal(typeof toolCall.function.arguments, "string");
  assert.deepEqual(JSON.parse(toolCall.function.arguments), { action: { click: "#imprint" } });
});

test("toOpenAiChatCompletion falls back to stop when no tool_calls", () => {
  const result: LocalAgentLlmResultPayload = {
    request_id: "pa:llm:2",
    success: true,
    message: { role: "assistant", content: "done" },
    error_code: null,
    error_message: null,
  };

  const completion = toOpenAiChatCompletion(result, "aurago");
  assert.equal(completion.choices[0].finish_reason, "stop");
  assert.equal(completion.choices[0].message.content, "done");
  assert.equal(completion.choices[0].message.tool_calls, undefined);
});

test("toOpenAiChatCompletion throws on failed proxy result", () => {
  const result: LocalAgentLlmResultPayload = {
    request_id: "pa:llm:3",
    success: false,
    error_code: "PROVIDER_ERROR",
    error_message: "upstream rejected",
  };
  assert.throws(() => toOpenAiChatCompletion(result, "aurago"), /upstream rejected/);
});

test("resolvePageAgentLanguage maps zh locales to zh-CN and defaults to en-US", () => {
  assert.equal(resolvePageAgentLanguage("zh"), "zh-CN");
  assert.equal(resolvePageAgentLanguage("zh-CN"), "zh-CN");
  assert.equal(resolvePageAgentLanguage("de"), "en-US");
  assert.equal(resolvePageAgentLanguage("system"), "en-US");
  assert.equal(resolvePageAgentLanguage(undefined), "en-US");
});

test("buildPageAgentBootstrap wires the binding and resolver without real secrets", () => {
  const script = buildPageAgentBootstrap({
    bindingName: "agodeskPageAgentLlm",
    baseUrl: "https://agodesk.pageagent.local/v1",
    model: "aurago",
    language: "en-US",
    maxSteps: 40,
  });

  assert.match(script, /agodeskPageAgentLlm/);
  assert.match(script, /__agodeskPageAgentResolve/);
  assert.match(script, /customFetch: agodeskFetch/);
  assert.match(script, /new window\.PageAgent/);
  // The proxy apiKey is a sentinel, never a real credential.
  assert.match(script, /"apiKey":"agodesk-proxy"/);
  assert.doesNotMatch(script, /sk-[A-Za-z0-9]{16,}/);
});
