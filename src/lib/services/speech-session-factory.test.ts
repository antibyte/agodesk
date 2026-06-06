import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SPEECH_SETTINGS,
  normalizeSpeechProvider,
  speechProviderRequiresGeminiApiKey,
} from "../types/protocol.ts";
import { createActiveSpeechSession } from "./speech-session-factory.ts";
import { LocalSpeechSession } from "./local-speech-session.ts";
import { GeminiLiveSession } from "./gemini-live.ts";

test("normalizeSpeechProvider fällt auf gemini_live zurück", () => {
  assert.equal(normalizeSpeechProvider("hybrid"), "hybrid");
  assert.equal(normalizeSpeechProvider("offline"), "offline");
  assert.equal(normalizeSpeechProvider("invalid"), "gemini_live");
});

test("speechProviderRequiresGeminiApiKey nur für gemini_live", () => {
  assert.equal(speechProviderRequiresGeminiApiKey("gemini_live"), true);
  assert.equal(speechProviderRequiresGeminiApiKey("hybrid"), false);
  assert.equal(speechProviderRequiresGeminiApiKey("offline"), false);
});

test("createActiveSpeechSession wählt Gemini oder Local", () => {
  const gemini = createActiveSpeechSession(
    { ...DEFAULT_SPEECH_SETTINGS, provider: "gemini_live" },
    {},
  );
  assert.ok(gemini instanceof GeminiLiveSession);

  const hybrid = createActiveSpeechSession(
    { ...DEFAULT_SPEECH_SETTINGS, provider: "hybrid" },
    {},
  );
  assert.ok(hybrid instanceof LocalSpeechSession);
});
