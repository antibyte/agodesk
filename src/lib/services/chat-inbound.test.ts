import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeChatResponseChunkPayload,
} from "../types/protocol.ts";
import { applyChatResponseChunk } from "../services/chat-inbound.ts";
import { chatMessages } from "../stores/chat.ts";

test("normalizeChatResponseChunkPayload akzeptiert snake_case", () => {
  assert.deepEqual(
    normalizeChatResponseChunkPayload({
      session_id: "sess-1",
      request_id: "req-1",
      delta: "Hallo",
      done: false,
    }),
    {
      session_id: "sess-1",
      request_id: "req-1",
      delta: "Hallo",
      done: false,
    },
  );
});

test("normalizeChatResponseChunkPayload akzeptiert camelCase", () => {
  assert.deepEqual(
    normalizeChatResponseChunkPayload({
      sessionId: "sess-2",
      requestId: "req-2",
      delta: " Welt",
      done: true,
    }),
    {
      session_id: "sess-2",
      request_id: "req-2",
      delta: " Welt",
      done: true,
    },
  );
});

test("applyChatResponseChunk haengt Chunks an dieselbe Nachricht", () => {
  chatMessages.clearMessages();

  const first = applyChatResponseChunk(
    {
      session_id: "sess-1",
      request_id: "req-abc",
      delta: "Paris",
      done: false,
    },
    "2026-06-04T12:00:00.000Z",
  );
  assert.equal(first.created, true);
  assert.equal(first.completed, false);
  assert.equal(first.text, "Paris");

  const second = applyChatResponseChunk(
    {
      session_id: "sess-1",
      request_id: "req-abc",
      delta: " ist schön.",
      done: true,
    },
    "2026-06-04T12:00:01.000Z",
  );
  assert.equal(second.created, false);
  assert.equal(second.completed, true);
  assert.equal(second.messageId, first.messageId);
  assert.equal(second.text, "Paris ist schön.");

  let messages: Array<{ id: string; text: string; streaming?: boolean }> = [];
  chatMessages.subscribe((value) => {
    messages = value;
  })();
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.text, "Paris ist schön.");
  assert.equal(messages[0]?.streaming, false);
});

test("finalizeStreamingResponse aktualisiert laufenden Stream", () => {
  chatMessages.clearMessages();
  applyChatResponseChunk(
    {
      session_id: "sess-1",
      request_id: "req-dup",
      delta: "Teil",
      done: false,
    },
    "2026-06-04T12:00:00.000Z",
  );

  const finalized = chatMessages.finalizeStreamingResponse(
    "req-dup",
    "Teil fertig",
    "2026-06-04T12:00:01.000Z",
    "env-1",
  );
  assert.equal(finalized, true);

  let messages: Array<{ text: string; streaming?: boolean }> = [];
  chatMessages.subscribe((value) => {
    messages = value;
  })();
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.text, "Teil fertig");
  assert.equal(messages[0]?.streaming, false);
});
