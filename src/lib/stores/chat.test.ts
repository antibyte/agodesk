import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import { chatMessages, MAX_CHAT_MESSAGES } from "./chat.ts";

test("addMessage begrenzt Historie auf MAX_CHAT_MESSAGES", () => {
  chatMessages.clearMessages();

  for (let index = 0; index < MAX_CHAT_MESSAGES + 25; index += 1) {
    chatMessages.addMessage({
      id: `msg-${index}`,
      role: "user",
      text: `Nachricht ${index}`,
      timestamp: new Date().toISOString(),
    });
  }

  const messages = get(chatMessages);
  assert.equal(messages.length, MAX_CHAT_MESSAGES);
  assert.equal(messages[0]?.id, "msg-25");
  assert.equal(messages.at(-1)?.id, `msg-${MAX_CHAT_MESSAGES + 24}`);

  chatMessages.clearMessages();
});
