import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MISTRAL_ASR_MODEL,
  DEFAULT_MISTRAL_TTS_MODEL,
  DEFAULT_SPEECH_SETTINGS,
  isMistralSpeechProvider,
} from "../types/protocol.ts";
import { normalizeAppSettings } from "./settings.ts";
import { shouldUseMistralTtsForChat } from "./mistral-tts.ts";

test("isMistralSpeechProvider erkennt nur mistral_voice", () => {
  assert.equal(isMistralSpeechProvider("mistral_voice"), true);
  assert.equal(isMistralSpeechProvider("grok_voice"), false);
  assert.equal(isMistralSpeechProvider("hybrid"), false);
});

test("Mistral-Defaults sind in DEFAULT_SPEECH_SETTINGS gesetzt", () => {
  assert.equal(DEFAULT_SPEECH_SETTINGS.mistralAsrModel, DEFAULT_MISTRAL_ASR_MODEL);
  assert.equal(DEFAULT_SPEECH_SETTINGS.mistralTtsModel, DEFAULT_MISTRAL_TTS_MODEL);
  assert.equal(DEFAULT_SPEECH_SETTINGS.mistralVoiceId, "");
});

test("normalizeAppSettings füllt Mistral-Defaults und behält Custom-Werte", () => {
  const withDefaults = normalizeAppSettings({ speech: { provider: "mistral_voice" } });
  assert.equal(withDefaults.speech.provider, "mistral_voice");
  assert.equal(withDefaults.speech.mistralAsrModel, DEFAULT_MISTRAL_ASR_MODEL);
  assert.equal(withDefaults.speech.mistralTtsModel, DEFAULT_MISTRAL_TTS_MODEL);
  assert.equal(withDefaults.speech.mistralVoiceId, "");

  const custom = normalizeAppSettings({
    speech: {
      provider: "mistral_voice",
      mistralAsrModel: "voxtral-mini-transcribe-realtime-2602",
      mistralTtsModel: "voxtral-mini-tts-2603",
      mistralVoiceId: "  my-voice  ",
    },
  });
  assert.equal(custom.speech.mistralAsrModel, "voxtral-mini-transcribe-realtime-2602");
  assert.equal(custom.speech.mistralVoiceId, "my-voice");
});

test("normalizeAppSettings fills Phase-2 realtime defaults", () => {
  const normalized = normalizeAppSettings({ speech: { provider: "mistral_voice" } });
  assert.equal(normalized.speech.mistralRealtimeEnabled, true);
  assert.equal(normalized.speech.mistralRealtimeAsrModel, "voxtral-mini-transcribe-realtime-2602");
  assert.equal(normalized.speech.mistralTargetStreamingDelayMs, 480);
});

test("normalizeAppSettings respects mistralRealtimeEnabled false", () => {
  const normalized = normalizeAppSettings({
    speech: { provider: "mistral_voice", mistralRealtimeEnabled: false },
  });
  assert.equal(normalized.speech.mistralRealtimeEnabled, false);
});

test("shouldUseMistralTtsForChat respektiert Provider und Mute-Flags", () => {
  const base = { ...DEFAULT_SPEECH_SETTINGS, provider: "mistral_voice" as const };
  assert.equal(shouldUseMistralTtsForChat(base), true);
  assert.equal(shouldUseMistralTtsForChat({ ...base, voiceResponses: false }), false);
  assert.equal(shouldUseMistralTtsForChat(base, { chatTtsOff: true }), false);
  assert.equal(shouldUseMistralTtsForChat(base, { speakerMuted: true }), false);
  assert.equal(
    shouldUseMistralTtsForChat({ ...DEFAULT_SPEECH_SETTINGS, provider: "grok_voice" }),
    false,
  );
});
