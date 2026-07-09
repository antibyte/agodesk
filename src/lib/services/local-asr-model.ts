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

/** App locales that ship a dedicated Kroko streaming model. */
const KROKO_MODEL_BY_LOCALE: Partial<Record<AppLocale, LocalAsrModel>> = {
  de: "kroko_de",
  en: "kroko_en",
  fr: "kroko_fr",
  es: "kroko_es",
  it: "kroko_it",
  pt: "kroko_pt",
};

/** Returns the Kroko model for an app locale, or null when none exists. */
export function krokoModelForAppLocale(locale: UiLocaleSetting): LocalAsrModel | null {
  return KROKO_MODEL_BY_LOCALE[resolveLocale(locale)] ?? null;
}

/** True when a Kroko model is the recommended default for the app locale. */
export function prefersKrokoForAppLocale(locale: UiLocaleSetting): boolean {
  return krokoModelForAppLocale(locale) !== null;
}

export function defaultLocalAsrModelForAppLocale(locale: UiLocaleSetting): LocalAsrModel {
  if (prefersSenseVoiceForAppLocale(locale)) {
    return "sense_voice_int8";
  }
  return krokoModelForAppLocale(locale) ?? "whisper_small_de";
}

/** @deprecated Use defaultLocalAsrModelForAppLocale for presets. */
export function defaultLocalAsrModelForLanguage(language: string): LocalAsrModel {
  return prefersSenseVoiceForLanguage(language) ? "sense_voice_int8" : "whisper_small_de";
}

/** Kroko Community models (streaming Zipformer, CC-BY-SA). */
export const KROKO_ASR_MODELS: readonly LocalAsrModel[] = [
  "kroko_de",
  "kroko_en",
  "kroko_fr",
  "kroko_es",
  "kroko_it",
  "kroko_pt",
  "kroko_tr",
] as const;

/** Legacy offline models (utterance-based). */
export const LEGACY_ASR_MODELS: readonly LocalAsrModel[] = [
  "whisper_small_de",
  "sense_voice_int8",
] as const;

export const LOCAL_ASR_MODEL_OPTIONS: readonly LocalAsrModel[] = [
  ...KROKO_ASR_MODELS,
  ...LEGACY_ASR_MODELS,
] as const;
