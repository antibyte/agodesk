import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { createBargeInDetector } from "./speech-barge-detector.ts";
import type { VoiceActivityDetector } from "./speech-vad.ts";

function createMockVad(alwaysSpeech: boolean): VoiceActivityDetector {
  return {
    process: () => alwaysSpeech,
    reset: () => {},
  };
}

function loudSamples(amplitude = 0.2, length = 512): Float32Array {
  return new Float32Array(length).fill(amplitude);
}

describe("speech-barge-detector", () => {
  let bargeCalls: number;

  beforeEach(() => {
    bargeCalls = 0;
  });

  it("does not trigger when AI is not speaking", () => {
    const detector = createBargeInDetector({
      getIsAiSpeaking: () => false,
      onBargeIn: () => {
        bargeCalls += 1;
      },
      energyThreshold: 0.1,
      minSpeakingSamples: 1,
    });

    detector.processRawAudio?.(loudSamples());
    detector.processRawAudio?.(loudSamples());

    assert.equal(bargeCalls, 0);
  });

  it("triggers barge-in via processRawAudio when energy exceeds threshold", () => {
    const detector = createBargeInDetector({
      getIsAiSpeaking: () => true,
      onBargeIn: () => {
        bargeCalls += 1;
      },
      energyThreshold: 0.05,
      minSpeakingSamples: 2,
    });

    detector.processRawAudio?.(loudSamples(0.2));
    assert.equal(bargeCalls, 0, "needs debounce samples");
    detector.processRawAudio?.(loudSamples(0.2));
    assert.equal(bargeCalls, 1);
  });

  it("triggers when mock VAD detects speech even at low energy", () => {
    const detector = createBargeInDetector({
      getIsAiSpeaking: () => true,
      onBargeIn: () => {
        bargeCalls += 1;
      },
      energyThreshold: 0.5,
      minSpeakingSamples: 2,
      vad: createMockVad(true),
    });

    detector.processRawAudio?.(loudSamples(0.01));
    detector.processRawAudio?.(loudSamples(0.01));
    assert.equal(bargeCalls, 1);
  });

  it("does not retrigger in the same AI turn", () => {
    const detector = createBargeInDetector({
      getIsAiSpeaking: () => true,
      onBargeIn: () => {
        bargeCalls += 1;
      },
      energyThreshold: 0.05,
      minSpeakingSamples: 2,
    });

    detector.processRawAudio?.(loudSamples(0.2));
    detector.processRawAudio?.(loudSamples(0.2));
    detector.processRawAudio?.(loudSamples(0.2));
    assert.equal(bargeCalls, 1);
  });

  it("raises threshold when playback energy is high (echo suppression)", () => {
    const detector = createBargeInDetector({
      getIsAiSpeaking: () => true,
      getPlaybackEnergy: () => 0.15,
      onBargeIn: () => {
        bargeCalls += 1;
      },
      energyThreshold: 0.105,
      minSpeakingSamples: 2,
    });

    // adaptiveThreshold = 0.105 + min(0.08, 0.09) = 0.185; energy 0.12 is below
    detector.processRawAudio?.(loudSamples(0.12));
    detector.processRawAudio?.(loudSamples(0.12));
    assert.equal(bargeCalls, 0);
  });

  it("respects minSpeakingSamples debounce", () => {
    const detector = createBargeInDetector({
      getIsAiSpeaking: () => true,
      onBargeIn: () => {
        bargeCalls += 1;
      },
      energyThreshold: 0.05,
      minSpeakingSamples: 3,
    });

    detector.processRawAudio?.(loudSamples(0.2));
    detector.processRawAudio?.(loudSamples(0.2));
    assert.equal(bargeCalls, 0);
    detector.processRawAudio?.(loudSamples(0.2));
    assert.equal(bargeCalls, 1);
  });
});
