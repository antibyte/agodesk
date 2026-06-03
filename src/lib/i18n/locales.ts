export const APP_LOCALES = [
  "de",
  "en",
  "fr",
  "es",
  "zh",
  "ja",
  "nl",
  "pt",
  "pl",
  "cs",
  "it",
  "sv",
  "no",
  "da",
  "el",
  "hi",
] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export type UiLocaleSetting = AppLocale | "system";

/** Native language names for the locale picker (not translated). */
export const LOCALE_LABELS: Record<AppLocale, string> = {
  de: "Deutsch",
  en: "English",
  fr: "Français",
  es: "Español",
  zh: "中文",
  ja: "日本語",
  nl: "Nederlands",
  pt: "Português",
  pl: "Polski",
  cs: "Čeština",
  it: "Italiano",
  sv: "Svenska",
  no: "Norsk",
  da: "Dansk",
  el: "Ελληνικά",
  hi: "हिन्दी",
};

export const LOCALE_BCP47: Record<AppLocale, string> = {
  de: "de-DE",
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  zh: "zh-CN",
  ja: "ja-JP",
  nl: "nl-NL",
  pt: "pt-PT",
  pl: "pl-PL",
  cs: "cs-CZ",
  it: "it-IT",
  sv: "sv-SE",
  no: "nb-NO",
  da: "da-DK",
  el: "el-GR",
  hi: "hi-IN",
};

const FALLBACK_LOCALE: AppLocale = "en";

export function normalizeLocaleSetting(value: unknown): UiLocaleSetting {
  if (value === "system") {
    return "system";
  }
  if (typeof value === "string" && (APP_LOCALES as readonly string[]).includes(value)) {
    return value as AppLocale;
  }
  return "system";
}

function normalizeLanguageTag(tag: string): AppLocale | null {
  const lower = tag.toLowerCase().replace("_", "-");
  const base = lower.split("-")[0] ?? lower;
  if ((APP_LOCALES as readonly string[]).includes(base)) {
    return base as AppLocale;
  }
  if (base === "nb" || base === "nn") {
    return "no";
  }
  return null;
}

export function resolveLocale(setting: UiLocaleSetting): AppLocale {
  if (setting !== "system") {
    return setting;
  }

  if (typeof navigator !== "undefined") {
    for (const tag of navigator.languages ?? [navigator.language]) {
      if (!tag) {
        continue;
      }
      const match = normalizeLanguageTag(tag);
      if (match) {
        return match;
      }
    }
  }

  return FALLBACK_LOCALE;
}

export function localeToBcp47(locale: AppLocale): string {
  return LOCALE_BCP47[locale];
}
