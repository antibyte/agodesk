import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMistralRealtimeEvent,
  accumulateRealtimeTranscript,
  parseMistralTtsSseBlock,
} from "./mistral-realtime-protocol.ts";

test("parseMistralRealtimeEvent extracts text.delta", () => {
  const ev = parseMistralRealtimeEvent({
    type: "transcription.text.delta",
    text: "Hallo",
  });
  assert.equal(ev.type, "transcription.text.delta");
  assert.equal(ev.text, "Hallo");
});

test("accumulateRealtimeTranscript appends deltas and finalizes on done", () => {
  let text = "";
  text = accumulateRealtimeTranscript(text, {
    type: "transcription.text.delta",
    text: "Hi ",
  });
  text = accumulateRealtimeTranscript(text, {
    type: "transcription.text.delta",
    text: "there",
  });
  assert.equal(text, "Hi there");
  const done = parseMistralRealtimeEvent({
    type: "transcription.done",
    text: "Hi there",
  });
  assert.equal(done.type, "transcription.done");
});

test("parseMistralTtsSseBlock reads speech.audio.delta", () => {
  const parsed = parseMistralTtsSseBlock(
    'event: speech.audio.delta\ndata: {"audio_data":"AAAA"}\n',
  );
  assert.equal(parsed?.event, "speech.audio.delta");
  assert.equal(parsed?.audioBase64, "AAAA");
});
