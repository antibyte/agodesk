import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SPEECH_SETTINGS,
  normalizeSpeechProvider,
  speechProviderIsCloudRealtime,
  speechProviderRequiresGeminiApiKey,
  speechProviderRequiresXaiApiKey,
} from "../types/protocol.ts";
import { createActiveSpeechSession } from "./speech-session-factory.ts";
import { LocalSpeechSession } from "./local-speech-session.ts";
import { GeminiLiveSession } from "./gemini-live.ts";
import { GrokVoiceSession } from "./grok-voice.ts";

test("normalizeSpeechProvider fällt auf gemini_live zurück", () => {
  assert.equal(normalizeSpeechProvider("hybrid"), "hybrid");
  assert.equal(normalizeSpeechProvider("offline"), "offline");
  assert.equal(normalizeSpeechProvider("grok_voice"), "grok_voice");
  assert.equal(normalizeSpeechProvider("invalid"), "gemini_live");
});

test("speechProviderRequiresGeminiApiKey nur für gemini_live", () => {
  assert.equal(speechProviderRequiresGeminiApiKey("gemini_live"), true);
  assert.equal(speechProviderRequiresGeminiApiKey("hybrid"), false);
  assert.equal(speechProviderRequiresGeminiApiKey("offline"), false);
  assert.equal(speechProviderRequiresGeminiApiKey("grok_voice"), false);
});

test("speechProviderRequiresXaiApiKey nur für grok_voice", () => {
  assert.equal(speechProviderRequiresXaiApiKey("grok_voice"), true);
  assert.equal(speechProviderRequiresXaiApiKey("gemini_live"), false);
  assert.equal(speechProviderIsCloudRealtime("gemini_live"), true);
  assert.equal(speechProviderIsCloudRealtime("grok_voice"), true);
  assert.equal(speechProviderIsCloudRealtime("hybrid"), false);
});

test("createActiveSpeechSession wählt Gemini, Grok oder Local", () => {
  const gemini = createActiveSpeechSession(
    { ...DEFAULT_SPEECH_SETTINGS, provider: "gemini_live" },
    {},
  );
  assert.ok(gemini instanceof GeminiLiveSession);

  const grok = createActiveSpeechSession(
    { ...DEFAULT_SPEECH_SETTINGS, provider: "grok_voice", modelId: "grok-voice-latest" },
    {},
  );
  assert.ok(grok instanceof GrokVoiceSession);

  const hybrid = createActiveSpeechSession({ ...DEFAULT_SPEECH_SETTINGS, provider: "hybrid" }, {});
  assert.ok(hybrid instanceof LocalSpeechSession);
});
