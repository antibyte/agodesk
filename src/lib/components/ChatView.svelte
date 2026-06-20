<script lang="ts">
  import { get } from "svelte/store";
  import { onDestroy, onMount } from "svelte";
  import InputBox from "./InputBox.svelte";
  import MessageList from "./MessageList.svelte";
  import StatusBar from "./StatusBar.svelte";
  import type { Component } from "svelte";
  import type { SettingsSavePayload } from "./SettingsView.svelte";
  import PairingBanner from "./PairingBanner.svelte";
  import RemoteControlBanner from "./RemoteControlBanner.svelte";
  import ShellApprovalBanner from "./ShellApprovalBanner.svelte";
  import UpdateBanner from "./UpdateBanner.svelte";
  import ChatPlanFloatingPanel from "./ChatPlanFloatingPanel.svelte";
  import ChatHistoryPanel from "./ChatHistoryPanel.svelte";
  import IntegrationsPanel from "./IntegrationsPanel.svelte";
  import SystemWarningsPanel from "./SystemWarningsPanel.svelte";
  import {
    closeIntegrationEmbed,
    isIntegrationEmbedAvailable,
    isIntegrationPreviewOpen,
    openIntegrationPreview,
  } from "../services/integration-embed";
  import SpeechBanner from "./SpeechBanner.svelte";
  import { chatMessages } from "../stores/chat";
  import { settings } from "../stores/settings";
  import { sessionState } from "../stores/session";
  import { connectionStatus } from "../stores/connection";
  import { speechState } from "../stores/speech";
  import { i18n } from "../i18n";
  import { getTranslateFn } from "../i18n/store";
  import type { MessageKey } from "../i18n/types";
  import { toastService } from "../services/toast";
  import { getAppVersion } from "../services/get-app-version";
  import {
    checkForUpdates,
    dismissUpdate,
    installUpdate,
    isUpdateBannerVisible,
    updateState,
  } from "../services/update-flow";
  import { loadSettings, saveSettings } from "../services/settings";
  import { applyOpenPetsSettings } from "../services/openpets-flow";
  import { openPetsContext } from "../stores/openpets-context";
  import { cycleTheme, destroyThemeListener } from "../services/theme";
  import { saveTrustedCertificate } from "../services/tls";
  import { openExternalUrl } from "../services/open-external-url";
  import { applyMinimizeToTraySetting } from "../services/tray";
  import { applyShowWindowHotkey } from "../services/show-window-hotkey";
  import {
    sendChatMessageWithConversation,
    stopActiveChatRequest,
  } from "../services/chat-outbound";
  import {
    createNewChatConversation,
    loadChatConversation,
  } from "../services/chat-conversation-flow";
  import { chatConversationState } from "../stores/chat-conversation";
  import { chatMediaState } from "../stores/chat-media-state";
  import {
    refreshIntegrationsWebhosts,
    refreshSystemWarnings,
  } from "../services/agodesk-features-bootstrap";
  import {
    buildSystemWarningAcknowledgeMessage,
    initSystemWarningsPersist,
    recordAllSystemWarningAcknowledgements,
    recordSystemWarningAcknowledgement,
  } from "../services/system-warnings-flow";
  import { deliverSpeechTranscript } from "../services/speech-delivery";
  import { stopSpeechSession, toggleSpeechSession } from "../services/speech-flow";
  import { interruptLocalSpeechPlayback } from "../services/local-speech-tts";
  import { stopAllChatAssistantTts } from "../services/chat-audio";
  import {
    notifyAuraGoVoiceOutputStatus,
    resolveChatSpeakerMode,
  } from "../services/chat-voice-output-status";
  import { isDevAsrPlaceholder, parseDevAsrDurationMs } from "../services/speech-sidecar";
  import type { SpeechToolContext } from "../services/speech-tool-router";
  import {
    retryStoredPairing,
    sendPairingSessionStart,
    unpairDevice,
    handleSessionError,
  } from "../services/session-flow";
  import {
    clearRemoteControlState,
    flushPendingInputCommands,
    rejectPendingInputCommands,
  } from "../services/desktop-flow";
  import {
    approvePendingShellCommand,
    denyPendingShellCommands,
    shellApprovalState,
  } from "../services/shell-flow";
  import { controlPermissionStatus, setInputApproval } from "../services/desktop";
  import { playUiSound } from "../services/ui-sounds";
  import {
    createChatWsInboundContext,
    createSystemMessageAppender,
    handleChatWsMessage,
  } from "../services/chat-ws-inbound";
  import { connectChatWebSocket, createWebSocketService } from "../services/chat-ws-connect";
  import { isChatError } from "../services/websocket";
  import { chatPlanState, isChatPlanPanelVisible } from "../stores/chat-plan";
  import { agentMoodState } from "../stores/agent-mood";
  import type {
    AppSettings,
    CertificateProbeResult,
    ClientErrorCode,
    WsMessage,
  } from "../types/protocol";
  import {
    canSendChat,
    hasAdvertisedChatSessions,
    hasAdvertisedChatMediaEvents,
    hasAdvertisedChatMediaUpload,
    canUseChatAttachments,
    hasAdvertisedIntegrationsWebhosts,
    hasAdvertisedPlanUpdates,
    hasAdvertisedRemoteDesktopCapture,
    hasAdvertisedSystemWarnings,
    isTlsFatalError,
    speechProviderRequiresGeminiApiKey,
  } from "../types/protocol";

  let pending = $state(false);
  let SettingsViewLazy = $state<Component | null>(null);
  let CertificateTrustModalLazy = $state<Component | null>(null);
  let IntegrationEmbedModalLazy = $state<Component | null>(null);
  let SpeechBackgroundVisualizerLazy = $state<Component | null>(null);
  let settingsOpen = $state(false);
  let settingsInitialSection = $state<
    | "connection"
    | "device"
    | "appearance"
    | "openpets"
    | "language"
    | "desktop"
    | "files"
    | "speech"
    | "about"
    | undefined
  >(undefined);
  let pairingBusy = $state(false);
  let pairingFocusRequest = $state(0);
  let planDismissed = $state(false);
  let remoteOperation = $state("");
  let certModalOpen = $state(false);
  let tlsErrorCode = $state<ClientErrorCode | null>(null);
  let composerDraft = $state("");
  let embedModalOpen = $state(false);
  let embedModalUrl = $state("");
  let embedModalTitle = $state("");
  let appVersion = $state("0.1.0");
  const integrationPreviewNative = isIntegrationEmbedAvailable();
  let wsService = createWebSocketService();
  let prevConnection: typeof $connectionStatus | null = null;

  const chatConversationReady = $derived(
    !hasAdvertisedChatSessions($sessionState.advertisedCapabilities) ||
      Boolean($chatConversationState.activeConversationId) ||
      $chatConversationState.legacyChatMode,
  );

  const chatSpeakerEnabled = $derived(resolveChatSpeakerMode($settings));

  const chatAllowed = $derived(
    canSendChat($sessionState.status, $connectionStatus, $sessionState.sessionId) &&
      !pending &&
      chatConversationReady,
  );

  const stopVisible = $derived($chatConversationState.requestInFlight);

  const historyEnabled = $derived(hasAdvertisedChatSessions($sessionState.advertisedCapabilities));

  const mediaEnabled = $derived(hasAdvertisedChatMediaEvents($sessionState.advertisedCapabilities));

  const attachmentsEnabled = $derived(
    hasAdvertisedChatMediaUpload($sessionState.advertisedCapabilities),
  );

  const attachmentsFullyNegotiated = $derived(
    canUseChatAttachments($sessionState.advertisedCapabilities),
  );

  const attachmentLimits = $derived($sessionState.attachmentLimits);

  const integrationsEnabled = $derived(
    hasAdvertisedIntegrationsWebhosts($sessionState.advertisedCapabilities),
  );

  const warningsEnabled = $derived(
    hasAdvertisedSystemWarnings($sessionState.advertisedCapabilities),
  );

  const activeMediaItems = $derived.by(() => {
    const conversationId = $chatConversationState.activeConversationId;
    if (!conversationId) {
      return [];
    }
    return $chatMediaState.mediaByConversation.get(conversationId) ?? [];
  });

  const streamingActive = $derived($chatMessages.some((message) => message.streaming === true));

  const speechAllowed = $derived($settings.speech.enabled);

  const remoteBannerVisible = $derived(
    $settings.desktopControlEnabled &&
      ($sessionState.remoteControlPending || $sessionState.remoteControlActive),
  );

  const shellBannerVisible = $derived($shellApprovalState.pending && $shellApprovalState.request !== null);

  const updateBannerVisible = $derived(isUpdateBannerVisible($updateState));

  const chatPlanVisible = $derived(
    hasAdvertisedPlanUpdates($sessionState.advertisedCapabilities) &&
      isChatPlanPanelVisible($chatPlanState.plan) &&
      !planDismissed,
  );

  const headerPanelOpen = $derived(
    $chatConversationState.historyOpen ||
      $chatMediaState.integrationsOpen ||
      $chatMediaState.warningsOpen,
  );

  const bannerStackCompact = $derived(
    remoteBannerVisible ||
      shellBannerVisible ||
      $sessionState.status === "awaiting_pairing" ||
      $sessionState.status === "error" ||
      $sessionState.status === "pairing" ||
      chatPlanVisible,
  );

  const inputHint = $derived.by(() => {
    const t = getTranslateFn();
    if (certModalOpen) {
      return t("chatView.hint.tlsRequired");
    }
    if ($connectionStatus !== "connected") {
      return t("chatView.hint.noConnection");
    }
    if ($sessionState.status === "awaiting_pairing") {
      return t("chatView.hint.pairRequired");
    }
    if ($sessionState.status === "pairing") {
      return t("chatView.hint.authenticating");
    }
    if ($sessionState.status === "error") {
      return $sessionState.errorMessage || t("chatView.hint.sessionError");
    }
    if (pending) {
      return t("chatView.hint.awaitingResponse");
    }
    if (hasAdvertisedChatSessions($sessionState.advertisedCapabilities) && !chatConversationReady) {
      return t("chatView.hint.conversationLoading");
    }
    if (attachmentsEnabled && !attachmentsFullyNegotiated) {
      return t("inputBox.attachments.negotiationPending");
    }
    return "";
  });

  function addSystemMessage(
    key: MessageKey,
    params?: Record<string, string | number>,
    tone: "info" | "success" | "error" = "info",
  ): void {
    createSystemMessageAppender()(key, params, tone);
  }

  function createDesktopResultSender() {
    return async (resultMessage: WsMessage) => {
      await wsService.send(resultMessage);
    };
  }

  function handleTlsError(code: ClientErrorCode): void {
    if (!isTlsFatalError(code)) {
      return;
    }
    tlsErrorCode = code;
    certModalOpen = true;
  }

  function resetPlanAndMoodState(): void {
    chatPlanState.reset();
    agentMoodState.reset();
  }

  function setPendingState(value: boolean): void {
    pending = value;
    openPetsContext.setPending(value);
  }

  function createWsInboundContext() {
    return createChatWsInboundContext(wsService, $settings.serverUrl, {
      addSystemMessage,
      setPending: setPendingState,
      setPairingBusy: (value) => {
        pairingBusy = value;
      },
      setComposerDraft: (value) => {
        composerDraft = value;
      },
      setRemoteOperation: (value) => {
        remoteOperation = value;
        openPetsContext.setRemoteOperation(value);
      },
      resetPlanAndMoodState,
      wsSend: (message) => wsService.send(message),
    });
  }

  async function handleIncomingMessage(message: WsMessage): Promise<void> {
    await handleChatWsMessage(message, createWsInboundContext());
    if (isChatError(message)) {
      openPetsContext.markRequestFailed();
    }
  }

  async function connect(url: string, options?: { pinnedFingerprint?: string }): Promise<void> {
    certModalOpen = false;
    tlsErrorCode = null;
    pending = false;
    openPetsContext.reset();

    await wsService.disconnect().catch(() => {});
    wsService = createWebSocketService();

    try {
      await connectChatWebSocket(wsService, {
        url,
        pinnedFingerprint: options?.pinnedFingerprint,
        onMessage: handleIncomingMessage,
        onTlsError: handleTlsError,
        onConnectionError: (message) => {
          chatMessages.addMessage({
            id: crypto.randomUUID(),
            role: "system",
            text: message,
            timestamp: new Date().toISOString(),
            tone: "error",
          });
        },
      });
    } catch (error) {
      addSystemMessage("chatView.error.connectFailed", undefined, "error");
      void error;
    }
  }

  async function handleInstallUpdate(): Promise<void> {
    try {
      await installUpdate();
    } catch {
      toastService.show({
        type: "error",
        message: getTranslateFn()("update.toast.failed"),
      });
    }
  }

  async function init(): Promise<void> {
    appVersion = await getAppVersion();
    await initSystemWarningsPersist();
    void checkForUpdates({ silent: true });

    const loaded = await loadSettings();
    await applyOpenPetsSettings(loaded.openPets);
    await applyMinimizeToTraySetting(loaded.minimizeToTray);
    await applyShowWindowHotkey(loaded.showWindowHotkey);
    await connect(loaded.serverUrl);
  }

  async function handleSaveSettings(next: AppSettings): Promise<void> {
    const previous = get(settings);
    const previousSpeakerMode = resolveChatSpeakerMode(previous);
    const nextSpeakerMode = resolveChatSpeakerMode(next);

    if (!nextSpeakerMode && previousSpeakerMode !== nextSpeakerMode) {
      stopAllChatAssistantTts();
      interruptLocalSpeechPlayback();
    }

    await saveSettings(next);
    await applyOpenPetsSettings(next.openPets);
    await applyMinimizeToTraySetting(next.minimizeToTray);
    const hotkeyResult = await applyShowWindowHotkey(next.showWindowHotkey);
    if (!hotkeyResult.ok) {
      toastService.show({
        type: "error",
        message: getTranslateFn()("chatView.error.showWindowHotkey"),
      });
    }

    if (previousSpeakerMode !== nextSpeakerMode) {
      const reason = nextSpeakerMode ? "user_enabled" : "user_disabled";
      await notifyAuraGoVoiceOutputStatus(wsService, reason, nextSpeakerMode);
    }

    if (!next.speech.enabled) {
      await stopSpeechSession();
    }
    if (!next.desktopControlEnabled) {
      await setInputApproval(false).catch(() => {});
      clearRemoteControlState();
      await rejectPendingInputCommands(createDesktopResultSender(), {
        sessionId: $sessionState.sessionId,
        deviceId: $sessionState.deviceId,
      }).catch(() => {});
    }
    if (!next.shellAccess.enabled || next.shellAccess.allowedCwds.length === 0) {
      await denyPendingShellCommands(createDesktopResultSender(), {
        sessionId: $sessionState.sessionId,
        deviceId: $sessionState.deviceId,
      }).catch(() => {});
    }
    await connect(next.serverUrl);
  }

  function ensureSettingsView(): void {
    if (SettingsViewLazy) {
      return;
    }
    void import("./SettingsView.svelte").then((mod) => {
      SettingsViewLazy = mod.default;
    });
  }

  function ensureCertificateTrustModal(): void {
    if (CertificateTrustModalLazy) {
      return;
    }
    void import("./CertificateTrustModal.svelte").then((mod) => {
      CertificateTrustModalLazy = mod.default;
    });
  }

  function ensureIntegrationEmbedModal(): void {
    if (IntegrationEmbedModalLazy) {
      return;
    }
    void import("./IntegrationEmbedModal.svelte").then((mod) => {
      IntegrationEmbedModalLazy = mod.default;
    });
  }

  function ensureSpeechBackgroundVisualizer(): void {
    if (SpeechBackgroundVisualizerLazy) {
      return;
    }
    void import("./SpeechBackgroundVisualizer.svelte").then((mod) => {
      SpeechBackgroundVisualizerLazy = mod.default;
    });
  }

  $effect(() => {
    if (certModalOpen) {
      ensureCertificateTrustModal();
    }
    if (embedModalOpen && !integrationPreviewNative) {
      ensureIntegrationEmbedModal();
    }
    if ($speechState.isActive) {
      ensureSpeechBackgroundVisualizer();
    }
  });

  function openSettings(section?: typeof settingsInitialSection): void {
    settingsInitialSection = section;
    ensureSettingsView();
    settingsOpen = true;
  }

  function closeAllHeaderPanels(): void {
    chatConversationState.setHistoryOpen(false);
    chatMediaState.setIntegrationsOpen(false);
    chatMediaState.setWarningsOpen(false);
  }

  function handlePairDevice(): void {
    if ($sessionState.status === "awaiting_pairing") {
      pairingFocusRequest += 1;
      return;
    }
    openSettings("device");
  }

  async function handleToggleTheme(): Promise<void> {
    const nextTheme = cycleTheme($settings.theme);
    await saveSettings({ ...$settings, theme: nextTheme });
  }

  async function handleToggleVoiceOutput(): Promise<void> {
    const current = get(settings);
    const nextSpeakerMode = !current.chatSpeakerMode;
    if (!nextSpeakerMode) {
      stopAllChatAssistantTts();
      interruptLocalSpeechPlayback();
    }
    playUiSound("notice");
    await notifyAuraGoVoiceOutputStatus(
      wsService,
      nextSpeakerMode ? "user_enabled" : "user_disabled",
      nextSpeakerMode,
    );
    await saveSettings({
      ...current,
      chatSpeakerMode: nextSpeakerMode,
    });
  }

  async function handlePair(token: string): Promise<void> {
    pairingBusy = true;
    try {
      await sendPairingSessionStart(wsService, token, $settings.serverUrl);
    } catch (error) {
      pairingBusy = false;
      await handleSessionError(
        error instanceof Error ? error.message : getTranslateFn()("chatView.error.pairingFailed"),
      );
    }
  }

  async function handleRetryPairing(): Promise<void> {
    pairingBusy = true;
    try {
      await retryStoredPairing(wsService, $settings.serverUrl);
    } catch (error) {
      pairingBusy = false;
      await handleSessionError(
        error instanceof Error ? error.message : getTranslateFn()("chatView.error.reconnectFailed"),
      );
    }
  }

  async function handleUnpair(): Promise<void> {
    await unpairDevice($settings.serverUrl);
    await connect($settings.serverUrl);
  }

  async function handleTrustCertificate(probe: CertificateProbeResult): Promise<void> {
    await saveTrustedCertificate(probe.origin, {
      sha256_fingerprint: probe.sha256_fingerprint,
      trusted_at: new Date().toISOString(),
      subject: probe.subject,
    });
    certModalOpen = false;
    tlsErrorCode = null;
    await connect($settings.serverUrl, {
      pinnedFingerprint: probe.sha256_fingerprint,
    });
  }

  function handleOpenBrowser(url: string): void {
    void openExternalUrl(url);
  }

  function buildSpeechToolContext(): SpeechToolContext {
    return {
      sessionId: $sessionState.sessionId,
      connectionStatus: $connectionStatus,
      sessionStatus: $sessionState.status,
      remoteControlActive: $sessionState.remoteControlActive,
      remoteControlPending: $sessionState.remoteControlPending,
      canSendChat: chatAllowed,
      desktopControlEnabled: $settings.desktopControlEnabled,
      browserControlEnabled: $settings.browserControlEnabled,
      getDesktopPermissionStatus: async () =>
        (await controlPermissionStatus()) as unknown as Record<string, unknown>,
      sendToAuraGo: async (text) => {
        await sendChatMessageWithConversation(wsService, $sessionState.sessionId, text);
      },
      onStopListening: () => stopSpeechSession(),
      onSystemNotice: (text) => {
        chatMessages.addMessage({
          id: crypto.randomUUID(),
          role: "system",
          text,
          timestamp: new Date().toISOString(),
        });
      },
    };
  }

  async function handleSpeechTranscript(text: string): Promise<void> {
    const localProvider = !speechProviderRequiresGeminiApiKey($settings.speech.provider);
    if ($settings.speech.agentMode && !localProvider) {
      return;
    }

    if (isDevAsrPlaceholder(text)) {
      const durationMs = parseDevAsrDurationMs(text);
      addSystemMessage(
        "speechDelivery.devAsrNotice",
        { duration: String(durationMs ?? "?") },
        "info",
      );
      return;
    }

    try {
      await deliverSpeechTranscript(text, {
        autoSendToAuraGo: $settings.speech.autoSendToAuraGo,
        canSendChat: chatAllowed,
        sessionId: $sessionState.sessionId,
        sendMessage: (message) => wsService.send(message),
        onComposerDraft: (draft) => {
          composerDraft = draft;
        },
        onSystemNotice: (notice) => {
          chatMessages.addMessage({
            id: crypto.randomUUID(),
            role: "system",
            text: notice,
            timestamp: new Date().toISOString(),
          });
        },
        onPending: () => {
          setPendingState(true);
        },
      });
    } catch (error) {
      toastService.show({
        type: "error",
        message: getTranslateFn()("chatView.error.speechTranscriptFailed"),
      });
      void error;
    }
  }

  async function handleSpeechToggle(): Promise<void> {
    await toggleSpeechSession($settings.speech, {
      onFinalTranscript: (text) => handleSpeechTranscript(text),
      getToolContext: () => buildSpeechToolContext(),
      getAgentContext: () => ({
        connectionStatus: $connectionStatus,
        sessionStatus: $sessionState.status,
        remoteControlActive: $sessionState.remoteControlActive,
        remoteControlPending: $sessionState.remoteControlPending,
        canSendChat: chatAllowed,
      }),
      onAssistantText: (text) => {
        chatMessages.addMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          text,
          timestamp: new Date().toISOString(),
        });
        playUiSound("receive");
      },
      onBargeIn: () => {
        // POC: give a small audible/tactile cue that the interruption was registered
        playUiSound("receive");
        // The core interrupt + state reset happens inside speech-flow / detector
      },
    });
  }

  async function handleApproveRemote(): Promise<void> {
    try {
      await setInputApproval(true);
      sessionState.setRemoteControlActive(true);
      sessionState.setRemoteControlPending(false);
      const hasCapture = hasAdvertisedRemoteDesktopCapture($sessionState.advertisedCapabilities);
      addSystemMessage(
        hasCapture
          ? "chatView.remoteControl.approvedWithCapture"
          : "chatView.remoteControl.approvedNoCapture",
        undefined,
        "success",
      );
      await flushPendingInputCommands(createDesktopResultSender(), true, {
        sessionId: $sessionState.sessionId,
        deviceId: $sessionState.deviceId,
      });
    } catch {
      addSystemMessage("chatView.error.localApprovalFailed", undefined, "error");
    }
  }

  async function handleDenyRemote(): Promise<void> {
    await setInputApproval(false);
    sessionState.setRemoteControlPending(false);
    sessionState.setRemoteControlActive(false);
    await rejectPendingInputCommands(createDesktopResultSender(), {
      sessionId: $sessionState.sessionId,
      deviceId: $sessionState.deviceId,
    });
  }

  async function handleStopRemote(): Promise<void> {
    await setInputApproval(false);
    sessionState.setRemoteControlActive(false);
    sessionState.setRemoteControlPending(false);
    await rejectPendingInputCommands(createDesktopResultSender(), {
      sessionId: $sessionState.sessionId,
      deviceId: $sessionState.deviceId,
    });
  }

  async function handleApproveShell(): Promise<void> {
    try {
      await approvePendingShellCommand();
      addSystemMessage("chatView.shellApproval.approved", undefined, "success");
    } catch {
      addSystemMessage("chatView.error.shellApprovalFailed", undefined, "error");
    }
  }

  async function handleDenyShell(): Promise<void> {
    await denyPendingShellCommands(createDesktopResultSender(), {
      sessionId: $sessionState.sessionId,
      deviceId: $sessionState.deviceId,
    });
    addSystemMessage("chatView.shellApproval.denied", undefined, "info");
  }

  async function handleStopSessionFromShell(): Promise<void> {
    await denyPendingShellCommands(createDesktopResultSender(), {
      sessionId: $sessionState.sessionId,
      deviceId: $sessionState.deviceId,
    });
    await wsService.disconnect();
    addSystemMessage("chatView.shellApproval.sessionStopped", undefined, "info");
  }

  async function handleSubmit(text: string, files?: File[]): Promise<void> {
    if (!chatAllowed) {
      return;
    }
    try {
      await sendChatMessageWithConversation(wsService, $sessionState.sessionId, text, { files });
      setPendingState(true);
      playUiSound("send");
    } catch (error) {
      setPendingState(false);
      openPetsContext.markRequestFailed();
      chatMessages.addMessage({
        id: crypto.randomUUID(),
        role: "system",
        text:
          error instanceof Error
            ? error.message
            : getTranslateFn()("chatView.error.messageSendFailed"),
        timestamp: new Date().toISOString(),
        tone: "error",
      });
    }
  }

  async function handleStopRequest(): Promise<void> {
    setPendingState(false);
    await stopActiveChatRequest(wsService);
  }

  async function handleNewChat(): Promise<void> {
    if (!historyEnabled || !$sessionState.sessionId) {
      return;
    }
    chatConversationState.setHistoryOpen(false);
    await createNewChatConversation(wsService, $sessionState.sessionId);
  }

  async function handleLoadConversation(conversationId: string): Promise<void> {
    if (!$sessionState.sessionId) {
      return;
    }
    chatConversationState.setHistoryOpen(false);
    await loadChatConversation(wsService, $sessionState.sessionId, conversationId);
  }

  function handleToggleHistory(): void {
    const next = !$chatConversationState.historyOpen;
    chatConversationState.setHistoryOpen(next);
    if (next) {
      chatMediaState.setIntegrationsOpen(false);
      chatMediaState.setWarningsOpen(false);
    }
  }

  function handleToggleIntegrations(): void {
    const next = !$chatMediaState.integrationsOpen;
    chatMediaState.setIntegrationsOpen(next);
    if (next) {
      chatConversationState.setHistoryOpen(false);
      chatMediaState.setWarningsOpen(false);
      void refreshIntegrationsWebhosts(wsService);
    }
  }

  function handleToggleWarnings(): void {
    const next = !$chatMediaState.warningsOpen;
    chatMediaState.setWarningsOpen(next);
    if (next) {
      chatConversationState.setHistoryOpen(false);
      chatMediaState.setIntegrationsOpen(false);
      void refreshSystemWarnings(wsService);
    }
  }

  function handleOpenEmbedded(url: string, title?: string): void {
    if (integrationPreviewNative) {
      void openIntegrationPreview(url, title).then((opened) => {
        if (!opened) {
          void openExternalUrl(url);
        }
      });
      return;
    }
    embedModalUrl = url;
    embedModalTitle = title ?? "";
    embedModalOpen = true;
  }

  async function handleAcknowledgeWarning(id: string): Promise<void> {
    if (!$sessionState.sessionId) {
      return;
    }
    await recordSystemWarningAcknowledgement($settings.serverUrl, id);
    await wsService.send(buildSystemWarningAcknowledgeMessage($sessionState.sessionId, { id }));
  }

  async function handleAcknowledgeAllWarnings(): Promise<void> {
    if (!$sessionState.sessionId) {
      return;
    }
    const ids = $chatMediaState.systemWarnings.map((warning) => warning.id);
    await recordAllSystemWarningAcknowledgements($settings.serverUrl, ids);
    await wsService.send(
      buildSystemWarningAcknowledgeMessage($sessionState.sessionId, { all: true }),
    );
  }

  $effect(() => {
    const conn = $connectionStatus;
    const prev = prevConnection;
    if (prev === "connected" && conn !== "connected" && pending) {
      setPendingState(false);
      toastService.show({
        type: "error",
        message: getTranslateFn()("chatView.connectionLost"),
      });
    }
    prevConnection = conn;
  });

  $effect(() => {
    void $chatPlanState.requestId;
    planDismissed = false;
  });

  // Centralized Escape handling (priority: cert > embed > panels > settings)
  $effect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (certModalOpen) {
        e.preventDefault();
        certModalOpen = false;
      } else if (embedModalOpen) {
        e.preventDefault();
        embedModalOpen = false;
      } else if (integrationPreviewNative && isIntegrationPreviewOpen()) {
        e.preventDefault();
        void closeIntegrationEmbed();
      } else if (headerPanelOpen) {
        e.preventDefault();
        closeAllHeaderPanels();
      } else if (settingsOpen) {
        e.preventDefault();
        settingsOpen = false;
        settingsInitialSection = undefined;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  onMount(() => {
    void init();
  });

  onDestroy(() => {
    void wsService.disconnect();
    void stopSpeechSession();
    destroyThemeListener();
  });
</script>

<div class="app-shell">
  <RemoteControlBanner
    visible={remoteBannerVisible}
    pending={$sessionState.remoteControlPending}
    active={$sessionState.remoteControlActive}
    operation={remoteOperation}
    onApprove={() => void handleApproveRemote()}
    onDeny={() => void handleDenyRemote()}
    onStop={() => void handleStopRemote()}
  />

  <ShellApprovalBanner
    visible={shellBannerVisible}
    command={$shellApprovalState.request?.command ?? ""}
    cwdLabel={$shellApprovalState.request?.cwdLabel ?? ""}
    cwdDisplay={$shellApprovalState.request?.cwdDisplay ?? ""}
    timeoutMs={$shellApprovalState.request?.timeoutMs ?? 0}
    onApprove={() => void handleApproveShell()}
    onDeny={() => void handleDenyShell()}
    onStopSession={() => void handleStopSessionFromShell()}
  />

  <UpdateBanner
    visible={updateBannerVisible}
    version={$updateState.version ?? ""}
    notes={$updateState.notes ?? ""}
    status={$updateState.status}
    progress={$updateState.progress ?? 0}
    onInstall={() => void handleInstallUpdate()}
    onDismiss={() => dismissUpdate()}
  />

  {#if settingsOpen}
    {#if SettingsViewLazy}
      <SettingsViewLazy
        initialSection={settingsInitialSection}
        serverUrl={$settings.serverUrl}
        theme={$settings.theme}
        locale={$settings.locale}
        speech={$settings.speech}
        uiSounds={$settings.uiSounds}
        minimizeToTray={$settings.minimizeToTray}
        showWindowHotkey={$settings.showWindowHotkey}
        desktopControlEnabled={$settings.desktopControlEnabled}
        browserControlEnabled={$settings.browserControlEnabled}
        fileAccess={$settings.fileAccess}
        shellAccess={$settings.shellAccess}
        chatTtsMode={$settings.chatTtsMode}
        openPets={$settings.openPets}
        connectionStatus={$connectionStatus}
        sessionStatus={$sessionState.status}
        sessionId={$sessionState.sessionId}
        sessionError={$sessionState.errorMessage}
        advertisedCapabilities={$sessionState.advertisedCapabilities}
        remoteControlActive={$sessionState.remoteControlActive}
        appVersion={appVersion}
        onBack={() => {
          settingsOpen = false;
          settingsInitialSection = undefined;
        }}
        onSave={async (next: SettingsSavePayload) => {
          await handleSaveSettings({ ...get(settings), ...next });
        }}
        onReconnect={() => void connect($settings.serverUrl)}
        onRetryPairing={() => void handleRetryPairing()}
        onUnpair={() => void handleUnpair()}
        onOpenTlsTrust={() => {
          certModalOpen = true;
        }}
      />
    {:else}
      <div class="settings-loading" aria-busy="true">
        {$i18n("settings.title")}
      </div>
    {/if}
  {:else}
    <div class="chat-view">
      {#if SpeechBackgroundVisualizerLazy}
        <SpeechBackgroundVisualizerLazy
          active={$speechState.isActive}
          status={$speechState.status}
        />
      {/if}
      <div class="chat-header-area">
        {#if headerPanelOpen}
          <button
            type="button"
            class="header-panel-backdrop"
            aria-label={$i18n("common.close")}
            onclick={closeAllHeaderPanels}
          ></button>
        {/if}
        <StatusBar
          serverUrl={$settings.serverUrl}
          theme={$settings.theme}
          sessionStatus={$sessionState.status}
          connectionStatus={$connectionStatus}
          advertisedCapabilities={$sessionState.advertisedCapabilities}
          desktopControlEnabled={$settings.desktopControlEnabled}
          minimizeToTray={$settings.minimizeToTray}
          voiceResponsesEnabled={chatSpeakerEnabled}
          {historyEnabled}
          historyActive={$chatConversationState.historyOpen}
          {integrationsEnabled}
          integrationsActive={$chatMediaState.integrationsOpen}
          integrationsCount={$chatMediaState.integrationWebhosts.length}
          {warningsEnabled}
          warningsActive={$chatMediaState.warningsOpen}
          warningsUnacknowledged={$chatMediaState.warningUnacknowledged}
          onOpenSettings={() => openSettings()}
          onReconnect={() => void connect($settings.serverUrl)}
          onToggleTheme={() => void handleToggleTheme()}
          onToggleVoiceOutput={() => void handleToggleVoiceOutput()}
          onToggleHistory={handleToggleHistory}
          onToggleIntegrations={handleToggleIntegrations}
          onToggleWarnings={handleToggleWarnings}
        />

        <ChatHistoryPanel
          visible={historyEnabled && $chatConversationState.historyOpen}
          sessions={$chatConversationState.sessions}
          activeConversationId={$chatConversationState.activeConversationId}
          onSelect={(conversationId) => void handleLoadConversation(conversationId)}
          onNewChat={() => void handleNewChat()}
          onClose={() => chatConversationState.setHistoryOpen(false)}
        />

        <IntegrationsPanel
          visible={integrationsEnabled && $chatMediaState.integrationsOpen}
          webhosts={$chatMediaState.integrationWebhosts}
          serverUrl={$settings.serverUrl}
          onClose={() => chatMediaState.setIntegrationsOpen(false)}
          onOpenEmbedded={handleOpenEmbedded}
        />

        <SystemWarningsPanel
          visible={warningsEnabled && $chatMediaState.warningsOpen}
          warnings={$chatMediaState.systemWarnings}
          unacknowledged={$chatMediaState.warningUnacknowledged}
          onClose={() => chatMediaState.setWarningsOpen(false)}
          onAcknowledge={(id) => void handleAcknowledgeWarning(id)}
          onAcknowledgeAll={() => void handleAcknowledgeAllWarnings()}
        />

        <ChatPlanFloatingPanel
          visible={chatPlanVisible}
          plan={$chatPlanState.plan}
          requestId={$chatPlanState.requestId}
          onDismiss={() => (planDismissed = true)}
        />
      </div>

      <PairingBanner
        visible={$sessionState.status === "awaiting_pairing" || $sessionState.status === "error"}
        busy={pairingBusy}
        compact={bannerStackCompact}
        focusRequest={pairingFocusRequest}
        serverUrl={$settings.serverUrl}
        errorMessage={$sessionState.errorMessage}
        onPair={(token) => void handlePair(token)}
        onUnpair={() => void handleUnpair()}
      />

      {#if $sessionState.status === "pairing"}
        <section
          class="info-banner banner-glass"
          class:compact={bannerStackCompact}
          data-tone="info"
        >
          {getTranslateFn()("chatView.pairing.authenticating")}
        </section>
      {/if}

      <SpeechBanner
        partialTranscript={$speechState.partialTranscript}
        errorMessage={$speechState.errorMessage}
        autoSendToAuraGo={$settings.speech.autoSendToAuraGo}
        agentMode={$settings.speech.agentMode}
        speechActive={$speechState.isActive}
        vadLoading={$speechState.vadLoading}
        vadError={$speechState.vadError}
        speechProvider={$speechState.isActive ? $speechState.provider : $settings.speech.provider}
        compact={bannerStackCompact}
      />

      <MessageList
        awaitingResponse={pending && !streamingActive}
        sessionStatus={$sessionState.status}
        connectionStatus={$connectionStatus}
        speechActive={$speechState.isActive}
        {mediaEnabled}
        mediaItems={activeMediaItems}
        serverUrl={$settings.serverUrl}
        onOpenEmbedded={handleOpenEmbedded}
        onPairDevice={handlePairDevice}
      />

      <InputBox
        disabled={!chatAllowed}
        hint={inputHint}
        bind:draft={composerDraft}
        speechStatus={$speechState.status}
        speechEnabled={speechAllowed}
        {stopVisible}
        showFootnote={$chatMessages.length === 0}
        {attachmentsEnabled}
        attachmentLimits={attachmentLimits ?? undefined}
        onSpeechToggle={() => void handleSpeechToggle()}
        onStop={() => void handleStopRequest()}
        onSubmit={(text, files) => void handleSubmit(text, files)}
      />
    </div>
  {/if}

  {#if CertificateTrustModalLazy}
    <CertificateTrustModalLazy
      open={certModalOpen}
      serverUrl={$settings.serverUrl}
      errorCode={tlsErrorCode}
      onClose={() => (certModalOpen = false)}
      onTrust={(probe: CertificateProbeResult) => void handleTrustCertificate(probe)}
      onOpenBrowser={handleOpenBrowser}
    />
  {/if}

  {#if !integrationPreviewNative && IntegrationEmbedModalLazy}
    <IntegrationEmbedModalLazy
      open={embedModalOpen}
      url={embedModalUrl}
      title={embedModalTitle}
      onClose={() => (embedModalOpen = false)}
    />
  {/if}
</div>

<style>
  .settings-loading {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 0;
    color: var(--color-text-muted);
    font-size: 0.95rem;
  }

  .app-shell {
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 100%;
    height: 100%;
    min-height: 0;
    position: relative;
    overflow: hidden;
    border-radius: inherit;
  }

  .chat-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  .chat-view > :not(.speech-bg) {
    position: relative;
    z-index: 1;
  }

  .chat-header-area {
    position: relative;
    flex-shrink: 0;
    z-index: 6;
  }

  .header-panel-backdrop {
    position: fixed;
    inset: 0;
    z-index: 4;
    border: none;
    padding: 0;
    margin: 0;
    background: color-mix(in srgb, var(--color-backdrop) 35%, transparent);
    cursor: default;
  }

  .info-banner {
    margin: 0;
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
  }
</style>
