import test from "node:test";
import assert from "node:assert/strict";
import type { WsMessage } from "../../types/protocol.ts";
import {
  handleLocalAgentRemoteToolResult,
  rejectAllLocalAgentWaiters,
  sendRemoteTool,
} from "./remote-bridge.ts";

test("sendRemoteTool resolves when a matching result arrives", async () => {
  const send = async (message: WsMessage): Promise<void> => {
    const payload = message.payload as { request_id: string; tool: string };
    // Simulate AuraGo answering asynchronously.
    queueMicrotask(() => {
      handleLocalAgentRemoteToolResult({
        request_id: payload.request_id,
        tool: payload.tool,
        success: true,
        result: { hits: 2 },
      });
    });
  };

  const result = await sendRemoteTool(send, {
    session_id: "sess-1",
    request_id: "req-abc",
    tool: "memory_search",
    arguments: { query: "x" },
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.result, { hits: 2 });
});

test("rejectAllLocalAgentWaiters rejects pending remote tool calls", async () => {
  const neverAnswers = async (): Promise<void> => {};
  const pending = sendRemoteTool(neverAnswers, {
    session_id: "sess-1",
    request_id: "req-pending",
    tool: "memory_get",
    arguments: { id: "1" },
  });

  rejectAllLocalAgentWaiters(new Error("disconnected"));

  await assert.rejects(pending, /disconnected/);
});

test("handleLocalAgentRemoteToolResult returns false for unknown request", () => {
  assert.equal(
    handleLocalAgentRemoteToolResult({ request_id: "does-not-exist", success: true }),
    false,
  );
});
