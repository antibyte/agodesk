import test from "node:test";
import assert from "node:assert/strict";
import {
  buildServerAudioDedupKey,
  cancelAssistantFrontendTts,
  claimServerAudioEnqueue,
  resetAssistantTtsTracking,
  scheduleAssistantFrontendTts,
} from "./chat-assistant-tts.ts";

test("buildServerAudioDedupKey normalisiert Pfad", () => {
  assert.equal(
    buildServerAudioDedupKey("req-1", " /api/agodesk/tts/a.mp3 "),
    "req-1::/api/agodesk/tts/a.mp3",
  );
});

test("claimServerAudioEnqueue dedupliziert gleiche request_id und path", () => {
  resetAssistantTtsTracking();
  assert.equal(claimServerAudioEnqueue("req-1", "/tts/a.mp3"), true);
  assert.equal(claimServerAudioEnqueue("req-1", "/tts/a.mp3"), false);
  assert.equal(claimServerAudioEnqueue("req-1", "/tts/b.mp3"), true);
  resetAssistantTtsTracking();
});

test("scheduleAssistantFrontendTts plant pro request_id nur einmal", () => {
  resetAssistantTtsTracking();
  const originalWindow = globalThis.window;
  globalThis.window = {
    setTimeout: () => 42,
  } as Window;

  try {
    const scheduledA = scheduleAssistantFrontendTts({
      requestId: "req-1",
      text: "Hallo",
      delayMs: 5_000,
    });
    const scheduledB = scheduleAssistantFrontendTts({
      requestId: "req-1",
      text: "Hallo nochmal",
      delayMs: 0,
    });
    assert.equal(scheduledA, true);
    assert.equal(scheduledB, false);
  } finally {
    globalThis.window = originalWindow;
    cancelAssistantFrontendTts("req-1");
    resetAssistantTtsTracking();
  }
});
