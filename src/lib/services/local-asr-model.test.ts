import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultLocalAsrModelForAppLocale,
  defaultLocalAsrModelForLanguage,
  krokoModelForAppLocale,
  prefersKrokoForAppLocale,
  prefersSenseVoiceForAppLocale,
  prefersSenseVoiceForAppLocaleCode,
} from "./local-asr-model";

describe("local-asr-model", () => {
  it("prefers the matching Kroko model for supported app locales", () => {
    assert.equal(defaultLocalAsrModelForAppLocale("de"), "kroko_de");
    assert.equal(defaultLocalAsrModelForAppLocale("en"), "kroko_en");
    assert.equal(defaultLocalAsrModelForAppLocale("fr"), "kroko_fr");
    assert.equal(defaultLocalAsrModelForAppLocale("it"), "kroko_it");
    assert.equal(prefersKrokoForAppLocale("de"), true);
    assert.equal(krokoModelForAppLocale("es"), "kroko_es");
  });

  it("falls back to Whisper for European locales without a Kroko model", () => {
    assert.equal(defaultLocalAsrModelForAppLocale("pl"), "whisper_small_de");
    assert.equal(defaultLocalAsrModelForAppLocale("nl"), "whisper_small_de");
    assert.equal(prefersKrokoForAppLocale("pl"), false);
    assert.equal(prefersSenseVoiceForAppLocaleCode("de"), false);
  });

  it("prefers SenseVoice for Japanese and Chinese app locales", () => {
    assert.equal(defaultLocalAsrModelForAppLocale("ja"), "sense_voice_int8");
    assert.equal(defaultLocalAsrModelForAppLocale("zh"), "sense_voice_int8");
    assert.equal(prefersSenseVoiceForAppLocale("ja"), true);
    assert.equal(prefersSenseVoiceForAppLocale("zh"), true);
    assert.equal(krokoModelForAppLocale("ja"), null);
  });

  it("maps BCP47 speech language tags for hints", () => {
    assert.equal(defaultLocalAsrModelForLanguage("de-DE"), "whisper_small_de");
    assert.equal(defaultLocalAsrModelForLanguage("ja-JP"), "sense_voice_int8");
    assert.equal(defaultLocalAsrModelForLanguage("zh-CN"), "sense_voice_int8");
  });
});
