import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLocalAgentHandoffMessage,
  buildLocalAgentLlmMessage,
  buildLocalAgentRemoteToolMessage,
  buildLocalAgentTurnMessage,
  normalizeLocalAgentLlmResult,
  normalizeLocalAgentRemoteToolResult,
  toRfc3339,
} from "./local-agent-protocol.ts";

test("toRfc3339 strips fractional seconds for Go time.RFC3339", () => {
  const value = toRfc3339(new Date("2026-07-17T18:33:49.714Z"));
  assert.equal(value, "2026-07-17T18:33:49Z");
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test("buildLocalAgentRemoteToolMessage sets type and payload", () => {
  const message = buildLocalAgentRemoteToolMessage({
    session_id: "sess-1",
    request_id: "req-1",
    tool: "memory_search",
    arguments: { query: "hello" },
  });
  assert.equal(message.type, "local.agent.remote_tool");
  assert.equal(message.payload.tool, "memory_search");
  assert.ok(message.id.length > 0);
  assert.ok(message.payload.client_timestamp);
  assert.match(message.payload.client_timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(message.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test("buildLocalAgentHandoffMessage and turn message carry request id", () => {
  const handoff = buildLocalAgentHandoffMessage({
    session_id: "sess-1",
    request_id: "req-1",
    user_message: "do it",
  });
  assert.equal(handoff.type, "local.agent.handoff");
  assert.ok(handoff.payload.client_timestamp);

  const turn = buildLocalAgentTurnMessage({
    session_id: "sess-1",
    request_id: "req-1",
    status: "completed",
    user_message: "hi",
    assistant_message: "done",
  });
  assert.equal(turn.type, "local.agent.turn");
  assert.equal(turn.payload.status, "completed");
  assert.ok(turn.payload.client_timestamp);
});

test("buildLocalAgentLlmMessage includes client_timestamp", () => {
  const message = buildLocalAgentLlmMessage({
    session_id: "sess-1",
    request_id: "req-1",
    messages: [{ role: "user", content: "hi" }],
  });
  assert.equal(message.type, "local.agent.llm");
  assert.ok(message.payload.client_timestamp);
});

test("normalizeLocalAgentRemoteToolResult requires request_id", () => {
  assert.equal(normalizeLocalAgentRemoteToolResult({}), null);
  const normalized = normalizeLocalAgentRemoteToolResult({
    request_id: "req-1",
    tool: "memory_get",
    success: true,
    result: { value: 42 },
  });
  assert.ok(normalized);
  assert.equal(normalized?.success, true);
  assert.deepEqual(normalized?.result, { value: 42 });
});

test("normalizeLocalAgentLlmResult parses string tool_call arguments", () => {
  const normalized = normalizeLocalAgentLlmResult({
    request_id: "req-1",
    success: true,
    message: {
      role: "assistant",
      content: "",
      tool_calls: [{ id: "call_1", name: "file_read", arguments: '{"path":"a.txt"}' }],
    },
  });
  assert.ok(normalized?.message);
  assert.equal(normalized?.message?.tool_calls?.length, 1);
  assert.deepEqual(normalized?.message?.tool_calls?.[0].arguments, { path: "a.txt" });
});

test("normalizeLocalAgentLlmResult accepts OpenAI choices and ok flag", () => {
  const normalized = normalizeLocalAgentLlmResult({
    request_id: "req-openai",
    ok: true,
    choices: [
      {
        message: {
          role: "assistant",
          content: "Hallo",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "file_read", arguments: '{"path":"a.txt"}' },
            },
          ],
        },
      },
    ],
  });
  assert.equal(normalized?.success, true);
  assert.equal(normalized?.message?.content, "Hallo");
  assert.equal(normalized?.message?.tool_calls?.[0].name, "file_read");
  assert.deepEqual(normalized?.message?.tool_calls?.[0].arguments, { path: "a.txt" });
});

test("normalizeLocalAgentLlmResult accepts flat content without success flag", () => {
  const normalized = normalizeLocalAgentLlmResult({
    request_id: "req-flat",
    content: "fertig",
  });
  assert.equal(normalized?.success, true);
  assert.equal(normalized?.message?.content, "fertig");
});

test("normalizeLocalAgentLlmResult accepts message as plain string", () => {
  const normalized = normalizeLocalAgentLlmResult({
    request_id: "req-string-msg",
    success: true,
    message: "Klar, ich helfe dir.",
  });
  assert.equal(normalized?.success, true);
  assert.equal(normalized?.message?.content, "Klar, ich helfe dir.");
});

test("normalizeLocalAgentLlmResult accepts data.choices and content parts", () => {
  const normalized = normalizeLocalAgentLlmResult({
    request_id: "req-data",
    success: true,
    data: {
      choices: [
        {
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Es regnet morgen." }],
          },
        },
      ],
    },
  });
  assert.equal(normalized?.success, true);
  assert.equal(normalized?.message?.content, "Es regnet morgen.");
});

test("normalizeLocalAgentLlmResult accepts choices[0].text", () => {
  const normalized = normalizeLocalAgentLlmResult({
    request_id: "req-text",
    choices: [{ text: "Antwort" }],
  });
  assert.equal(normalized?.success, true);
  assert.equal(normalized?.message?.content, "Antwort");
});
