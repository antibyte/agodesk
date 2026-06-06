<script lang="ts">
  import type {
    AppSettings,
    ConnectionStatus,
    FileAccessRoot,
    FileAccessSettings,
    SessionStatus,
    SpeechSettings,
    ThemeMode,
    UiSoundSettings,
    UiSoundTheme,
  } from "../types/protocol";
import {
  DEFAULT_FILE_ACCESS_SETTINGS,
  DEFAULT_SPEECH_SETTINGS,
  DEFAULT_UI_SOUND_SETTINGS,
  UI_SOUND_THEMES,
  getWsOrigin,
  SPEECH_PROVIDERS,
  type SpeechProvider,
  type LocalAsrModel,
  isGeminiSpeechProvider,
} from "../types/protocol";
  import {
    APP_LOCALES,
    LOCALE_LABELS,
    getTranslateFn,
    i18n,
    type UiLocaleSetting,
  } from "../i18n";
  import type { MessageKey } from "../i18n/types";
  import { loadDeviceId } from "../services/credentials";
  import {
    clearGeminiApiKey,
    hasGeminiApiKey,
    loadGeminiApiKey,
    saveGeminiApiKey,
  } from "../services/gemini-credentials";
  import { testGeminiConnection } from "../services/speech-flow";
  import { speechAsrStatus, speechTtsStatus, downloadSpeechAsrModel, listenSpeechModelDownload, type SpeechAsrStatus, type SpeechTtsStatus } from "../services/speech-sidecar";
  import { collectHostInfo, probeBrowserConnection, type HostInfo } from "../services/desktop";
  import {
    buildPathDisplay,
    cloneFileAccessSettings,
    createFileAccessRootId,
  } from "../services/file-access";
  import {
    canonicalizeFolderPath,
    pickFolderPath,
  } from "../services/file-commands";
  import {
    GEMINI_API_KEY_URL,
    openExternalUrl,
  } from "../services/open-external-url";
  import { SERVER_PRESETS } from "../services/settings-presets";
  import { normalizeServerUrl } from "../services/server-url";
  import { previewUiSoundTheme } from "../services/ui-sounds";
  import WindowControls from "./WindowControls.svelte";
  import { isDesktopShell } from "../services/window-controls";
  import { onMount } from "svelte";

  export type SettingsSavePayload = Pick<
    AppSettings,
    | "serverUrl"
    | "theme"
    | "locale"
    | "speech"
    | "uiSounds"
    | "minimizeToTray"
    | "desktopControlEnabled"
    | "browserControlEnabled"
    | "fileAccess"
  >;

  const GEMINI_VOICE_OPTIONS = [
    "Zephyr",
    "Puck",
    "Charon",
    "Kore",
    "Fenrir",
    "Aoede",
  ] as const;

  const HYBRID_TTS_VOICE_OPTIONS = [
    "de-DE-KatjaNeural",
    "de-DE-ConradNeural",
    "de-DE-AmalaNeural",
    "de-DE-FlorianMultilingualNeural",
  ] as const;

  const OFFLINE_TTS_VOICE_OPTIONS = [
    "de_DE-thorsten-high",
    "de_DE-thorsten-low",
    "de_DE-kerstin-low",
  ] as const;

  const LOCAL_ASR_MODEL_OPTIONS: LocalAsrModel[] = [
    "whisper_small_de",
    "omnilingual_ctc_int8",
  ];

  const THEME_MODES: ThemeMode[] = ["system", "light", "dark"];

  interface Props {
    serverUrl?: string;
    theme?: ThemeMode;
    locale?: UiLocaleSetting;
    speech?: SpeechSettings;
    uiSounds?: UiSoundSettings;
    minimizeToTray?: boolean;
    desktopControlEnabled?: boolean;
    browserControlEnabled?: boolean;
    fileAccess?: FileAccessSettings;
    connectionStatus?: ConnectionStatus;
    sessionStatus?: SessionStatus;
    sessionId?: string;
    sessionError?: string;
    remoteControlActive?: boolean;
    appVersion?: string;
    onBack?: () => void;
    onSave?: (settings: SettingsSavePayload) => void | Promise<void>;
    onReconnect?: () => void;
    onRetryPairing?: () => void;
    onUnpair?: () => void;
    onOpenTlsTrust?: () => void;
  }

  let {
    serverUrl = "",
    theme = "system",
    locale = "system",
    speech = DEFAULT_SPEECH_SETTINGS,
    uiSounds = DEFAULT_UI_SOUND_SETTINGS,
    minimizeToTray = false,
    desktopControlEnabled = true,
    browserControlEnabled = false,
    fileAccess = DEFAULT_FILE_ACCESS_SETTINGS,
    connectionStatus = "disconnected",
    sessionStatus = "idle",
    sessionId = "",
    sessionError = "",
    remoteControlActive = false,
    appVersion = "0.1.0",
    onBack,
    onSave,
    onReconnect,
    onRetryPairing,
    onUnpair,
    onOpenTlsTrust,
  }: Props = $props();

  type SettingsSection =
    | "connection"
    | "device"
    | "appearance"
    | "language"
    | "desktop"
    | "files"
    | "speech"
    | "about";

  let activeSection = $state<SettingsSection>("connection");
  let draftUrl = $state("");
  let draftTheme = $state<ThemeMode>("system");
  let draftLocale = $state<UiLocaleSetting>("system");
  let draftMinimizeToTray = $state(false);
  let draftDesktopControlEnabled = $state(true);
  let draftBrowserControlEnabled = $state(false);
  let draftFileAccess = $state<FileAccessSettings>(cloneFileAccessSettings(DEFAULT_FILE_ACCESS_SETTINGS));
  let draftSpeech = $state<SpeechSettings>({ ...DEFAULT_SPEECH_SETTINGS });
  let draftUiSoundEnabled = $state(true);
  let draftUiSoundTheme = $state<UiSoundTheme>("soft");
  let draftUiSoundVolume = $state(0.2);
  let deviceId = $state<string | null>(null);
  let hostInfo = $state<HostInfo | null>(null);
  let dirty = $state(false);
  let saving = $state(false);

  let backButtonEl = $state<HTMLButtonElement | null>(null);

  let apiKeyInput = $state("");
  let apiKeyStored = $state(false);
  let apiKeyBusy = $state(false);
  let apiKeyMessage = $state("");
  let apiKeyMessageTone = $state<"success" | "error" | "">("");

  let browserTestBusy = $state(false);
  let browserTestMessage = $state("");
  let browserTestTone = $state<"success" | "error" | "">("");

  const sections = $derived(
    (
      [
        ["connection", "settings.section.connection.label", "settings.section.connection.hint"],
        ["device", "settings.section.device.label", "settings.section.device.hint"],
        ["appearance", "settings.section.appearance.label", "settings.section.appearance.hint"],
        ["language", "settings.section.language.label", "settings.section.language.hint"],
        ["desktop", "settings.section.desktop.label", "settings.section.desktop.hint"],
        ["files", "settings.section.files.label", "settings.section.files.hint"],
        ["speech", "settings.section.speech.label", "settings.section.speech.hint"],
        ["about", "settings.section.about.label", "settings.section.about.hint"],
      ] as const
    ).map(([id, labelKey, hintKey]) => ({
      id: id as SettingsSection,
      label: $i18n(labelKey),
      hint: $i18n(hintKey),
    })),
  );

  const serverOrigin = $derived.by(() => {
    try {
      return getWsOrigin(normalizeServerUrl(draftUrl));
    } catch {
      return getTranslateFn()("common.emDash");
    }
  });

  const isSecureServer = $derived(/^wss:/i.test(normalizeServerUrl(draftUrl)));

  const uiSoundVolumePercent = $derived(Math.round(draftUiSoundVolume * 100));

  const speechAgentConflict = $derived(
    draftSpeech.enabled && draftSpeech.agentMode && !draftSpeech.autoSendToAuraGo,
  );

  const isGeminiSpeechSelected = $derived(isGeminiSpeechProvider(draftSpeech.provider));
  const isHybridSpeechSelected = $derived(draftSpeech.provider === "hybrid");
  const isOfflineSpeechSelected = $derived(draftSpeech.provider === "offline");
  const usesLocalAsr = $derived(isHybridSpeechSelected || isOfflineSpeechSelected);
  const showOmnilingualGermanHint = $derived(
    usesLocalAsr
      && draftSpeech.localAsrModel === "omnilingual_ctc_int8"
      && draftSpeech.language.toLowerCase().startsWith("de"),
  );

  let asrStatus: SpeechAsrStatus | null = $state(null);
  let asrStatusLoading = $state(false);
  let asrDownloading = $state(false);
  let asrDownloadProgress = $state(0);
  let asrDownloadPhase = $state<"downloading" | "extracting" | "complete" | "error" | null>(null);
  let asrDownloadError = $state<string | null>(null);
  let ttsStatus: SpeechTtsStatus | null = $state(null);
  let ttsStatusLoading = $state(false);

  function connectionLabel(status: ConnectionStatus): string {
    return $i18n(`connection.status.${status}` as MessageKey);
  }

  function sessionLabel(status: SessionStatus): string {
    return $i18n(`session.status.${status}` as MessageKey);
  }

  function themeIcon(mode: ThemeMode): string {
    if (mode === "system") return "◐";
    if (mode === "light") return "☀";
    return "☾";
  }

  $effect(() => {
    if (!dirty) {
      draftUrl = serverUrl;
      draftTheme = theme;
      draftLocale = locale;
      draftMinimizeToTray = minimizeToTray;
      draftDesktopControlEnabled = desktopControlEnabled;
      draftBrowserControlEnabled = browserControlEnabled;
      draftFileAccess = cloneFileAccessSettings(fileAccess);
      draftSpeech = { ...DEFAULT_SPEECH_SETTINGS, ...speech };
      draftUiSoundEnabled = uiSounds.enabled;
      draftUiSoundTheme = uiSounds.theme;
      draftUiSoundVolume = uiSounds.volume;
    }
  });

  $effect(() => {
    void loadDeviceId(serverUrl).then((id) => {
      deviceId = id;
    });
    void collectHostInfo()
      .then((info) => {
        hostInfo = info;
      })
      .catch(() => {
        hostInfo = null;
      });
  });

  $effect(() => {
    void refreshApiKeyStatus();
  });

  $effect(() => {
    if (!usesLocalAsr || !draftSpeech.enabled) {
      asrStatus = null;
      return;
    }
    void refreshAsrStatus(draftSpeech.localAsrModel);
  });

  $effect(() => {
    if (!isOfflineSpeechSelected || !draftSpeech.enabled) {
      ttsStatus = null;
      return;
    }
    void refreshTtsStatus(draftSpeech.offlineTtsVoice);
  });

  async function refreshAsrStatus(model: LocalAsrModel): Promise<void> {
    asrStatusLoading = true;
    try {
      asrStatus = await speechAsrStatus(model);
    } catch {
      asrStatus = null;
    } finally {
      asrStatusLoading = false;
    }
  }

  async function ensureAsrModelDownload(model: LocalAsrModel): Promise<void> {
    if (asrDownloading) return;

    await refreshAsrStatus(model);
    if (asrStatus?.ready) return;

    asrDownloading = true;
    asrDownloadProgress = 0;
    asrDownloadPhase = "downloading";
    asrDownloadError = null;

    const unlisten = await listenSpeechModelDownload((progress) => {
      if (progress.model_id !== model) return;
      asrDownloadProgress = progress.progress;
      asrDownloadPhase = progress.phase;
      if (progress.phase === "error" && progress.message) {
        asrDownloadError = progress.message;
      }
    });

    try {
      await downloadSpeechAsrModel(model);
      await refreshAsrStatus(model);
      if (asrStatus?.ready) {
        asrDownloadError = null;
        asrDownloadPhase = "complete";
      }
    } catch (error) {
      await refreshAsrStatus(model);
      if (asrStatus?.ready) {
        asrDownloadError = null;
        asrDownloadPhase = "complete";
      } else {
        asrDownloadError = error instanceof Error ? error.message : String(error);
        asrDownloadPhase = "error";
      }
    } finally {
      asrDownloading = false;
      unlisten();
    }
  }

  async function handleLocalAsrModelChange(model: LocalAsrModel): Promise<void> {
    markDirty();
    await ensureAsrModelDownload(model);
  }

  async function refreshTtsStatus(voice: string): Promise<void> {
    ttsStatusLoading = true;
    try {
      ttsStatus = await speechTtsStatus(voice);
    } catch {
      ttsStatus = null;
    } finally {
      ttsStatusLoading = false;
    }
  }

  async function refreshApiKeyStatus(): Promise<void> {
    apiKeyStored = await hasGeminiApiKey();
    if (!apiKeyInput.trim()) {
      const stored = await loadGeminiApiKey();
      if (stored) {
        apiKeyInput = "";
      }
    }
  }

  function markDirty(): void {
    dirty = true;
  }

  function applyPreset(url: string): void {
    draftUrl = url;
    markDirty();
  }

  function buildSavePayload(): SettingsSavePayload {
    return {
      serverUrl: normalizeServerUrl(draftUrl.trim()),
      theme: draftTheme,
      locale: draftLocale,
      speech: { ...draftSpeech },
      uiSounds: {
        enabled: draftUiSoundEnabled,
        theme: draftUiSoundTheme,
        volume: draftUiSoundVolume,
      },
      minimizeToTray: draftMinimizeToTray,
      desktopControlEnabled: draftDesktopControlEnabled,
      browserControlEnabled: draftBrowserControlEnabled,
      fileAccess: cloneFileAccessSettings(draftFileAccess),
    };
  }

  function discardChanges(): void {
    dirty = false;
  }

  async function save(): Promise<void> {
    if (!dirty || saving) {
      return;
    }

    saving = true;
    try {
      await onSave?.(buildSavePayload());
      dirty = false;
      onBack?.();
    } catch (error) {
      console.error("[agodesk:settings] save failed", error);
    } finally {
      saving = false;
    }
  }

  function truncate(value: string, max = 28): string {
    if (!value || value.length <= max) {
      return value || getTranslateFn()("common.emDash");
    }
    return `${value.slice(0, max)}…`;
  }

  function setSpeechAutoSend(enabled: boolean): void {
    draftSpeech = {
      ...draftSpeech,
      autoSendToAuraGo: enabled,
      agentMode: enabled ? false : draftSpeech.agentMode,
    };
    markDirty();
  }

  function setSpeechProvider(provider: SpeechProvider): void {
    draftSpeech = {
      ...draftSpeech,
      provider,
      voiceResponses: isGeminiSpeechProvider(provider) ? draftSpeech.voiceResponses : true,
    };
    markDirty();
  }

  function setSpeechAgentMode(enabled: boolean): void {
    draftSpeech = {
      ...draftSpeech,
      agentMode: enabled,
      autoSendToAuraGo: enabled ? false : draftSpeech.autoSendToAuraGo,
    };
    markDirty();
  }

  async function addFileRoot(): Promise<void> {
    const picked = await pickFolderPath();
    if (!picked) {
      return;
    }

    try {
      const canonical = await canonicalizeFolderPath(picked);
      const segments = canonical.replace(/\\/g, "/").split("/").filter(Boolean);
      const label = segments[segments.length - 1] ?? canonical;
      const root: FileAccessRoot = {
        rootId: createFileAccessRootId(label),
        label,
        canonicalPath: canonical,
        pathDisplay: buildPathDisplay(canonical),
        readEnabled: true,
        writeEnabled: false,
      };
      draftFileAccess = {
        ...draftFileAccess,
        roots: [...draftFileAccess.roots, root],
      };
      markDirty();
    } catch (error) {
      console.error("[agodesk:settings] add folder failed", error);
    }
  }

  function removeFileRoot(rootId: string): void {
    draftFileAccess = {
      ...draftFileAccess,
      roots: draftFileAccess.roots.filter((root) => root.rootId !== rootId),
    };
    markDirty();
  }

  function updateFileRoot(
    rootId: string,
    patch: Partial<Pick<FileAccessRoot, "label" | "readEnabled" | "writeEnabled">>,
  ): void {
    draftFileAccess = {
      ...draftFileAccess,
      roots: draftFileAccess.roots.map((root) =>
        root.rootId === rootId ? { ...root, ...patch } : root,
      ),
    };
    markDirty();
  }

  function setApiKeyFeedback(key: MessageKey, tone: "success" | "error"): void {
    apiKeyMessage = $i18n(key);
    apiKeyMessageTone = tone;
  }

  async function handleSaveApiKey(): Promise<void> {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setApiKeyFeedback("settings.speech.apiKey.error.empty", "error");
      return;
    }

    apiKeyBusy = true;
    try {
      await saveGeminiApiKey(trimmed);
      apiKeyStored = true;
      apiKeyInput = "";
      setApiKeyFeedback("settings.speech.apiKey.success.saved", "success");
    } catch {
      setApiKeyFeedback("settings.speech.apiKey.error.saveFailed", "error");
    } finally {
      apiKeyBusy = false;
    }
  }

  async function handleRemoveApiKey(): Promise<void> {
    apiKeyBusy = true;
    try {
      await clearGeminiApiKey();
      apiKeyStored = false;
      apiKeyInput = "";
      setApiKeyFeedback("settings.speech.apiKey.success.removed", "success");
    } catch {
      setApiKeyFeedback("settings.speech.apiKey.error.removeFailed", "error");
    } finally {
      apiKeyBusy = false;
    }
  }

  async function handleTestApiKey(): Promise<void> {
    apiKeyBusy = true;
    setApiKeyFeedback("settings.speech.apiKey.testing", "success");
    try {
      const key = apiKeyInput.trim() || (await loadGeminiApiKey());
      if (!key) {
        setApiKeyFeedback("settings.speech.apiKey.error.testNoKey", "error");
        return;
      }
      await testGeminiConnection(draftSpeech, key);
      setApiKeyFeedback("settings.speech.apiKey.success.test", "success");
    } catch {
      setApiKeyFeedback("settings.speech.apiKey.error.testFailed", "error");
    } finally {
      apiKeyBusy = false;
    }
  }

  async function handleTestBrowserConnection(): Promise<void> {
    if (!isDesktopShell()) {
      browserTestTone = "error";
      browserTestMessage = $i18n("settings.desktop.browser.testUnavailable");
      return;
    }

    browserTestBusy = true;
    browserTestTone = "success";
    browserTestMessage = $i18n("settings.desktop.browser.testing");
    try {
      const result = await probeBrowserConnection({ port: 9222, auto_launch: true });
      if (!result.success) {
        browserTestTone = "error";
        browserTestMessage = $i18n("settings.desktop.browser.testFailed", {
          message: result.message,
        });
        return;
      }

      browserTestTone = "success";
      browserTestMessage = $i18n("settings.desktop.browser.testSuccess", {
        endpoint: result.endpoint ?? $i18n("common.emDash"),
        launched: result.launched
          ? $i18n("settings.desktop.browser.testLaunchedSuffix")
          : "",
      });
    } catch {
      browserTestTone = "error";
      browserTestMessage = $i18n("settings.desktop.browser.testFailed", {
        message: $i18n("settings.desktop.browser.testUnknownError"),
      });
    } finally {
      browserTestBusy = false;
    }
  }

  function handlePreviewUiSound(theme: UiSoundTheme): void {
    previewUiSoundTheme(theme);
  }

  // Quick win: focus back button when settings view is shown (for keyboard users)
  onMount(() => {
    // small delay for layout
    setTimeout(() => {
      backButtonEl?.focus();
    }, 20);
  });
</script>

<div class="settings-page">
  <header class="settings-header">
    <button
      bind:this={backButtonEl}
      type="button"
      class="ui-btn ui-btn-secondary back-button"
      onclick={() => onBack?.()}
    >
      {$i18n("settings.back")}
    </button>
    <div class="header-body" data-tauri-drag-region>
      <div class="header-copy">
        <h1>{$i18n("settings.title")}</h1>
        <p>{$i18n("settings.subtitle")}</p>
      </div>
    </div>
    <div class="header-actions">
      {#if dirty}
        <span class="dirty-badge ui-chip" data-tone="warning">
          {$i18n("settings.unsavedBadge")}
        </span>
      {/if}
      {#if dirty}
        <button
          type="button"
          class="ui-btn ui-btn-secondary"
          onclick={() => {
            discardChanges();
            onBack?.();
          }}
          disabled={saving}
        >
          {$i18n("settings.footer.discard")}
        </button>
      {/if}
      <button
        type="button"
        class="ui-btn ui-btn-primary"
        onclick={() => void save()}
        disabled={!dirty || saving}
      >
        {$i18n("settings.saveAndConnect")}
      </button>
      <WindowControls minimizeToTray={draftMinimizeToTray} />
    </div>
  </header>

  <div class="settings-layout">
    <nav class="settings-nav" aria-label={$i18n("settings.navAriaLabel")}>
      {#each sections as section (section.id)}
        <button
          type="button"
          class="nav-item"
          class:active={activeSection === section.id}
          onclick={() => (activeSection = section.id)}
        >
          <span class="nav-label">{section.label}</span>
          <span class="nav-hint">{section.hint}</span>
        </button>
      {/each}
    </nav>

    <div class="settings-content">
      {#key activeSection}
        <div class="section-panel">
          {#if activeSection === "connection"}
            <section class="ui-card">
              <div class="card-header">
                <h2>{$i18n("settings.connection.websocket.title")}</h2>
                <p>{$i18n("settings.connection.websocket.description")}</p>
              </div>

              <label class="field">
                <span class="field-label">{$i18n("settings.connection.serverUrl.label")}</span>
                <input
                  type="url"
                  bind:value={draftUrl}
                  oninput={markDirty}
                  placeholder={$i18n("settings.connection.serverUrl.placeholder")}
                />
              </label>

              <p class="help">{$i18n("settings.connection.serverUrl.help")}</p>

              <div class="preset-grid">
                {#each SERVER_PRESETS as preset (preset.id)}
                  <button
                    type="button"
                    class="preset-card"
                    class:selected={draftUrl === preset.url}
                    onclick={() => applyPreset(preset.url)}
                  >
                    <strong>{$i18n(preset.labelKey as MessageKey)}</strong>
                    <span>{$i18n(preset.descriptionKey as MessageKey)}</span>
                  </button>
                {/each}
              </div>
            </section>

            <section class="ui-card">
              <div class="card-header">
                <h2>{$i18n("settings.connection.status.title")}</h2>
              </div>

              <dl class="info-grid">
                <div>
                  <dt>{$i18n("settings.connection.status.label")}</dt>
                  <dd>
                    <span class="ui-chip" data-tone={connectionStatus}>
                      {connectionLabel(connectionStatus)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{$i18n("settings.connection.origin.label")}</dt>
                  <dd><code>{serverOrigin}</code></dd>
                </div>
                <div>
                  <dt>{$i18n("settings.connection.transport.label")}</dt>
                  <dd>
                    {isSecureServer
                      ? $i18n("settings.connection.transport.wss")
                      : $i18n("settings.connection.transport.ws")}
                  </dd>
                </div>
                <div>
                  <dt>{$i18n("settings.connection.session.label")}</dt>
                  <dd>
                    <span class="ui-chip" data-tone={sessionStatus}>
                      {sessionLabel(sessionStatus)}
                    </span>
                  </dd>
                </div>
              </dl>

              <div class="action-row">
                <button
                  type="button"
                  class="ui-btn ui-btn-secondary"
                  onclick={() => onReconnect?.()}
                >
                  {$i18n("settings.connection.reconnect")}
                </button>
                {#if isSecureServer}
                  <button
                    type="button"
                    class="ui-btn ui-btn-secondary"
                    onclick={() => onOpenTlsTrust?.()}
                  >
                    {$i18n("settings.connection.checkTlsCert")}
                  </button>
                {/if}
              </div>
            </section>
          {/if}

          {#if activeSection === "device"}
            <section class="ui-card">
              <div class="card-header">
                <h2>{$i18n("settings.device.title")}</h2>
                <p>{$i18n("settings.device.description")}</p>
              </div>

              <dl class="info-grid">
                <div>
                  <dt>{$i18n("settings.device.deviceId.label")}</dt>
                  <dd>
                    <code>
                      {deviceId ?? $i18n("settings.device.deviceId.notPaired")}
                    </code>
                  </dd>
                </div>
                <div>
                  <dt>{$i18n("settings.device.sessionId.label")}</dt>
                  <dd><code title={sessionId}>{truncate(sessionId, 36)}</code></dd>
                </div>
                <div>
                  <dt>{$i18n("settings.device.pairingStatus.label")}</dt>
                  <dd>{sessionLabel(sessionStatus)}</dd>
                </div>
                {#if hostInfo}
                  <div>
                    <dt>{$i18n("settings.device.hostname.label")}</dt>
                    <dd>{hostInfo.hostname}</dd>
                  </div>
                  <div>
                    <dt>{$i18n("settings.device.platform.label")}</dt>
                    <dd>{hostInfo.platform} / {hostInfo.arch}</dd>
                  </div>
                {/if}
              </dl>

              {#if sessionError}
                <p class="error-box">{sessionError}</p>
              {/if}

              <div class="action-row">
                <button
                  type="button"
                  class="ui-btn ui-btn-secondary"
                  onclick={() => onRetryPairing?.()}
                >
                  {$i18n("settings.device.retrySession")}
                </button>
                <button
                  type="button"
                  class="ui-btn ui-btn-secondary ui-btn-danger"
                  onclick={() => onUnpair?.()}
                >
                  {$i18n("settings.device.unpair")}
                </button>
              </div>
            </section>
          {/if}

          {#if activeSection === "appearance"}
            <section class="ui-card">
              <div class="card-header">
                <h2>{$i18n("settings.appearance.title")}</h2>
                <p>{$i18n("settings.appearance.description")}</p>
              </div>

              <div class="theme-grid">
                {#each THEME_MODES as mode (mode)}
                  <label class="theme-card" class:selected={draftTheme === mode} data-theme-preview={mode}>
                    <input
                      type="radio"
                      bind:group={draftTheme}
                      value={mode}
                      onchange={markDirty}
                    />
                    <span class="theme-icon" aria-hidden="true">{themeIcon(mode)}</span>
                    <strong>{$i18n(`theme.${mode}` as MessageKey)}</strong>
                    <span>{$i18n(`theme.${mode}.description` as MessageKey)}</span>
                  </label>
                {/each}
              </div>
            </section>

            <section class="ui-card">
              <div class="card-header">
                <h2>{$i18n("settings.appearance.uiSounds.title")}</h2>
                <p>{$i18n("settings.appearance.uiSounds.description")}</p>
              </div>

              <label class="field checkbox-field">
                <input
                  type="checkbox"
                  bind:checked={draftUiSoundEnabled}
                  onchange={markDirty}
                />
                <span>{$i18n("settings.appearance.uiSounds.enable")}</span>
              </label>

              <div class="sound-theme-grid">
                {#each UI_SOUND_THEMES as soundTheme (soundTheme)}
                  <label class="sound-theme-card" class:selected={draftUiSoundTheme === soundTheme}>
                    <input
                      type="radio"
                      bind:group={draftUiSoundTheme}
                      value={soundTheme}
                      onchange={markDirty}
                    />
                    <strong>{$i18n(`uiSoundTheme.${soundTheme}` as MessageKey)}</strong>
                    <button
                      type="button"
                      class="ui-btn ui-btn-secondary sound-preview-btn"
                      onclick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handlePreviewUiSound(soundTheme);
                      }}
                    >
                      {$i18n("settings.appearance.uiSounds.preview")}
                    </button>
                  </label>
                {/each}
              </div>

              <label class="field">
                <span class="field-label">
                  {$i18n("settings.appearance.uiSounds.volume", {
                    percent: uiSoundVolumePercent,
                  })}
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  bind:value={draftUiSoundVolume}
                  oninput={markDirty}
                  disabled={!draftUiSoundEnabled}
                />
              </label>
            </section>

            <section class="ui-card">
              <label class="field checkbox-field">
                <input
                  type="checkbox"
                  bind:checked={draftMinimizeToTray}
                  onchange={markDirty}
                />
                <span>{$i18n("settings.appearance.minimizeToTray")}</span>
              </label>
              <p class="help">{$i18n("settings.appearance.minimizeToTray.help")}</p>
            </section>
          {/if}

          {#if activeSection === "language"}
            <section class="ui-card">
              <div class="card-header">
                <h2>{$i18n("settings.language.title")}</h2>
                <p>{$i18n("settings.language.description")}</p>
              </div>

              <div class="locale-grid">
                <label class="locale-card" class:selected={draftLocale === "system"}>
                  <input
                    type="radio"
                    bind:group={draftLocale}
                    value="system"
                    onchange={markDirty}
                  />
                  <strong>{$i18n("locale.setting.system")}</strong>
                </label>
                {#each APP_LOCALES as appLocale (appLocale)}
                  <label class="locale-card" class:selected={draftLocale === appLocale}>
                    <input
                      type="radio"
                      bind:group={draftLocale}
                      value={appLocale}
                      onchange={markDirty}
                    />
                    <strong>{LOCALE_LABELS[appLocale]}</strong>
                  </label>
                {/each}
              </div>
            </section>
          {/if}

          {#if activeSection === "desktop"}
            <section class="ui-card">
              <div class="card-header">
                <h2>{$i18n("settings.desktop.title")}</h2>
                <p>{$i18n("settings.desktop.description")}</p>
              </div>

              <label class="field checkbox-field">
                <input
                  type="checkbox"
                  bind:checked={draftDesktopControlEnabled}
                  onchange={markDirty}
                />
                <span>{$i18n("settings.desktop.enable")}</span>
              </label>

              <p class="help">{$i18n("settings.desktop.disabledHelp")}</p>

              <label class="field checkbox-field">
                <input
                  type="checkbox"
                  bind:checked={draftBrowserControlEnabled}
                  onchange={markDirty}
                  disabled={!draftDesktopControlEnabled}
                />
                <span>{$i18n("settings.desktop.browser.enable")}</span>
              </label>

              <p class="help">{$i18n("settings.desktop.browser.disabledHelp")}</p>
              <p class="help">{$i18n("settings.desktop.browser.setupHelp")}</p>

              {#if draftBrowserControlEnabled && draftDesktopControlEnabled}
                {#if browserTestMessage}
                  <p
                    class="api-key-message"
                    class:success={browserTestTone === "success"}
                    class:error={browserTestTone === "error"}
                  >
                    {browserTestMessage}
                  </p>
                {/if}
                <div class="action-row">
                  <button
                    type="button"
                    class="ui-btn ui-btn-secondary"
                    onclick={() => void handleTestBrowserConnection()}
                    disabled={browserTestBusy}
                  >
                    {$i18n("settings.desktop.browser.test")}
                  </button>
                </div>
              {/if}

              <dl class="info-grid">
                <div>
                  <dt>{$i18n("settings.desktop.status.label")}</dt>
                  <dd>
                    <span
                      class="ui-chip"
                      data-tone={draftDesktopControlEnabled ? "accepted" : "idle"}
                    >
                      {draftDesktopControlEnabled
                        ? $i18n("settings.desktop.status.enabled")
                        : $i18n("settings.desktop.status.disabled")}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{$i18n("settings.desktop.screenshots.label")}</dt>
                  <dd>{$i18n("settings.desktop.screenshots.value")}</dd>
                </div>
                <div>
                  <dt>{$i18n("settings.desktop.discovery.label")}</dt>
                  <dd>{$i18n("settings.desktop.discovery.value")}</dd>
                </div>
                <div>
                  <dt>{$i18n("settings.desktop.uiAutomation.label")}</dt>
                  <dd>{$i18n("settings.desktop.uiAutomation.value")}</dd>
                </div>
                <div>
                  <dt>{$i18n("settings.desktop.input.label")}</dt>
                  <dd>{$i18n("settings.desktop.input.value")}</dd>
                </div>
                <div>
                  <dt>{$i18n("settings.desktop.browser.label")}</dt>
                  <dd>{$i18n("settings.desktop.browser.value")}</dd>
                </div>
                <div>
                  <dt>{$i18n("settings.desktop.remoteControl.label")}</dt>
                  <dd>
                    <span
                      class="ui-chip"
                      data-tone={remoteControlActive ? "accepted" : "idle"}
                    >
                      {remoteControlActive
                        ? $i18n("settings.desktop.remoteControl.granted")
                        : $i18n("settings.desktop.remoteControl.inactive")}
                    </span>
                  </dd>
                </div>
              </dl>

              <p class="help">{$i18n("settings.desktop.approvalHelp")}</p>
              <p class="help warn">{$i18n("settings.desktop.auragoApprovalWarn")}</p>
            </section>
          {/if}

          {#if activeSection === "files"}
            <section class="ui-card">
              <div class="card-header">
                <h2>{$i18n("settings.fileAccess.title")}</h2>
                <p>{$i18n("settings.fileAccess.description")}</p>
              </div>

              <label class="field checkbox-field">
                <input
                  type="checkbox"
                  bind:checked={draftFileAccess.enabled}
                  onchange={markDirty}
                />
                <span>{$i18n("settings.fileAccess.enable")}</span>
              </label>

              <p class="help">{$i18n("settings.fileAccess.disabledHelp")}</p>

              <div class="limits-row">
                <label class="field">
                  <span class="field-label">{$i18n("settings.fileAccess.limits.read")}</span>
                  <input
                    type="number"
                    min="1"
                    bind:value={draftFileAccess.maxReadBytes}
                    oninput={markDirty}
                    disabled={!draftFileAccess.enabled}
                  />
                </label>
                <label class="field">
                  <span class="field-label">{$i18n("settings.fileAccess.limits.write")}</span>
                  <input
                    type="number"
                    min="1"
                    bind:value={draftFileAccess.maxWriteBytes}
                    oninput={markDirty}
                    disabled={!draftFileAccess.enabled}
                  />
                </label>
              </div>

              {#if draftFileAccess.roots.length === 0}
                <p class="help">{$i18n("settings.fileAccess.roots.empty")}</p>
              {:else}
                <ul class="file-roots-list">
                  {#each draftFileAccess.roots as root (root.rootId)}
                    <li class="file-root-row">
                      <div class="file-root-fields">
                        <label class="field compact">
                          <span class="field-label">
                            {$i18n("settings.fileAccess.roots.label")}
                          </span>
                          <input
                            type="text"
                            value={root.label}
                            oninput={(event) =>
                              updateFileRoot(root.rootId, {
                                label: (event.currentTarget as HTMLInputElement).value,
                              })}
                          />
                        </label>
                        <div class="field compact">
                          <span class="field-label">
                            {$i18n("settings.fileAccess.roots.path")}
                          </span>
                          <code class="path-display" title={root.canonicalPath}>
                            {buildPathDisplay(root.canonicalPath)}
                          </code>
                        </div>
                      </div>
                      <div class="file-root-perms">
                        <label class="checkbox-field inline">
                          <input
                            type="checkbox"
                            checked={root.readEnabled}
                            onchange={(event) =>
                              updateFileRoot(root.rootId, {
                                readEnabled: (event.currentTarget as HTMLInputElement).checked,
                              })}
                          />
                          <span>{$i18n("settings.fileAccess.roots.read")}</span>
                        </label>
                        <label class="checkbox-field inline">
                          <input
                            type="checkbox"
                            checked={root.writeEnabled}
                            onchange={(event) =>
                              updateFileRoot(root.rootId, {
                                writeEnabled: (event.currentTarget as HTMLInputElement).checked,
                              })}
                          />
                          <span>{$i18n("settings.fileAccess.roots.write")}</span>
                        </label>
                        <button
                          type="button"
                          class="ui-btn ui-btn-secondary ui-btn-danger"
                          onclick={() => removeFileRoot(root.rootId)}
                        >
                          {$i18n("settings.fileAccess.roots.remove")}
                        </button>
                      </div>
                    </li>
                  {/each}
                </ul>
              {/if}

              <div class="action-row">
                <button
                  type="button"
                  class="ui-btn ui-btn-secondary"
                  onclick={() => void addFileRoot()}
                  disabled={!draftFileAccess.enabled}
                >
                  {$i18n("settings.fileAccess.roots.add")}
                </button>
              </div>
            </section>
          {/if}

          {#if activeSection === "speech"}
            <section class="ui-card">
              <div class="card-header">
                <h2>{$i18n("settings.speech.title")}</h2>
                <p>{$i18n("settings.speech.description")}</p>
              </div>

              <label class="field checkbox-field">
                <input
                  type="checkbox"
                  bind:checked={draftSpeech.enabled}
                  onchange={markDirty}
                />
                <span>{$i18n("settings.speech.enable")}</span>
              </label>

              <fieldset class="provider-fieldset" disabled={!draftSpeech.enabled}>
                <legend>{$i18n("settings.speech.provider.legend")}</legend>
                <div class="provider-grid">
                  {#each SPEECH_PROVIDERS as provider (provider)}
                    <label class="provider-card" class:selected={draftSpeech.provider === provider}>
                      <input
                        type="radio"
                        name="speech-provider"
                        value={provider}
                        checked={draftSpeech.provider === provider}
                        onchange={() => setSpeechProvider(provider)}
                      />
                      <span class="provider-title">
                        {$i18n(`settings.speech.provider.${provider}.title` as MessageKey)}
                      </span>
                      <span class="provider-hint">
                        {$i18n(`settings.speech.provider.${provider}.hint` as MessageKey)}
                      </span>
                    </label>
                  {/each}
                </div>
              </fieldset>

              {#if isHybridSpeechSelected || isOfflineSpeechSelected}
                <p class="help warn">{$i18n("settings.speech.provider.comingSoon")}</p>
              {/if}

              {#if isGeminiSpeechSelected}
              <label class="field checkbox-field">
                <input
                  type="checkbox"
                  checked={draftSpeech.voiceResponses}
                  onchange={(event) => {
                    draftSpeech = {
                      ...draftSpeech,
                      voiceResponses: (event.currentTarget as HTMLInputElement).checked,
                    };
                    markDirty();
                  }}
                  disabled={!draftSpeech.enabled}
                />
                <span>{$i18n("settings.speech.voiceResponses")}</span>
              </label>
              <p class="help">{$i18n("settings.speech.voiceResponsesHelp")}</p>
              {/if}

              {#if isHybridSpeechSelected || isOfflineSpeechSelected}
              <p class="help">{$i18n("settings.speech.localVoiceResponsesHelp")}</p>
              {/if}

              <label class="field checkbox-field">
                <input
                  type="checkbox"
                  checked={draftSpeech.autoSendToAuraGo}
                  onchange={(event) =>
                    setSpeechAutoSend((event.currentTarget as HTMLInputElement).checked)}
                  disabled={!draftSpeech.enabled}
                />
                <span>{$i18n("settings.speech.autoSend")}</span>
              </label>

              {#if speechAgentConflict}
                <p class="help warn">{$i18n("settings.speech.agentModeConflict")}</p>
              {/if}

              <label class="field checkbox-field">
                <input
                  type="checkbox"
                  checked={draftSpeech.agentMode}
                  onchange={(event) =>
                    setSpeechAgentMode((event.currentTarget as HTMLInputElement).checked)}
                  disabled={!draftSpeech.enabled}
                />
                <span>{$i18n("settings.speech.agentMode")}</span>
              </label>
              <p class="help">{$i18n("settings.speech.modeExclusionHelp")}</p>
              <p class="help">{$i18n("settings.speech.agentModeHelp")}</p>
              <p class="help">{$i18n("settings.speech.manualEditHelp")}</p>

              {#if isGeminiSpeechSelected}
              <label class="field">
                <span class="field-label">{$i18n("settings.speech.modelId.label")}</span>
                <input
                  type="text"
                  bind:value={draftSpeech.modelId}
                  oninput={markDirty}
                  placeholder={$i18n("settings.speech.modelId.placeholder")}
                  disabled={!draftSpeech.enabled}
                />
              </label>
              {/if}

              <label class="field">
                <span class="field-label">{$i18n("settings.speech.language.label")}</span>
                <input
                  type="text"
                  bind:value={draftSpeech.language}
                  oninput={markDirty}
                  placeholder={$i18n("settings.speech.language.placeholder")}
                  disabled={!draftSpeech.enabled}
                />
              </label>

              {#if isGeminiSpeechSelected}
              <label class="field">
                <span class="field-label">{$i18n("settings.speech.voiceName.label")}</span>
                <select
                  bind:value={draftSpeech.voiceName}
                  onchange={markDirty}
                  disabled={!draftSpeech.enabled}
                >
                  {#each GEMINI_VOICE_OPTIONS as voice (voice)}
                    <option value={voice}>{voice}</option>
                  {/each}
                </select>
              </label>
              {/if}

              {#if isHybridSpeechSelected}
              <label class="field">
                <span class="field-label">{$i18n("settings.speech.hybridTtsBackend.label")}</span>
                <select
                  bind:value={draftSpeech.hybridTtsBackend}
                  onchange={markDirty}
                  disabled={!draftSpeech.enabled}
                >
                  <option value="edge_tts">{$i18n("settings.speech.hybridTtsBackend.edgeTts")}</option>
                  <option value="azure">{$i18n("settings.speech.hybridTtsBackend.azure")}</option>
                </select>
              </label>
              <label class="field">
                <span class="field-label">{$i18n("settings.speech.hybridTtsVoice.label")}</span>
                <select
                  bind:value={draftSpeech.hybridTtsVoice}
                  onchange={markDirty}
                  disabled={!draftSpeech.enabled}
                >
                  {#each HYBRID_TTS_VOICE_OPTIONS as voice (voice)}
                    <option value={voice}>{voice}</option>
                  {/each}
                </select>
              </label>
              {/if}

              {#if isOfflineSpeechSelected}
              <label class="field">
                <span class="field-label">{$i18n("settings.speech.offlineTtsVoice.label")}</span>
                <select
                  bind:value={draftSpeech.offlineTtsVoice}
                  onchange={markDirty}
                  disabled={!draftSpeech.enabled}
                >
                  {#each OFFLINE_TTS_VOICE_OPTIONS as voice (voice)}
                    <option value={voice}>{voice}</option>
                  {/each}
                </select>
              </label>
              <p class="help" class:warn={!ttsStatus?.ready}>
                {#if ttsStatusLoading}
                  {$i18n("settings.speech.ttsStatus.loading")}
                {:else if ttsStatus?.ready}
                  {$i18n("settings.speech.ttsStatus.ready")}
                {:else}
                  {$i18n("settings.speech.ttsStatus.missing")} {ttsStatus?.download_hint ?? $i18n("settings.speech.ttsStatus.downloadHint")}
                {/if}
              </p>
              {/if}

              {#if isHybridSpeechSelected || isOfflineSpeechSelected}
              <label class="field">
                <span class="field-label">{$i18n("settings.speech.localAsrModel.label")}</span>
                <select
                  bind:value={draftSpeech.localAsrModel}
                  onchange={(event) => void handleLocalAsrModelChange(event.currentTarget.value as LocalAsrModel)}
                  disabled={!draftSpeech.enabled || asrDownloading}
                >
                  {#each LOCAL_ASR_MODEL_OPTIONS as model (model)}
                    <option value={model}>
                      {$i18n(`settings.speech.localAsrModel.${model}` as MessageKey)}
                    </option>
                  {/each}
                </select>
                {#if showOmnilingualGermanHint}
                  <p class="help warn">{$i18n("settings.speech.localAsrModel.omnilingualGermanHint")}</p>
                {/if}
              </label>
              {#if asrDownloading}
                <div class="asr-download">
                  <p class="help">
                    {#if asrDownloadPhase === "extracting"}
                      {$i18n("settings.speech.asrStatus.extracting")}
                    {:else}
                      {$i18n("settings.speech.asrStatus.downloading")}
                    {/if}
                  </p>
                  <progress class="asr-progress" value={asrDownloadProgress} max="100"></progress>
                  <span class="asr-progress-label">{Math.round(asrDownloadProgress)}%</span>
                </div>
              {:else if asrDownloadError}
                <p class="help warn">
                  {$i18n("settings.speech.asrStatus.downloadFailed")} {asrDownloadError}
                </p>
                <button
                  type="button"
                  class="ui-btn ui-btn-secondary asr-download-btn"
                  onclick={() => void ensureAsrModelDownload(draftSpeech.localAsrModel)}
                  disabled={!draftSpeech.enabled}
                >
                  {$i18n("settings.speech.asrStatus.downloadButton")}
                </button>
              {:else}
              <div class="help" class:warn={!asrStatus?.ready}>
                {#if asrStatusLoading}
                  {$i18n("settings.speech.asrStatus.loading")}
                {:else if asrStatus?.ready}
                  {$i18n(`settings.speech.asrStatus.ready.${draftSpeech.localAsrModel}` as MessageKey)}
                {:else}
                  <p class="asr-missing-text">{$i18n("settings.speech.asrStatus.missing")}</p>
                  <button
                    type="button"
                    class="ui-btn ui-btn-secondary asr-download-btn"
                    onclick={() => void ensureAsrModelDownload(draftSpeech.localAsrModel)}
                    disabled={!draftSpeech.enabled}
                  >
                    {$i18n("settings.speech.asrStatus.downloadButton")}
                  </button>
                {/if}
              </div>
              {/if}
              {/if}

              <label class="field">
                <span class="field-label">{$i18n("settings.speech.bargeInMode.label")}</span>
                <select
                  bind:value={draftSpeech.bargeInMode}
                  onchange={markDirty}
                  disabled={!draftSpeech.enabled}
                >
                  <option value="auto">{$i18n("settings.speech.bargeInMode.auto")}</option>
                  <option value="silero">{$i18n("settings.speech.bargeInMode.silero")}</option>
                  <option value="energy">{$i18n("settings.speech.bargeInMode.energy")}</option>
                </select>
                <p class="help">{$i18n("settings.speech.bargeInMode.help")}</p>
              </label>
            </section>

            {#if isGeminiSpeechSelected}
            <section class="ui-card">
              <div class="card-header">
                <h2>{$i18n("settings.speech.apiKey.title")}</h2>
                <p>
                  {$i18n("settings.speech.apiKeyHelp")}
                </p>
              </div>

              <p class="help">
                {$i18n("settings.speech.apiKey.freeKeyPrompt")}
                <button
                  type="button"
                  class="ui-btn ui-btn-link"
                  onclick={() => void openExternalUrl(GEMINI_API_KEY_URL)}
                >
                  {$i18n("settings.speech.apiKey.freeKeyLink")}
                </button>
              </p>

              <dl class="info-grid compact">
                <div>
                  <dt>{$i18n("settings.speech.apiKey.statusLabel")}</dt>
                  <dd>
                    <span class="ui-chip" data-tone={apiKeyStored ? "accepted" : "idle"}>
                      {apiKeyStored
                        ? $i18n("settings.speech.apiKey.stored")
                        : $i18n("settings.speech.apiKey.notStored")}
                    </span>
                  </dd>
                </div>
              </dl>

              <label class="field">
                <span class="field-label">{$i18n("settings.speech.apiKey.fieldLabel")}</span>
                <input
                  type="password"
                  bind:value={apiKeyInput}
                  placeholder={apiKeyStored
                    ? $i18n("settings.speech.apiKey.placeholderReplace")
                    : $i18n("settings.speech.apiKey.placeholderNew")}
                  autocomplete="off"
                />
              </label>

              {#if apiKeyMessage}
                <p
                  class="api-key-message"
                  class:success={apiKeyMessageTone === "success"}
                  class:error={apiKeyMessageTone === "error"}
                >
                  {apiKeyMessage}
                </p>
              {/if}

              <div class="action-row">
                <button
                  type="button"
                  class="ui-btn ui-btn-primary"
                  onclick={() => void handleSaveApiKey()}
                  disabled={apiKeyBusy}
                >
                  {$i18n("settings.speech.apiKey.save")}
                </button>
                <button
                  type="button"
                  class="ui-btn ui-btn-secondary"
                  onclick={() => void handleTestApiKey()}
                  disabled={apiKeyBusy}
                >
                  {$i18n("settings.speech.apiKey.test")}
                </button>
                <button
                  type="button"
                  class="ui-btn ui-btn-secondary ui-btn-danger"
                  onclick={() => void handleRemoveApiKey()}
                  disabled={apiKeyBusy || !apiKeyStored}
                >
                  {$i18n("settings.speech.apiKey.remove")}
                </button>
              </div>
            </section>
            {/if}
          {/if}

          {#if activeSection === "about"}
            <section class="ui-card">
              <div class="card-header">
                <h2>{$i18n("settings.about.title")}</h2>
              </div>

              <dl class="info-grid">
                <div>
                  <dt>{$i18n("settings.about.version.label")}</dt>
                  <dd>{appVersion}</dd>
                </div>
                <div>
                  <dt>{$i18n("settings.about.protocol.label")}</dt>
                  <dd><code>agodesk.v1</code></dd>
                </div>
                <div>
                  <dt>{$i18n("settings.about.endpoint.label")}</dt>
                  <dd><code>/api/agodesk/ws</code></dd>
                </div>
              </dl>

              <p class="help">{$i18n("settings.about.docsHelp")}</p>
            </section>
          {/if}
        </div>
      {/key}
    </div>
  </div>

  {#if dirty}
    <footer class="settings-footer">
      <span class="footer-copy">{$i18n("settings.footer.unsaved")}</span>
      <div class="footer-actions">
        <button
          type="button"
          class="ui-btn ui-btn-secondary"
          onclick={discardChanges}
          disabled={saving}
        >
          {$i18n("settings.footer.discard")}
        </button>
        <button
          type="button"
          class="ui-btn ui-btn-primary"
          onclick={() => void save()}
          disabled={saving}
        >
          {$i18n("settings.saveAndConnect")}
        </button>
      </div>
    </footer>
  {/if}
</div>

<style>
  .settings-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: transparent;
    overflow: hidden;
    border-radius: inherit;
  }

  .settings-header {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--glass-border);
    background: var(--glass-surface);
    backdrop-filter: blur(var(--blur));
    -webkit-backdrop-filter: blur(var(--blur));
    box-shadow: var(--shadow-1);
    flex-wrap: nowrap;
  }

  .header-body {
    flex: 1;
    align-self: stretch;
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .header-copy {
    min-width: 0;
  }

  .header-copy h1 {
    margin: 0;
    font-size: 1.25rem;
  }

  .header-copy p {
    margin: 0.2rem 0 0;
    color: var(--color-muted);
    font-size: 0.875rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .dirty-badge {
    font-size: 0.8125rem;
  }

  .settings-layout {
    display: grid;
    grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr);
    gap: var(--space-4);
    padding: var(--space-4);
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .settings-nav {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    overflow: auto;
    padding: var(--space-2);
    border-radius: var(--radius-xl);
    border: 1px solid var(--glass-border);
    background: var(--glass-surface-subtle, color-mix(in srgb, var(--glass-surface) 72%, transparent));
    backdrop-filter: blur(var(--blur));
    -webkit-backdrop-filter: blur(var(--blur));
    align-self: start;
    max-height: 100%;
  }

  .nav-item {
    display: grid;
    gap: 0.15rem;
    text-align: left;
    border: 1px solid transparent;
    border-radius: var(--radius-lg);
    padding: var(--space-3) var(--space-4);
    background: transparent;
    color: inherit;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .nav-item:hover {
    background: color-mix(in srgb, var(--color-accent) 8%, transparent);
  }

  .nav-item.active {
    border-color: color-mix(in srgb, var(--color-accent) 35%, var(--glass-border));
    background: color-mix(in srgb, var(--color-accent) 12%, transparent);
    box-shadow: var(--accent-glow);
  }

  .nav-label {
    font-weight: 600;
    font-size: 0.9375rem;
  }

  .nav-hint {
    font-size: 0.75rem;
    color: var(--color-muted);
  }

  .settings-content {
    overflow: auto;
    display: grid;
    gap: 1rem;
    align-content: start;
    padding-right: 0.25rem;
    padding-bottom: 0.5rem;
  }

  .section-panel {
    display: grid;
    gap: var(--space-4);
    align-content: start;
  }

  .card-header h2 {
    margin: 0;
    font-size: 1rem;
  }

  .card-header p {
    margin: 0.35rem 0 0;
    color: var(--color-muted);
    font-size: 0.875rem;
    line-height: 1.45;
  }

  .field {
    display: grid;
    gap: 0.45rem;
    margin-top: 1rem;
  }

  .field.compact {
    margin-top: 0;
  }

  .field-label {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .checkbox-field {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    margin-top: 1rem;
    cursor: pointer;
  }

  .checkbox-field.inline {
    margin-top: 0;
  }

  .checkbox-field input {
    margin-top: 0.15rem;
  }

  input[type="url"],
  input[type="text"],
  input[type="password"],
  input[type="number"],
  select {
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: 0.7rem 0.8rem;
    background: var(--color-input-bg);
    color: var(--color-text);
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  input[type="url"]:focus-visible,
  input[type="text"]:focus-visible,
  input[type="password"]:focus-visible,
  input[type="number"]:focus-visible,
  select:focus-visible {
    outline: none;
    border-color: color-mix(in srgb, var(--color-accent) 45%, var(--glass-border));
    box-shadow: var(--accent-glow);
  }

  input[type="range"] {
    width: 100%;
  }

  .help {
    margin: 0.75rem 0 0;
    font-size: 0.8125rem;
    color: var(--color-muted);
    line-height: 1.5;
  }

  .help.warn {
    color: var(--color-text);
    padding: 0.65rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--color-accent) 35%, var(--color-border));
    background: color-mix(in srgb, var(--color-accent) 8%, var(--color-input-bg));
  }

  .asr-download {
    margin-top: 0.75rem;
    display: grid;
    gap: 0.45rem;
  }

  .asr-progress {
    width: 100%;
    height: 0.45rem;
    accent-color: var(--color-accent);
  }

  .asr-progress-label {
    font-size: 0.75rem;
    color: var(--color-muted);
  }

  .asr-download-btn {
    margin-top: 0.65rem;
  }

  .asr-missing-text {
    margin: 0;
  }

  .preset-grid,
  .theme-grid,
  .locale-grid,
  .sound-theme-grid {
    display: grid;
    gap: 0.65rem;
    margin-top: 1rem;
  }

  .preset-grid {
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  }

  .theme-grid,
  .locale-grid {
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  }

  .sound-theme-grid {
    grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
  }

  .provider-fieldset {
    border: none;
    margin: var(--space-3) 0 0;
    padding: 0;
  }

  .provider-fieldset legend {
    font-size: 0.8125rem;
    font-weight: 600;
    margin-bottom: var(--space-2);
  }

  .provider-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--space-2);
  }

  .provider-card input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .provider-title {
    font-weight: 600;
    font-size: 0.875rem;
  }

  .provider-hint {
    font-size: 0.75rem;
    color: var(--color-muted);
    line-height: 1.4;
  }

  .preset-card,
  .theme-card,
  .locale-card,
  .sound-theme-card,
  .provider-card {
    display: grid;
    gap: 0.25rem;
    text-align: left;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
    background: color-mix(in srgb, var(--glass-surface) 80%, transparent);
    cursor: pointer;
    color: inherit;
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast),
      background var(--transition-fast);
  }

  .preset-card.selected,
  .theme-card.selected,
  .locale-card.selected,
  .sound-theme-card.selected,
  .provider-card.selected {
    border-color: color-mix(in srgb, var(--color-accent) 45%, var(--glass-border));
    background: color-mix(in srgb, var(--color-accent) 10%, var(--color-input-bg));
    box-shadow: var(--accent-glow);
  }

  .preset-card span:last-child,
  .theme-card span:last-child {
    font-size: 0.8125rem;
    color: var(--color-muted);
  }

  .theme-card input,
  .locale-card input,
  .sound-theme-card input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .theme-icon {
    font-size: 1.25rem;
  }

  .sound-preview-btn {
    justify-self: start;
    margin-top: 0.25rem;
  }

  .limits-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .file-roots-list {
    list-style: none;
    margin: 1rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }

  .file-root-row {
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
    background: color-mix(in srgb, var(--glass-surface) 80%, transparent);
    display: grid;
    gap: var(--space-3);
  }

  .file-root-fields {
    display: grid;
    gap: 0.65rem;
  }

  .file-root-perms {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    align-items: center;
  }

  .path-display {
    display: block;
    padding: 0.55rem 0.65rem;
    border-radius: var(--radius-md);
    background: var(--glass-surface);
    border: 1px solid var(--glass-border);
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 0.85rem 1rem;
    margin: 1rem 0 0;
  }

  .info-grid.compact {
    margin-top: 0.75rem;
  }

  .info-grid dt {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted);
    margin-bottom: 0.2rem;
  }

  .info-grid dd {
    margin: 0;
    font-size: 0.9375rem;
  }

  .back-button {
    flex-shrink: 0;
  }

  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }

  .error-box {
    margin: var(--space-4) 0 0;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-system-bg);
    color: var(--color-system-text);
    font-size: 0.875rem;
  }

  .api-key-message {
    margin: var(--space-3) 0 0;
    font-size: 0.875rem;
  }

  .api-key-message.success {
    color: var(--color-success, #15803d);
  }

  .api-key-message.error {
    color: var(--color-danger);
  }

  .settings-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--glass-border);
    background: var(--glass-surface);
    backdrop-filter: blur(var(--blur));
    border-radius: 0 0 var(--radius-window) var(--radius-window);
    -webkit-backdrop-filter: blur(var(--blur));
    box-shadow: var(--shadow-1);
    flex-wrap: wrap;
  }

  .footer-copy {
    font-size: 0.875rem;
    color: var(--color-muted);
  }

  .footer-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  code {
    font-family: Consolas, "Courier New", monospace;
    font-size: 0.8125rem;
  }

  @media (max-width: 820px) {
    .settings-layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }

    .settings-nav {
      flex-direction: row;
      overflow-x: auto;
      padding-bottom: 0.25rem;
    }

    .nav-item {
      min-width: 8.5rem;
      flex: 0 0 auto;
    }

    .nav-hint {
      display: none;
    }
  }
</style>
