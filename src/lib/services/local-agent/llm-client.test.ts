import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOCAL_AGENT_SETTINGS, type LocalAgentSettings } from "../../types/protocol.ts";
import { runLlmStep } from "./llm-client.ts";

interface FetchCall {
  url: string;
  init: RequestInit;
}

function stubFetch(
  responder: (url: string, init: RequestInit) => { ok: boolean; status?: number; body: unknown },
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const result = responder(url, init ?? {});
    return {
      ok: result.ok,
      status: result.status ?? (result.ok ? 200 : 500),
      json: async () => result.body,
      text: async () => JSON.stringify(result.body),
    } as unknown as Response;
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function ollamaSettings(overrides: Partial<LocalAgentSettings> = {}): LocalAgentSettings {
  return {
    ...DEFAULT_LOCAL_AGENT_SETTINGS,
    enabled: true,
    providerSource: "ollama",
    ollamaProvider: { baseUrl: "http://localhost:11434", model: "llama3.1" },
    ...overrides,
  };
}

const noopSend = async () => {};

test("ollama step targets the OpenAI-compatible /v1 endpoint", async () => {
  const fetchStub = stubFetch(() => ({
    ok: true,
    body: { choices: [{ message: { content: "Hallo" } }] },
  }));
  try {
    const result = await runLlmStep({
      send: noopSend,
      sessionId: "s",
      requestId: "r",
      settings: ollamaSettings(),
      messages: [{ role: "user", content: "hi" }],
      tools: [],
    });
    assert.equal(result.content, "Hallo");
    assert.equal(fetchStub.calls.length, 1);
    assert.equal(fetchStub.calls[0].url, "http://localhost:11434/v1/chat/completions");
    const body = JSON.parse(String(fetchStub.calls[0].init.body)) as Record<string, unknown>;
    assert.equal(body.model, "llama3.1");
    // No API key → no Authorization header.
    const headers = fetchStub.calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, undefined);
  } finally {
    fetchStub.restore();
  }
});

test("ollama step does not double-append /v1 when the base URL already includes it", async () => {
  const fetchStub = stubFetch(() => ({
    ok: true,
    body: { choices: [{ message: { content: "ok" } }] },
  }));
  try {
    await runLlmStep({
      send: noopSend,
      sessionId: "s",
      requestId: "r",
      settings: ollamaSettings({
        ollamaProvider: { baseUrl: "http://localhost:11434/v1/", model: "qwen2.5" },
      }),
      messages: [{ role: "user", content: "hi" }],
      tools: [],
    });
    assert.equal(fetchStub.calls[0].url, "http://localhost:11434/v1/chat/completions");
  } finally {
    fetchStub.restore();
  }
});

test("ollama step parses tool calls", async () => {
  const fetchStub = stubFetch(() => ({
    ok: true,
    body: {
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              { id: "call-1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
            ],
          },
        },
      ],
    },
  }));
  try {
    const result = await runLlmStep({
      send: noopSend,
      sessionId: "s",
      requestId: "r",
      settings: ollamaSettings(),
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function" }],
    });
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, "read_file");
    assert.deepEqual(result.toolCalls[0].arguments, { path: "a.txt" });
  } finally {
    fetchStub.restore();
  }
});

test("ollama step throws a labelled error on non-ok responses", async () => {
  const fetchStub = stubFetch(() => ({ ok: false, status: 500, body: { error: "boom" } }));
  try {
    await assert.rejects(
      runLlmStep({
        send: noopSend,
        sessionId: "s",
        requestId: "r",
        settings: ollamaSettings(),
        messages: [{ role: "user", content: "hi" }],
        tools: [],
      }),
      /Ollama antwortete mit 500/,
    );
  } finally {
    fetchStub.restore();
  }
});

test("ollama step falls back to the default base URL when empty", async () => {
  const fetchStub = stubFetch(() => ({
    ok: true,
    body: { choices: [{ message: { content: "x" } }] },
  }));
  try {
    await runLlmStep({
      send: noopSend,
      sessionId: "s",
      requestId: "r",
      settings: ollamaSettings({ ollamaProvider: { baseUrl: "", model: "llama3.1" } }),
      messages: [{ role: "user", content: "hi" }],
      tools: [],
    });
    assert.equal(fetchStub.calls[0].url, "http://localhost:11434/v1/chat/completions");
  } finally {
    fetchStub.restore();
  }
});

test("ollama step rejects when no model is configured", async () => {
  await assert.rejects(
    runLlmStep({
      send: noopSend,
      sessionId: "s",
      requestId: "r",
      settings: ollamaSettings({ ollamaProvider: { baseUrl: "http://localhost:11434", model: "" } }),
      messages: [{ role: "user", content: "hi" }],
      tools: [],
    }),
    /Ollama-Modell/,
  );
});
