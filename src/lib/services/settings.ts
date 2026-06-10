import { Store } from "@tauri-apps/plugin-store";
import type {
  AppSettings,
  ChatTtsMode,
  FileAccessRoot,
  FileAccessSettings,
  SpeechSettings,
  UiSoundSettings,
  UiSoundTheme,
} from "../types/protocol";
import {
  DEFAULT_FILE_ACCESS_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_SPEECH_SETTINGS,
  DEFAULT_UI_SOUND_SETTINGS,
  UI_SOUND_THEMES,
  normalizeSpeechProvider,
} from "../types/protocol";
import type { UiLocaleSetting } from "../i18n/locales";
import { normalizeLocaleSetting } from "../i18n/locales";
import { applyLocaleSetting } from "../i18n/store";
import { syncFileSearchRoots } from "./file-search-sync";
import { normalizeServerUrl } from "./server-url";
import { updateSettings } from "../stores/settings";
import { initThemeListener } from "./theme";
import { normalizeShowWindowHotkey } from "./show-window-hotkey";
import { defaultLocalAsrModelForAppLocale } from "./local-asr-model";
import {
  applySpeechLocaleDefaults,
  defaultEdgeTtsVoiceForSpeechLanguage,
  defaultPiperVoiceForSpeechLanguage,
  normalizeEdgeTtsVoiceForLanguage,
  normalizePiperVoiceForLanguage,
  speechLanguageForAppLocale,
} from "./speech-locale";
import { buildPathDisplay } from "./file-access";

const STORE_PATH = "settings.json";
const SETTINGS_KEY = "app_settings";

let store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load(STORE_PATH);
  }
  return store;
}

export function normalizeUiSoundSettings(
  saved: Partial<UiSoundSettings> | null | undefined,
): UiSoundSettings {
  if (!saved || typeof saved !== "object") {
    return { ...DEFAULT_UI_SOUND_SETTINGS };
  }

  const theme = saved.theme;
  const volumeRaw = saved.volume;

  return {
    enabled:
      typeof saved.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_UI_SOUND_SETTINGS.enabled,
    theme:
      typeof theme === "string" && UI_SOUND_THEMES.includes(theme as UiSoundTheme)
        ? (theme as UiSoundTheme)
        : DEFAULT_UI_SOUND_SETTINGS.theme,
    volume:
      typeof volumeRaw === "number" && Number.isFinite(volumeRaw)
        ? Math.min(1, Math.max(0, volumeRaw))
        : DEFAULT_UI_SOUND_SETTINGS.volume,
  };
}

function normalizeSpeechSettings(
  saved: Partial<SpeechSettings> | null | undefined,
  appLocale: UiLocaleSetting,
): SpeechSettings {
  const defaultAsrModel = defaultLocalAsrModelForAppLocale(appLocale);

  if (!saved || typeof saved !== "object") {
    return applySpeechLocaleDefaults(
      {
        ...DEFAULT_SPEECH_SETTINGS,
        localAsrModel: defaultAsrModel,
      },
      appLocale,
    );
  }

  const defaultLanguage = speechLanguageForAppLocale(appLocale);

  const provider = normalizeSpeechProvider(saved.provider);
  const language =
    typeof saved.language === "string" && saved.language.trim().length > 0
      ? saved.language.trim()
      : defaultLanguage;

  const normalized: SpeechSettings = {
    enabled:
      typeof saved.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_SPEECH_SETTINGS.enabled,
    provider,
    modelId:
      typeof saved.modelId === "string" && saved.modelId.trim().length > 0
        ? saved.modelId.trim()
        : DEFAULT_SPEECH_SETTINGS.modelId,
    language,
    autoSendToAuraGo:
      typeof saved.autoSendToAuraGo === "boolean"
        ? saved.autoSendToAuraGo
        : DEFAULT_SPEECH_SETTINGS.autoSendToAuraGo,
    agentMode:
      typeof saved.agentMode === "boolean"
        ? saved.agentMode
        : DEFAULT_SPEECH_SETTINGS.agentMode,
    voiceResponses:
      typeof saved.voiceResponses === "boolean"
        ? saved.voiceResponses
        : DEFAULT_SPEECH_SETTINGS.voiceResponses,
    voiceName:
      typeof saved.voiceName === "string" && saved.voiceName.trim().length > 0
        ? saved.voiceName.trim()
        : DEFAULT_SPEECH_SETTINGS.voiceName,
    localAsrModel: (() => {
      const model = saved.localAsrModel as string | undefined;
      if (model === "whisper_small_de" || model === "sense_voice_int8") {
        return model;
      }
      return defaultAsrModel;
    })(),
    hybridTtsBackend:
      saved.hybridTtsBackend === "azure"
        || saved.hybridTtsBackend === "edge_tts"
        || saved.hybridTtsBackend === "piper"
        ? saved.hybridTtsBackend
        : DEFAULT_SPEECH_SETTINGS.hybridTtsBackend,
    hybridTtsVoice:
      typeof saved.hybridTtsVoice === "string" && saved.hybridTtsVoice.trim().length > 0
        ? normalizeEdgeTtsVoiceForLanguage(saved.hybridTtsVoice.trim(), language)
        : defaultEdgeTtsVoiceForSpeechLanguage(defaultLanguage),
    offlineTtsVoice:
      typeof saved.offlineTtsVoice === "string" && saved.offlineTtsVoice.trim().length > 0
        ? normalizePiperVoiceForLanguage(saved.offlineTtsVoice.trim(), language)
        : defaultPiperVoiceForSpeechLanguage(defaultLanguage),
    bargeInMode:
      saved.bargeInMode === "energy" || saved.bargeInMode === "silero" || saved.bargeInMode === "auto"
        ? saved.bargeInMode
        : DEFAULT_SPEECH_SETTINGS.bargeInMode,
  };

  const languageExplicit =
    typeof saved.language === "string" && saved.language.trim().length > 0;
  if (languageExplicit) {
    return normalized;
  }

  return applySpeechLocaleDefaults(normalized, appLocale);
}

function normalizeFileAccessRoot(raw: Partial<FileAccessRoot>): FileAccessRoot {
  const canonicalPath =
    typeof raw.canonicalPath === "string" ? raw.canonicalPath.trim() : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  return {
    rootId:
      typeof raw.rootId === "string" && raw.rootId.trim().length > 0
        ? raw.rootId.trim()
        : crypto.randomUUID(),
    label: label || canonicalPath || "Ordner",
    canonicalPath,
    pathDisplay:
      typeof raw.pathDisplay === "string" && raw.pathDisplay.trim().length > 0
        ? raw.pathDisplay.trim()
        : buildPathDisplay(canonicalPath),
    readEnabled: raw.readEnabled === true,
    writeEnabled: raw.writeEnabled === true,
  };
}

function normalizeFileAccessSettings(
  saved: Partial<FileAccessSettings> | null | undefined,
): FileAccessSettings {
  if (!saved || typeof saved !== "object") {
    return { ...DEFAULT_FILE_ACCESS_SETTINGS };
  }

  const roots = Array.isArray(saved.roots)
    ? saved.roots
        .filter((root) => !!root && typeof root === "object")
        .map((root) => normalizeFileAccessRoot(root as Partial<FileAccessRoot>))
    : [];

  const maxRead =
    typeof saved.maxReadBytes === "number" && saved.maxReadBytes > 0
      ? saved.maxReadBytes
      : DEFAULT_FILE_ACCESS_SETTINGS.maxReadBytes;
  const maxWrite =
    typeof saved.maxWriteBytes === "number" && saved.maxWriteBytes > 0
      ? saved.maxWriteBytes
      : DEFAULT_FILE_ACCESS_SETTINGS.maxWriteBytes;

  return {
    enabled:
      typeof saved.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_FILE_ACCESS_SETTINGS.enabled,
    maxReadBytes: maxRead,
    maxWriteBytes: maxWrite,
    roots,
  };
}

export function normalizeAppSettings(
  saved: Partial<AppSettings> | null | undefined,
): AppSettings {
  const theme = saved?.theme;
  const serverUrl = normalizeServerUrl(saved?.serverUrl ?? DEFAULT_SETTINGS.serverUrl);

  const locale = normalizeLocaleSetting(
    (saved?.locale as UiLocaleSetting | undefined) ?? DEFAULT_SETTINGS.locale,
  );

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    serverUrl,
    theme:
      theme === "light" || theme === "dark" || theme === "system"
        ? theme
        : DEFAULT_SETTINGS.theme,
    locale,
    speech: normalizeSpeechSettings(saved?.speech, locale),
    uiSounds: normalizeUiSoundSettings(saved?.uiSounds),
    minimizeToTray:
      typeof saved?.minimizeToTray === "boolean"
        ? saved.minimizeToTray
        : DEFAULT_SETTINGS.minimizeToTray,
    showWindowHotkey: normalizeShowWindowHotkey(saved?.showWindowHotkey),
    desktopControlEnabled:
      typeof saved?.desktopControlEnabled === "boolean"
        ? saved.desktopControlEnabled
        : DEFAULT_SETTINGS.desktopControlEnabled,
    browserControlEnabled:
      typeof saved?.browserControlEnabled === "boolean"
        ? saved.browserControlEnabled
        : DEFAULT_SETTINGS.browserControlEnabled,
    fileAccess: normalizeFileAccessSettings(saved?.fileAccess),
    chatTtsMode: normalizeChatTtsMode(saved?.chatTtsMode),
    chatSpeakerMode:
      typeof saved?.chatSpeakerMode === "boolean"
        ? saved.chatSpeakerMode
        : DEFAULT_SETTINGS.chatSpeakerMode,
  };
}

function normalizeChatTtsMode(value: unknown): ChatTtsMode {
  if (
    value === "auto" ||
    value === "aurago" ||
    value === "frontend" ||
    value === "off"
  ) {
    return value;
  }
  return DEFAULT_SETTINGS.chatTtsMode;
}

async function applySettings(next: AppSettings): Promise<void> {
  const normalized = normalizeAppSettings(next);
  updateSettings(normalized);
  initThemeListener(normalized.theme);
  await applyLocaleSetting(normalized.locale);
  void syncFileSearchRoots(normalized.fileAccess).catch((error) => {
    console.warn("[agodesk:file-search] index sync failed", error);
  });
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const loaded = await getStore();
    const saved = await loaded.get<Partial<AppSettings>>(SETTINGS_KEY);
    const merged = normalizeAppSettings(saved);
    await applySettings(merged);
    return merged;
  } catch {
    const fallback = normalizeAppSettings(DEFAULT_SETTINGS);
    await applySettings(fallback);
    return fallback;
  }
}

export async function saveSettings(next: AppSettings): Promise<void> {
  const normalized = normalizeAppSettings(next);
  await applySettings(normalized);

  try {
    const loaded = await getStore();
    await loaded.set(SETTINGS_KEY, normalized);
    await loaded.save();
  } catch {
    // Theme/Locale sind bereits angewendet, auch wenn Persistenz fehlschlägt
  }
}
