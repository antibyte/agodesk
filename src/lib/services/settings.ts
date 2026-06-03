import { Store } from "@tauri-apps/plugin-store";
import type {
  AppSettings,
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
} from "../types/protocol";
import type { UiLocaleSetting } from "../i18n/locales";
import { normalizeLocaleSetting } from "../i18n/locales";
import { applyLocaleSetting } from "../i18n/store";
import { normalizeServerUrl } from "./server-url";
import { updateSettings } from "../stores/settings";
import { initThemeListener } from "./theme";
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
): SpeechSettings {
  if (!saved || typeof saved !== "object") {
    return { ...DEFAULT_SPEECH_SETTINGS };
  }

  const browserLanguage =
    typeof navigator !== "undefined" && navigator.language
      ? navigator.language
      : "de-DE";

  return {
    enabled:
      typeof saved.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_SPEECH_SETTINGS.enabled,
    modelId:
      typeof saved.modelId === "string" && saved.modelId.trim().length > 0
        ? saved.modelId.trim()
        : DEFAULT_SPEECH_SETTINGS.modelId,
    language:
      typeof saved.language === "string" && saved.language.trim().length > 0
        ? saved.language.trim()
        : browserLanguage,
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
  };
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

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    serverUrl,
    theme:
      theme === "light" || theme === "dark" || theme === "system"
        ? theme
        : DEFAULT_SETTINGS.theme,
    locale: normalizeLocaleSetting(
      (saved?.locale as UiLocaleSetting | undefined) ?? DEFAULT_SETTINGS.locale,
    ),
    speech: normalizeSpeechSettings(saved?.speech),
    uiSounds: normalizeUiSoundSettings(saved?.uiSounds),
    minimizeToTray:
      typeof saved?.minimizeToTray === "boolean"
        ? saved.minimizeToTray
        : DEFAULT_SETTINGS.minimizeToTray,
    desktopControlEnabled:
      typeof saved?.desktopControlEnabled === "boolean"
        ? saved.desktopControlEnabled
        : DEFAULT_SETTINGS.desktopControlEnabled,
    fileAccess: normalizeFileAccessSettings(saved?.fileAccess),
  };
}

async function applySettings(next: AppSettings): Promise<void> {
  const normalized = normalizeAppSettings(next);
  updateSettings(normalized);
  initThemeListener(normalized.theme);
  await applyLocaleSetting(normalized.locale);
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
