import { Store } from "@tauri-apps/plugin-store";
import type {
  AppSettings,
  ChatTtsMode,
  FileAccessRoot,
  FileAccessSettings,
  LocalAgentSettings,
  LocalAgentProviderSource,
  LocalAsrModel,
  OpenPetsSettings,
  ShellAccessCwd,
  ShellAccessSettings,
  ShellKind,
  SpeechSettings,
  UiSoundSettings,
  UiSoundTheme,
} from "../types/protocol";
import {
  DEFAULT_FILE_ACCESS_SETTINGS,
  DEFAULT_LOCAL_AGENT_SETTINGS,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OPENPETS_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_SHELL_ACCESS_SETTINGS,
  DEFAULT_SPEECH_SETTINGS,
  DEFAULT_UI_SOUND_SETTINGS,
  UI_SOUND_THEMES,
  normalizePageAgentStartUrl,
  normalizeSpeechProvider,
  normalizeUiTheme,
} from "../types/protocol";
import type { UiLocaleSetting } from "../i18n/locales";
import { normalizeLocaleSetting } from "../i18n/locales";
import { applyLocaleSetting } from "../i18n/store";
import { syncFileSearchRoots } from "./file-search-sync";
import { normalizeServerUrl } from "./server-url";
import { updateSettings } from "../stores/settings";
import { applyUiTheme, initThemeListener } from "./theme";
import { normalizeShowWindowHotkey } from "./show-window-hotkey";
import { normalizeSpeechHotkey } from "./speech-hotkey";
import { resolveOnboardingInSettings, clearLegacyOnboardingFlag } from "./onboarding";
import { get } from "svelte/store";
import { settings } from "../stores/settings";
import { defaultLocalAsrModelForAppLocale, LOCAL_ASR_MODEL_OPTIONS } from "./local-asr-model";
import {
  applySpeechLocaleDefaults,
  defaultEdgeTtsVoiceForSpeechLanguage,
  defaultPiperVoiceForSpeechLanguage,
  normalizeEdgeTtsVoiceForLanguage,
  normalizePiperVoiceForLanguage,
  normalizeSupertonicVoice,
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
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : DEFAULT_UI_SOUND_SETTINGS.enabled,
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
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : DEFAULT_SPEECH_SETTINGS.enabled,
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
      typeof saved.agentMode === "boolean" ? saved.agentMode : DEFAULT_SPEECH_SETTINGS.agentMode,
    voiceResponses:
      typeof saved.voiceResponses === "boolean"
        ? saved.voiceResponses
        : DEFAULT_SPEECH_SETTINGS.voiceResponses,
    voiceName:
      typeof saved.voiceName === "string" && saved.voiceName.trim().length > 0
        ? saved.voiceName.trim()
        : DEFAULT_SPEECH_SETTINGS.voiceName,
    localAsrModel: (() => {
      const model =
        typeof saved.localAsrModel === "string" ? (saved.localAsrModel as string) : undefined;
      if (model === "omnilingual_ctc_int8") {
        return "sense_voice_int8";
      }
      const options = LOCAL_ASR_MODEL_OPTIONS as readonly string[];
      if (model && options.includes(model)) {
        return model as LocalAsrModel;
      }
      return defaultAsrModel;
    })(),
    hybridTtsBackend:
      saved.hybridTtsBackend === "azure" ||
      saved.hybridTtsBackend === "edge_tts" ||
      saved.hybridTtsBackend === "piper" ||
      saved.hybridTtsBackend === "supertonic"
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
    offlineTtsBackend:
      saved.offlineTtsBackend === "piper" || saved.offlineTtsBackend === "supertonic"
        ? saved.offlineTtsBackend
        : DEFAULT_SPEECH_SETTINGS.offlineTtsBackend,
    supertonicVoice:
      typeof saved.supertonicVoice === "string" && saved.supertonicVoice.trim().length > 0
        ? normalizeSupertonicVoice(saved.supertonicVoice.trim())
        : DEFAULT_SPEECH_SETTINGS.supertonicVoice,
    mistralAsrModel:
      typeof saved.mistralAsrModel === "string" && saved.mistralAsrModel.trim().length > 0
        ? saved.mistralAsrModel.trim()
        : DEFAULT_SPEECH_SETTINGS.mistralAsrModel,
    mistralTtsModel:
      typeof saved.mistralTtsModel === "string" && saved.mistralTtsModel.trim().length > 0
        ? saved.mistralTtsModel.trim()
        : DEFAULT_SPEECH_SETTINGS.mistralTtsModel,
    mistralVoiceId:
      typeof saved.mistralVoiceId === "string"
        ? saved.mistralVoiceId.trim()
        : DEFAULT_SPEECH_SETTINGS.mistralVoiceId,
    mistralRealtimeEnabled:
      typeof saved.mistralRealtimeEnabled === "boolean"
        ? saved.mistralRealtimeEnabled
        : DEFAULT_SPEECH_SETTINGS.mistralRealtimeEnabled,
    mistralRealtimeAsrModel:
      typeof saved.mistralRealtimeAsrModel === "string" &&
      saved.mistralRealtimeAsrModel.trim().length > 0
        ? saved.mistralRealtimeAsrModel.trim()
        : DEFAULT_SPEECH_SETTINGS.mistralRealtimeAsrModel,
    mistralTargetStreamingDelayMs: (() => {
      const raw = saved.mistralTargetStreamingDelayMs;
      if (typeof raw === "number" && Number.isFinite(raw) && raw >= 120 && raw <= 2400) {
        return Math.round(raw);
      }
      return DEFAULT_SPEECH_SETTINGS.mistralTargetStreamingDelayMs;
    })(),
    bargeInMode:
      saved.bargeInMode === "energy" ||
      saved.bargeInMode === "silero" ||
      saved.bargeInMode === "auto"
        ? saved.bargeInMode
        : DEFAULT_SPEECH_SETTINGS.bargeInMode,
  };

  const languageExplicit = typeof saved.language === "string" && saved.language.trim().length > 0;
  if (languageExplicit) {
    return normalized;
  }

  return applySpeechLocaleDefaults(normalized, appLocale);
}

function normalizeFileAccessRoot(raw: Partial<FileAccessRoot>): FileAccessRoot {
  const canonicalPath = typeof raw.canonicalPath === "string" ? raw.canonicalPath.trim() : "";
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
      typeof saved.enabled === "boolean" ? saved.enabled : DEFAULT_FILE_ACCESS_SETTINGS.enabled,
    maxReadBytes: maxRead,
    maxWriteBytes: maxWrite,
    roots,
  };
}

const SHELL_KINDS: ShellKind[] = ["powershell", "cmd", "sh", "bash", "zsh"];

function defaultShellPlatformSettings(): Pick<ShellAccessSettings, "shells" | "selectedShell"> {
  if (typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent)) {
    return { shells: ["powershell", "cmd"], selectedShell: "powershell" };
  }
  return { shells: ["sh", "bash", "zsh"], selectedShell: "sh" };
}

function normalizeShellAccessCwd(raw: Partial<ShellAccessCwd>): ShellAccessCwd | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const canonicalPath = typeof raw.canonicalPath === "string" ? raw.canonicalPath.trim() : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const cwdId = typeof raw.cwdId === "string" ? raw.cwdId.trim() : "";
  if (!canonicalPath || !label || !cwdId) {
    return null;
  }
  const pathDisplay =
    typeof raw.pathDisplay === "string" && raw.pathDisplay.trim()
      ? raw.pathDisplay.trim()
      : buildPathDisplay(canonicalPath);
  return { cwdId, label, canonicalPath, pathDisplay };
}

export function normalizeShellAccessSettings(
  saved: Partial<ShellAccessSettings> | null | undefined,
): ShellAccessSettings {
  const platformDefaults = defaultShellPlatformSettings();
  if (!saved || typeof saved !== "object") {
    return { ...DEFAULT_SHELL_ACCESS_SETTINGS, ...platformDefaults };
  }

  const allowedCwds = Array.isArray(saved.allowedCwds)
    ? saved.allowedCwds
        .map((cwd) => normalizeShellAccessCwd(cwd as Partial<ShellAccessCwd>))
        .filter((cwd): cwd is ShellAccessCwd => cwd !== null)
    : [];

  const shells = Array.isArray(saved.shells)
    ? saved.shells.filter((shell): shell is ShellKind => SHELL_KINDS.includes(shell as ShellKind))
    : platformDefaults.shells;
  const selectedShell =
    typeof saved.selectedShell === "string" && SHELL_KINDS.includes(saved.selectedShell)
      ? saved.selectedShell
      : shells.includes(platformDefaults.selectedShell)
        ? platformDefaults.selectedShell
        : (shells[0] ?? platformDefaults.selectedShell);

  const maxCommandChars =
    typeof saved.maxCommandChars === "number" && saved.maxCommandChars > 0
      ? saved.maxCommandChars
      : DEFAULT_SHELL_ACCESS_SETTINGS.maxCommandChars;
  const maxOutputBytes =
    typeof saved.maxOutputBytes === "number" && saved.maxOutputBytes > 0
      ? saved.maxOutputBytes
      : DEFAULT_SHELL_ACCESS_SETTINGS.maxOutputBytes;
  const defaultTimeoutMs =
    typeof saved.defaultTimeoutMs === "number" && saved.defaultTimeoutMs > 0
      ? saved.defaultTimeoutMs
      : DEFAULT_SHELL_ACCESS_SETTINGS.defaultTimeoutMs;
  const maxTimeoutMs =
    typeof saved.maxTimeoutMs === "number" && saved.maxTimeoutMs >= defaultTimeoutMs
      ? saved.maxTimeoutMs
      : DEFAULT_SHELL_ACCESS_SETTINGS.maxTimeoutMs;

  const defaultCwd =
    typeof saved.defaultCwd === "string" &&
    allowedCwds.some((cwd) => cwd.cwdId === saved.defaultCwd)
      ? saved.defaultCwd
      : undefined;

  return {
    enabled:
      typeof saved.enabled === "boolean" ? saved.enabled : DEFAULT_SHELL_ACCESS_SETTINGS.enabled,
    requiresApproval:
      typeof saved.requiresApproval === "boolean"
        ? saved.requiresApproval
        : DEFAULT_SHELL_ACCESS_SETTINGS.requiresApproval,
    defaultCwd,
    allowedCwds,
    shells: shells.length > 0 ? shells : platformDefaults.shells,
    selectedShell,
    maxCommandChars,
    maxOutputBytes,
    defaultTimeoutMs,
    maxTimeoutMs,
  };
}

function normalizeLocalAgentSettings(
  saved: Partial<LocalAgentSettings> | null | undefined,
): LocalAgentSettings {
  if (!saved || typeof saved !== "object") {
    return { ...DEFAULT_LOCAL_AGENT_SETTINGS };
  }

  const providerSource: LocalAgentProviderSource =
    saved.providerSource === "local"
      ? "local"
      : saved.providerSource === "ollama"
        ? "ollama"
        : "aurago";

  const auragoProviderId =
    typeof saved.auragoProviderId === "string" && saved.auragoProviderId.trim().length > 0
      ? saved.auragoProviderId.trim()
      : undefined;

  const rawLocalProvider = saved.localProvider;
  const localProvider =
    rawLocalProvider && typeof rawLocalProvider === "object"
      ? {
          name: typeof rawLocalProvider.name === "string" ? rawLocalProvider.name.trim() : "",
          baseUrl:
            typeof rawLocalProvider.baseUrl === "string" ? rawLocalProvider.baseUrl.trim() : "",
          apiKey: typeof rawLocalProvider.apiKey === "string" ? rawLocalProvider.apiKey : "",
          model: typeof rawLocalProvider.model === "string" ? rawLocalProvider.model.trim() : "",
        }
      : undefined;

  const rawOllamaProvider = saved.ollamaProvider;
  const ollamaProvider =
    rawOllamaProvider && typeof rawOllamaProvider === "object"
      ? {
          baseUrl:
            typeof rawOllamaProvider.baseUrl === "string" && rawOllamaProvider.baseUrl.trim()
              ? rawOllamaProvider.baseUrl.trim()
              : DEFAULT_OLLAMA_BASE_URL,
          model: typeof rawOllamaProvider.model === "string" ? rawOllamaProvider.model.trim() : "",
        }
      : undefined;

  const maxSteps =
    typeof saved.maxSteps === "number" && Number.isFinite(saved.maxSteps) && saved.maxSteps > 0
      ? Math.min(20, Math.floor(saved.maxSteps))
      : DEFAULT_LOCAL_AGENT_SETTINGS.maxSteps;

  return {
    enabled:
      typeof saved.enabled === "boolean" ? saved.enabled : DEFAULT_LOCAL_AGENT_SETTINGS.enabled,
    providerSource,
    ...(auragoProviderId ? { auragoProviderId } : {}),
    ...(localProvider ? { localProvider } : {}),
    ...(ollamaProvider ? { ollamaProvider } : {}),
    maxSteps,
  };
}

function normalizeOpenPetsSettings(saved: Partial<OpenPetsSettings> | undefined): OpenPetsSettings {
  const petId =
    typeof saved?.petId === "string" && saved.petId.trim().length > 0 ? saved.petId.trim() : null;
  return {
    enabled:
      typeof saved?.enabled === "boolean" ? saved.enabled : DEFAULT_OPENPETS_SETTINGS.enabled,
    petId,
    reactToSpeech:
      typeof saved?.reactToSpeech === "boolean"
        ? saved.reactToSpeech
        : DEFAULT_OPENPETS_SETTINGS.reactToSpeech,
    showMessages:
      typeof saved?.showMessages === "boolean"
        ? saved.showMessages
        : DEFAULT_OPENPETS_SETTINGS.showMessages,
  };
}

export function normalizeAppSettings(saved: Partial<AppSettings> | null | undefined): AppSettings {
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
      theme === "light" || theme === "dark" || theme === "system" ? theme : DEFAULT_SETTINGS.theme,
    uiTheme: normalizeUiTheme(saved?.uiTheme),
    locale,
    speech: normalizeSpeechSettings(saved?.speech, locale),
    uiSounds: normalizeUiSoundSettings(saved?.uiSounds),
    minimizeToTray:
      typeof saved?.minimizeToTray === "boolean"
        ? saved.minimizeToTray
        : DEFAULT_SETTINGS.minimizeToTray,
    showWindowHotkey: normalizeShowWindowHotkey(saved?.showWindowHotkey),
    speechHotkey: normalizeSpeechHotkey(saved?.speechHotkey),
    desktopControlEnabled:
      typeof saved?.desktopControlEnabled === "boolean"
        ? saved.desktopControlEnabled
        : DEFAULT_SETTINGS.desktopControlEnabled,
    assetFetchAllowedOrigins: normalizeAssetFetchAllowedOrigins(saved?.assetFetchAllowedOrigins),
    browserControlEnabled:
      typeof saved?.browserControlEnabled === "boolean"
        ? saved.browserControlEnabled
        : DEFAULT_SETTINGS.browserControlEnabled,
    pageAgentEnabled:
      typeof saved?.pageAgentEnabled === "boolean"
        ? saved.pageAgentEnabled
        : DEFAULT_SETTINGS.pageAgentEnabled,
    pageAgentStartUrl: normalizePageAgentStartUrl(saved?.pageAgentStartUrl),
    fileAccess: normalizeFileAccessSettings(saved?.fileAccess),
    shellAccess: normalizeShellAccessSettings(saved?.shellAccess),
    chatTtsMode: normalizeChatTtsMode(saved?.chatTtsMode),
    chatSpeakerMode:
      typeof saved?.chatSpeakerMode === "boolean"
        ? saved.chatSpeakerMode
        : DEFAULT_SETTINGS.chatSpeakerMode,
    openPets: normalizeOpenPetsSettings(saved?.openPets),
    reduceMotion:
      typeof saved?.reduceMotion === "boolean" ? saved.reduceMotion : DEFAULT_SETTINGS.reduceMotion,
    speechVisualizerEnabled:
      typeof saved?.speechVisualizerEnabled === "boolean"
        ? saved.speechVisualizerEnabled
        : DEFAULT_SETTINGS.speechVisualizerEnabled,
    localAgent: normalizeLocalAgentSettings(saved?.localAgent),
    onboardingCompleted:
      typeof saved?.onboardingCompleted === "boolean"
        ? saved.onboardingCompleted
        : DEFAULT_SETTINGS.onboardingCompleted,
  };
}

function normalizeAssetFetchAllowedOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_SETTINGS.assetFetchAllowedOrigins];
  }
  const seen = new Set<string>();
  const origins: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    origins.push(trimmed);
  }
  return origins;
}

function normalizeChatTtsMode(value: unknown): ChatTtsMode {
  if (value === "auto" || value === "aurago" || value === "frontend" || value === "off") {
    return value;
  }
  return DEFAULT_SETTINGS.chatTtsMode;
}

async function applySettings(next: AppSettings): Promise<void> {
  const normalized = normalizeAppSettings(next);
  updateSettings(normalized);
  applyUiTheme(normalized.uiTheme);
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
    const withOnboarding = await resolveOnboardingInSettings(merged);
    await applySettings(withOnboarding);

    if (withOnboarding.onboardingCompleted && !merged.onboardingCompleted) {
      try {
        await loaded.set(SETTINGS_KEY, withOnboarding);
        await loaded.save();
      } catch {
        // Theme/Locale sind bereits angewendet, auch wenn Persistenz fehlschlägt
      }
    }

    return withOnboarding;
  } catch {
    const fallback = normalizeAppSettings(DEFAULT_SETTINGS);
    const withOnboarding = await resolveOnboardingInSettings(fallback);
    await applySettings(withOnboarding);
    return withOnboarding;
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

export async function markOnboardingCompleted(): Promise<void> {
  const current = normalizeAppSettings(get(settings));
  if (current.onboardingCompleted) {
    clearLegacyOnboardingFlag();
    return;
  }

  await saveSettings({ ...current, onboardingCompleted: true });
  clearLegacyOnboardingFlag();
}

export async function resetOnboardingCompleted(): Promise<void> {
  const current = normalizeAppSettings(get(settings));
  await saveSettings({ ...current, onboardingCompleted: false });
  clearLegacyOnboardingFlag();
}
