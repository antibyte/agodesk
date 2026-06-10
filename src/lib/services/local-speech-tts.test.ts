import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SPEECH_SETTINGS } from "../types/protocol";
import { resolveLocalTtsConfig } from "./local-speech-tts";

describe("local-speech-tts", () => {
  it("uses Piper for offline provider", () => {
    const config = resolveLocalTtsConfig({
      ...DEFAULT_SPEECH_SETTINGS,
      provider: "offline",
      offlineTtsVoice: "de_DE-thorsten-high",
    });
    assert.equal(config.backend, "piper");
    assert.equal(config.voice, "de_DE-thorsten-high");
  });

  it("falls back to Piper voice when hybrid edge_tts is configured", () => {
    const config = resolveLocalTtsConfig({
      ...DEFAULT_SPEECH_SETTINGS,
      provider: "hybrid",
      hybridTtsBackend: "edge_tts",
      hybridTtsVoice: "de-DE-KatjaNeural",
      offlineTtsVoice: "de_DE-thorsten-high",
    });
    assert.equal(config.backend, "edge_tts");
    assert.equal(config.piperFallbackVoice, "de_DE-thorsten-high");
  });

  it("uses offline Piper voice for hybrid piper backend", () => {
    const config = resolveLocalTtsConfig({
      ...DEFAULT_SPEECH_SETTINGS,
      provider: "hybrid",
      hybridTtsBackend: "piper",
      hybridTtsVoice: "de-DE-KatjaNeural",
      offlineTtsVoice: "de_DE-kerstin-low",
    });
    assert.equal(config.backend, "piper");
    assert.equal(config.voice, "de_DE-kerstin-low");
  });
});
