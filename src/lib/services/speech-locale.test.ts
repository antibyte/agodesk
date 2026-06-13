import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applySpeechLocaleDefaults,
  defaultEdgeTtsVoiceForSpeechLanguage,
  edgeTtsVoicesForSpeechLanguage,
  localTtsTestPhraseForAppLocale,
  normalizeEdgeTtsVoiceForLanguage,
  normalizePiperVoiceForLanguage,
  piperVoicesForSpeechLanguage,
  speechLanguageForAppLocale,
} from "./speech-locale";
import { DEFAULT_SPEECH_SETTINGS } from "../types/protocol";

describe("speech-locale", () => {
  it("maps app locale to BCP47 speech language", () => {
    assert.equal(speechLanguageForAppLocale("de"), "de-DE");
    assert.equal(speechLanguageForAppLocale("en"), "en-US");
    assert.equal(speechLanguageForAppLocale("ja"), "ja-JP");
  });

  it("returns locale-specific edge voices with English fallback", () => {
    assert.ok(edgeTtsVoicesForSpeechLanguage("de-DE").includes("de-DE-KatjaNeural"));
    assert.ok(edgeTtsVoicesForSpeechLanguage("en-US").includes("en-US-JennyNeural"));
    assert.ok(edgeTtsVoicesForSpeechLanguage("pl-PL").includes("pl-PL-AgnieszkaNeural"));
    assert.ok(edgeTtsVoicesForSpeechLanguage("xx-YY").includes("en-US-JennyNeural"));
  });

  it("normalizes edge voice to locale or English fallback", () => {
    assert.equal(
      normalizeEdgeTtsVoiceForLanguage("de-DE-KatjaNeural", "en-US"),
      "en-US-JennyNeural",
    );
    assert.equal(
      normalizeEdgeTtsVoiceForLanguage("en-US-JennyNeural", "en-US"),
      "en-US-JennyNeural",
    );
  });

  it("normalizes piper voice to locale or English fallback", () => {
    assert.equal(
      normalizePiperVoiceForLanguage("de_DE-thorsten-high", "en-US"),
      "en_US-lessac-high",
    );
    assert.ok(piperVoicesForSpeechLanguage("de-DE").includes("de_DE-thorsten-high"));
  });

  it("provides localized TTS test phrase", () => {
    assert.equal(localTtsTestPhraseForAppLocale("de"), "Dies ist ein Test der Sprachausgabe.");
    assert.equal(localTtsTestPhraseForAppLocale("en"), "This is a speech output test.");
  });

  it("applySpeechLocaleDefaults updates language and voices", () => {
    const updated = applySpeechLocaleDefaults(
      {
        ...DEFAULT_SPEECH_SETTINGS,
        language: "de-DE",
        hybridTtsVoice: "de-DE-KatjaNeural",
        offlineTtsVoice: "de_DE-thorsten-high",
      },
      "en",
    );
    assert.equal(updated.language, "en-US");
    assert.equal(updated.hybridTtsVoice, "en-US-JennyNeural");
    assert.equal(updated.offlineTtsVoice, "en_US-lessac-high");
    assert.equal(defaultEdgeTtsVoiceForSpeechLanguage("fr-FR"), "fr-FR-DeniseNeural");
  });
});
