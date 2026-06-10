import type { SpeechSettings } from "../types/protocol";
import type { AppLocale, UiLocaleSetting } from "../i18n/locales";
import { localeToBcp47, resolveLocale } from "../i18n/locales";

const FALLBACK_BCP47 = "en-US";
const FALLBACK_VOICE_PREFIX = "en";

/** BCP47 speech language for ASR/TTS from the app locale setting. */
export function speechLanguageForAppLocale(locale: UiLocaleSetting): string {
  return localeToBcp47(resolveLocale(locale));
}

const EDGE_TTS_VOICES_BY_PREFIX: Record<string, readonly string[]> = {
  de: [
    "de-DE-KatjaNeural",
    "de-DE-ConradNeural",
    "de-DE-AmalaNeural",
    "de-DE-FlorianMultilingualNeural",
  ],
  en: [
    "en-US-JennyNeural",
    "en-US-GuyNeural",
    "en-US-AriaNeural",
    "en-US-AndrewMultilingualNeural",
    "en-GB-SoniaNeural",
    "en-GB-RyanNeural",
  ],
  fr: ["fr-FR-DeniseNeural", "fr-FR-HenriNeural"],
  es: ["es-ES-ElviraNeural", "es-ES-AlvaroNeural"],
  zh: ["zh-CN-XiaoxiaoNeural", "zh-CN-YunxiNeural"],
  ja: ["ja-JP-NanamiNeural", "ja-JP-KeitaNeural"],
  nl: ["nl-NL-MaartenNeural", "nl-NL-ColetteNeural"],
  pt: ["pt-PT-RaquelNeural", "pt-PT-DuarteNeural"],
  pl: ["pl-PL-AgnieszkaNeural", "pl-PL-MarekNeural"],
  cs: ["cs-CZ-VlastaNeural", "cs-CZ-AntoninNeural"],
  it: ["it-IT-ElsaNeural", "it-IT-DiegoNeural"],
  sv: ["sv-SE-SofieNeural", "sv-SE-MattiasNeural"],
  no: ["nb-NO-PernilleNeural", "nb-NO-FinnNeural"],
  da: ["da-DK-ChristelNeural", "da-DK-JeppeNeural"],
  el: ["el-GR-AthinaNeural", "el-GR-NestorasNeural"],
  hi: ["hi-IN-SwaraNeural", "hi-IN-MadhurNeural"],
};

const PIPER_VOICES_BY_PREFIX: Record<string, readonly string[]> = {
  de: ["de_DE-thorsten-high", "de_DE-thorsten-low", "de_DE-kerstin-low"],
  en: ["en_US-lessac-high", "en_US-lessac-medium"],
};

const LOCAL_TTS_TEST_PHRASES: Record<AppLocale, string> = {
  de: "Dies ist ein Test der Sprachausgabe.",
  en: "This is a speech output test.",
  fr: "Ceci est un test de la synthèse vocale.",
  es: "Esta es una prueba de la salida de voz.",
  zh: "这是语音输出测试。",
  ja: "これは音声出力のテストです。",
  nl: "Dit is een test van de spraakuitvoer.",
  pt: "Este é um teste da saída de voz.",
  pl: "To jest test syntezy mowy.",
  cs: "Toto je test hlasového výstupu.",
  it: "Questo è un test dell'output vocale.",
  sv: "Det här är ett test av röstutmatningen.",
  no: "Dette er en test av taleutgangen.",
  da: "Dette er en test af taleoutput.",
  el: "Αυτή είναι μια δοκιμή φωνητικής εξόδου.",
  hi: "यह भाषण आउटपुट का परीक्षण है।",
};

function languagePrefix(language: string): string {
  const normalized = language.trim().toLowerCase().replace("_", "-");
  const base = normalized.split("-")[0] ?? normalized;
  if (base === "nb" || base === "nn") {
    return "no";
  }
  return base;
}

function voiceLanguagePrefix(voiceId: string): string {
  const normalized = voiceId.trim().toLowerCase().replace("_", "-");
  const parts = normalized.split("-");
  if (parts.length >= 2 && parts[1]?.length === 2) {
    return parts[0] ?? FALLBACK_VOICE_PREFIX;
  }
  return parts[0] ?? FALLBACK_VOICE_PREFIX;
}

export function edgeTtsVoicesForSpeechLanguage(language: string): readonly string[] {
  const prefix = languagePrefix(language);
  return EDGE_TTS_VOICES_BY_PREFIX[prefix] ?? EDGE_TTS_VOICES_BY_PREFIX[FALLBACK_VOICE_PREFIX] ?? [];
}

export function defaultEdgeTtsVoiceForSpeechLanguage(language: string): string {
  const voices = edgeTtsVoicesForSpeechLanguage(language);
  return voices[0] ?? "en-US-JennyNeural";
}

export function normalizeEdgeTtsVoiceForLanguage(voice: string, language: string): string {
  const trimmed = voice.trim();
  const options = edgeTtsVoicesForSpeechLanguage(language);
  if (trimmed && options.includes(trimmed)) {
    return trimmed;
  }
  if (trimmed && voiceLanguagePrefix(trimmed) === languagePrefix(language)) {
    return trimmed;
  }
  return defaultEdgeTtsVoiceForSpeechLanguage(language);
}

export function piperVoicesForSpeechLanguage(language: string): readonly string[] {
  const prefix = languagePrefix(language);
  return PIPER_VOICES_BY_PREFIX[prefix] ?? PIPER_VOICES_BY_PREFIX[FALLBACK_VOICE_PREFIX] ?? [];
}

export function defaultPiperVoiceForSpeechLanguage(language: string): string {
  const voices = piperVoicesForSpeechLanguage(language);
  return voices[0] ?? "en_US-lessac-high";
}

export function normalizePiperVoiceForLanguage(voice: string, language: string): string {
  const trimmed = voice.trim();
  const options = piperVoicesForSpeechLanguage(language);
  if (trimmed && options.includes(trimmed)) {
    return trimmed;
  }
  if (trimmed && voiceLanguagePrefix(trimmed) === languagePrefix(language)) {
    return trimmed;
  }
  return defaultPiperVoiceForSpeechLanguage(language);
}

export function localTtsTestPhraseForAppLocale(locale: UiLocaleSetting): string {
  const resolved = resolveLocale(locale);
  return LOCAL_TTS_TEST_PHRASES[resolved] ?? LOCAL_TTS_TEST_PHRASES.en;
}

/** Apply app-locale defaults to speech fields (language + voices). */
export function applySpeechLocaleDefaults(
  speech: SpeechSettings,
  appLocale: UiLocaleSetting,
): SpeechSettings {
  const language = speechLanguageForAppLocale(appLocale);
  return {
    ...speech,
    language,
    hybridTtsVoice: normalizeEdgeTtsVoiceForLanguage(speech.hybridTtsVoice, language),
    offlineTtsVoice: normalizePiperVoiceForLanguage(speech.offlineTtsVoice, language),
  };
}

export { FALLBACK_BCP47 };
