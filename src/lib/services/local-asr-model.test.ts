import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultLocalAsrModelForAppLocale,
  defaultLocalAsrModelForLanguage,
  prefersSenseVoiceForAppLocale,
  prefersSenseVoiceForAppLocaleCode,
} from "./local-asr-model";

describe("local-asr-model", () => {
  it("prefers Whisper for European app locales", () => {
    assert.equal(defaultLocalAsrModelForAppLocale("de"), "whisper_small_de");
    assert.equal(defaultLocalAsrModelForAppLocale("fr"), "whisper_small_de");
    assert.equal(defaultLocalAsrModelForAppLocale("en"), "whisper_small_de");
    assert.equal(prefersSenseVoiceForAppLocaleCode("de"), false);
  });

  it("prefers SenseVoice for Japanese and Chinese app locales", () => {
    assert.equal(defaultLocalAsrModelForAppLocale("ja"), "sense_voice_int8");
    assert.equal(defaultLocalAsrModelForAppLocale("zh"), "sense_voice_int8");
    assert.equal(prefersSenseVoiceForAppLocale("ja"), true);
    assert.equal(prefersSenseVoiceForAppLocale("zh"), true);
  });

  it("maps BCP47 speech language tags for hints", () => {
    assert.equal(defaultLocalAsrModelForLanguage("de-DE"), "whisper_small_de");
    assert.equal(defaultLocalAsrModelForLanguage("ja-JP"), "sense_voice_int8");
    assert.equal(defaultLocalAsrModelForLanguage("zh-CN"), "sense_voice_int8");
  });
});
