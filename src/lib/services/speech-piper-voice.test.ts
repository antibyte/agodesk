import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { piperVoiceCandidateOrder } from "./speech-piper-voice";

describe("speech-piper-voice", () => {
  it("orders preferred voice first then locale catalog", () => {
    const order = piperVoiceCandidateOrder("de-DE", "de_DE-kerstin-low");
    assert.equal(order[0], "de_DE-kerstin-low");
    assert.ok(order.includes("de_DE-thorsten-high"));
  });

  it("includes English voices as fallback candidates", () => {
    const order = piperVoiceCandidateOrder("fr-FR", "de_DE-kerstin-low");
    assert.ok(order.some((voice) => voice.startsWith("en_US-")));
  });
});
