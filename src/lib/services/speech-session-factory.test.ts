import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SPEECH_SETTINGS,
  normalizeSpeechProvider,
  speechProviderIsCloudRealtime,
  speechProviderRequiresGeminiApiKey,
  speechProviderRequiresXaiApiKey,
  speechProviderRequiresMistralApiKey,
  speechProviderRequiresCloudApiKey,
} from "../types/protocol.ts";
import { createActiveSpeechSession } from "./speech-session-factory.ts";
import { LocalSpeechSession } from "./local-speech-session.ts";
import { GeminiLiveSession } from "./gemini-live.ts";
import { GrokVoiceSession } from "./grok-voice.ts";
import { MistralVoiceSession } from "./mistral-voice-session.ts";

test("normalizeSpeechProvider fällt auf gemini_live zurück", () => {
  assert.equal(normalizeSpeechProvider("hybrid"), "hybrid");
  assert.equal(normalizeSpeechProvider("offline"), "offline");
  assert.equal(normalizeSpeechProvider("grok_voice"), "grok_voice");
  assert.equal(normalizeSpeechProvider("mistral_voice"), "mistral_voice");
  assert.equal(normalizeSpeechProvider("invalid"), "gemini_live");
});

test("mistral_voice braucht Mistral-Key, ist aber kein Cloud-Realtime-Duplex", () => {
  assert.equal(speechProviderRequiresMistralApiKey("mistral_voice"), true);
  assert.equal(speechProviderRequiresMistralApiKey("grok_voice"), false);
  assert.equal(speechProviderRequiresCloudApiKey("mistral_voice"), true);
  assert.equal(speechProviderIsCloudRealtime("mistral_voice"), false);
  assert.equal(speechProviderRequiresGeminiApiKey("mistral_voice"), false);
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

test("createActiveSpeechSession wählt Gemini, Grok, Mistral oder Local", () => {
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

  const mistral = createActiveSpeechSession(
    { ...DEFAULT_SPEECH_SETTINGS, provider: "mistral_voice" },
    {},
  );
  assert.ok(mistral instanceof MistralVoiceSession);

  const hybrid = createActiveSpeechSession({ ...DEFAULT_SPEECH_SETTINGS, provider: "hybrid" }, {});
  assert.ok(hybrid instanceof LocalSpeechSession);
});
