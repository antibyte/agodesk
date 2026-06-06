import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAgentMoodInstructionBlock,
  buildMoodVoiceStyle,
  clampMoodScalar,
  resolvePrimaryMoodLabel,
} from "./speech-mood.ts";

test("resolvePrimaryMoodLabel normalisiert mood und primary_mood", () => {
  assert.equal(resolvePrimaryMoodLabel({ mood: "Focused" }), "focused");
  assert.equal(resolvePrimaryMoodLabel({ primary_mood: "Curious" }), "curious");
});

test("buildMoodVoiceStyle mappt bekannte Stimmungen", () => {
  assert.equal(buildMoodVoiceStyle({ mood: "focused" }).tone, "precise");
  assert.equal(buildMoodVoiceStyle({ mood: "playful" }).tone, "warm");
  assert.equal(buildMoodVoiceStyle({ mood: "concerned" }).tone, "serious");
});

test("clampMoodScalar begrenzt Werte", () => {
  assert.equal(clampMoodScalar(2, -1, 1), 1);
  assert.equal(clampMoodScalar(-2, -1, 1), -1);
  assert.equal(clampMoodScalar(undefined, 0, 1), undefined);
});

test("buildAgentMoodInstructionBlock nutzt recommended_response_style", () => {
  const block = buildAgentMoodInstructionBlock({
    mood: "creative",
    recommended_response_style: "freundlich und neugierig",
  });
  assert.match(block, /freundlich und neugierig/);
  assert.doesNotMatch(block, /description/i);
});

test("buildAgentMoodInstructionBlock enthält numerische Hinweise", () => {
  const block = buildAgentMoodInstructionBlock({
    mood: "analytical",
    valence: 0.8,
    arousal: 0.7,
    confidence: 0.9,
  });
  assert.match(block, /positiv|energischer|selbstsicher/i);
});
