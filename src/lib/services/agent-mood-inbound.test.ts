import test from "node:test";
import assert from "node:assert/strict";
import { extractAgentMoodFromMetadata, handleChatResponseMood } from "./agent-mood-inbound.ts";
import { agentMoodState } from "../stores/agent-mood.ts";

test("extractAgentMoodFromMetadata parst agent_mood sicher", () => {
  const mood = extractAgentMoodFromMetadata({
    agent_mood: {
      mood: "focused",
      valence: 0.4,
      extra_field: "ignored-by-ui",
    },
  });
  assert.equal(mood?.mood, "focused");
  assert.equal(mood?.valence, 0.4);
  assert.equal(mood?.extra_field, "ignored-by-ui");
});

test("extractAgentMoodFromMetadata gibt null ohne Mood zurück", () => {
  assert.equal(extractAgentMoodFromMetadata(undefined), null);
  assert.equal(extractAgentMoodFromMetadata({}), null);
});

test("handleChatResponseMood aktualisiert agentMoodState", () => {
  agentMoodState.reset();

  handleChatResponseMood({
    session_id: "sess-1",
    request_id: "req-1",
    text: "Antwort",
    role: "assistant",
    metadata: {
      agent_mood: {
        mood: "curious",
        recommended_response_style: "lebendig",
      },
    },
  });

  let state = {
    mood: null as { mood?: string } | null,
    sessionId: "",
    requestId: undefined as string | undefined,
  };
  agentMoodState.subscribe((value) => {
    state = value;
  })();
  assert.equal(state.sessionId, "sess-1");
  assert.equal(state.requestId, "req-1");
  assert.equal(state.mood?.mood, "curious");
});
