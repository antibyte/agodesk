import type { LocalAsrModel } from "../types/protocol";
import type { AppLocale, UiLocaleSetting } from "../i18n/locales";
import { resolveLocale } from "../i18n/locales";

/** Japanese and Chinese app locales use SenseVoice; others use Whisper. */
export function prefersSenseVoiceForAppLocale(locale: UiLocaleSetting): boolean {
  const resolved = resolveLocale(locale);
  return prefersSenseVoiceForAppLocaleCode(resolved);
}

export function prefersSenseVoiceForAppLocaleCode(locale: AppLocale): boolean {
  return locale === "ja" || locale === "zh";
}

/** @deprecated Use prefersSenseVoiceForAppLocale; kept for BCP47 speech.language hints. */
export function prefersSenseVoiceForLanguage(language: string): boolean {
  const lower = language.trim().toLowerCase();
  return lower.startsWith("ja") || lower.startsWith("zh");
}

export function defaultLocalAsrModelForAppLocale(locale: UiLocaleSetting): LocalAsrModel {
  return prefersSenseVoiceForAppLocale(locale) ? "sense_voice_int8" : "whisper_small_de";
}

/** @deprecated Use defaultLocalAsrModelForAppLocale for presets. */
export function defaultLocalAsrModelForLanguage(language: string): LocalAsrModel {
  return prefersSenseVoiceForLanguage(language) ? "sense_voice_int8" : "whisper_small_de";
}

export const LOCAL_ASR_MODEL_OPTIONS: readonly LocalAsrModel[] = [
  "whisper_small_de",
  "sense_voice_int8",
] as const;
