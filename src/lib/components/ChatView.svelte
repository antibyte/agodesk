<script lang="ts">
  import { get } from "svelte/store";
  import { onDestroy, onMount } from "svelte";
  import InputBox from "./InputBox.svelte";
  import MessageList from "./MessageList.svelte";
  import StatusBar from "./StatusBar.svelte";
  import SettingsView from "./SettingsView.svelte";
  import PairingBanner from "./PairingBanner.svelte";
  import RemoteControlBanner from "./RemoteControlBanner.svelte";
  import CertificateTrustModal from "./CertificateTrustModal.svelte";
  import SpeechBackgroundVisualizer from "./SpeechBackgroundVisualizer.svelte";
  import SpeechBanner from "./SpeechBanner.svelte";
  import { chatMessages } from "../stores/chat";
  import { settings } from "../stores/settings";
  import { sessionState } from "../stores/session";
  import { connectionStatus } from "../stores/connection";
  import { speechState } from "../stores/speech";
  import { getTranslateFn } from "../i18n/store";
  import type { MessageKey } from "../i18n/types";
  import { loadSettings, saveSettings } from "../services/settings";
  import { cycleTheme, destroyThemeListener } from "../services/theme";
  import { saveTrustedCertificate } from "../services/tls";
  import { openExternalUrl } from "../services/open-external-url";
  import { applyMinimizeToTraySetting } from "../services/tray";
  import { sendChatMessage } from "../services/chat-outbound";
  import { deliverSpeechTranscript } from "../services/speech-delivery";
  import { stopSpeechSession, toggleSpeechSession } from "../services/speech-flow";
  import type { SpeechToolContext } from "../services/speech-tool-router";
  import {
    applyPersonaAssets,
    clearPersonaAssets,
    requestPersonaAssets,
  } from "../services/persona-flow";
  import {
    handleSessionAccepted,
    handleSessionError,
    handleSystemConnected,
    retryStoredPairing,
    sendPairingSessionStart,
    unpairDevice,
  } from "../services/session-flow";
  import {
    clearRemoteControlState,
    flushPendingInputCommands,
    handleIncomingDesktopCommand,
    rejectPendingInputCommands,
    resetDesktopCommandState,
  } from "../services/desktop-flow";
  import { resetDesktopSession, setInputApproval } from "../services/desktop";
  import { playUiSound } from "../services/ui-sounds";
  import { notifyIncomingMessageIfHidden } from "../services/message-notifications";
import { handleChatResponseChunk } from "../services/chat-inbound";
import { applySessionClear } from "../services/session-clear";
import {
  WebSocketService,
  isChatError,
  isChatResponse,
  isChatResponseChunk,
  isDesktopCommand,
  isPersonaAssets,
  isSessionAccepted,
  isSessionClear,
  isSystemConnected,
} from "../services/websocket";
  import type {
    AppSettings,
    CertificateProbeResult,
    ClientErrorCode,
    WsMessage,
  } from "../types/protocol";
  import {
    canSendChat,
    hasAdvertisedRemoteDesktopCapture,
    isTlsFatalError,
} from "../types/protocol";

  let pending = $state(false);
  let settingsOpen = $state(false);
  let pairingBusy = $state(false);
  let remoteOperation = $state("");
  let certModalOpen = $state(false);
  let tlsErrorCode = $state<ClientErrorCode | null>(null);
  let composerDraft = $state("");
  let wsService = new WebSocketService();
  let prevConnection = $state<string | null>(null);

  const chatAllowed = $derived(
    canSendChat(
      $sessionState.status,
      $connectionStatus,
      $sessionState.sessionId,
    ) && !pending,
  );

  const streamingActive = $derived(
    $chatMessages.some((message) => message.streaming === true),
  );

  const speechAllowed = $derived($settings.speech.enabled);

  const remoteBannerVisible = $derived(
    $settings.desktopControlEnabled &&
      ($sessionState.remoteControlPending || $sessionState.remoteControlActive),
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
    return "";
  });

  function addSystemMessage(
    key: MessageKey,
    params?: Record<string, string | number>,
    tone: "info" | "success" | "error" = "info",
  ): void {
    const t = getTranslateFn();
    chatMessages.addMessage({
      id: crypto.randomUUID(),
      role: "system",
      text: t(key, params),
      timestamp: new Date().toISOString(),
      messageKey: key,
      messageParams: params,
      tone,
    });
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

  function maybeRequestPersonaAssets(): void {
    const session = get(sessionState);
    if (
      !session.sessionId ||
      (session.status !== "loopback" && session.status !== "accepted")
    ) {
      return;
    }
    void requestPersonaAssets(wsService, session.sessionId);
  }

  async function handleIncomingMessage(message: WsMessage): Promise<void> {
    if (isSessionAccepted(message)) {
      pairingBusy = false;
      await handleSessionAccepted(message.payload, $settings.serverUrl);
      maybeRequestPersonaAssets();
      return;
    }

    if (isSessionClear(message)) {
      pending = false;
      pairingBusy = false;
      composerDraft = "";
      const cleared = await applySessionClear(message.payload);
      if (cleared) {
        addSystemMessage(
          cleared.reason
            ? "chatView.sessionClear.withReason"
            : "chatView.sessionClear.notice",
          cleared.reason ? { reason: cleared.reason } : undefined,
          "info",
        );
      }
      return;
    }

    if (isSystemConnected(message)) {
      pairingBusy = true;
      sessionState.reset();
      clearPersonaAssets();
      try {
        await handleSystemConnected(
          wsService,
          message.payload,
          $settings.serverUrl,
        );
        maybeRequestPersonaAssets();
      } finally {
        if ($sessionState.status === "awaiting_pairing") {
          pairingBusy = false;
        }
      }
      return;
    }

    if (isPersonaAssets(message)) {
      await applyPersonaAssets(message.payload, $settings.serverUrl);
      return;
    }

    if (isChatResponseChunk(message)) {
      const result = handleChatResponseChunk(
        message.payload,
        message.timestamp,
      );
      if (!result) {
        return;
      }
      if (result.completed) {
        pending = false;
        playUiSound("receive");
        void notifyIncomingMessageIfHidden(result.text);
      } else {
        pending = true;
      }
      return;
    }

    if (isChatResponse(message)) {
      pending = false;
      const finalized = chatMessages.finalizeStreamingResponse(
        message.payload.request_id,
        message.payload.text,
        message.timestamp,
        message.id,
      );
      if (!finalized) {
        chatMessages.addMessage({
          id: message.id,
          role: "assistant",
          text: message.payload.text,
          timestamp: message.timestamp,
          requestId: message.payload.request_id,
        });
      }
      playUiSound("receive");
      void notifyIncomingMessageIfHidden(message.payload.text);
      return;
    }

    if (isChatError(message)) {
      pending = false;
      pairingBusy = false;

      if (message.payload.code.startsWith("SESSION_")) {
        await handleSessionError(message.payload.message);
      }

      chatMessages.addMessage({
        id: message.id,
        role: "system",
        text: message.payload.message,
        timestamp: message.timestamp,
        requestId: message.payload.request_id,
        tone: "error",
      });
      return;
    }

    if (isDesktopCommand(message)) {
      remoteOperation = String(
        (message.payload as { operation?: string })?.operation ?? "",
      );
      await handleIncomingDesktopCommand(message, {
        sessionStatus: $sessionState.status,
        remoteControlActive: $sessionState.remoteControlActive,
        sessionId: $sessionState.sessionId,
        deviceId: $sessionState.deviceId,
        onRemoteControlPrompt: () => {
          addSystemMessage("chatView.remoteControl.prompt", undefined, "info");
        },
        wsSend: async (resultMessage) => {
          try {
            await wsService.send(resultMessage);
          } catch (error) {
            addSystemMessage(
              "chatView.error.desktopResultSendFailed",
              undefined,
              "error",
            );
            void error;
          }
        },
      });
    }
  }

  async function connect(
    url: string,
    options?: { pinnedFingerprint?: string },
  ): Promise<void> {
    await wsService.disconnect().catch(() => {});
    await stopSpeechSession().catch(() => {});
    await resetDesktopSession().catch(() => {});
    resetDesktopCommandState();
    clearRemoteControlState();
    clearPersonaAssets();
    sessionState.reset();
    certModalOpen = false;
    tlsErrorCode = null;
    pending = false;

    wsService = new WebSocketService();
    wsService.onMessage((message) => {
      void handleIncomingMessage(message);
    });
    wsService.onError((code, message) => {
      if (isTlsFatalError(code)) {
        handleTlsError(code);
        return;
      }
      chatMessages.addMessage({
        id: crypto.randomUUID(),
        role: "system",
        text: message,
        timestamp: new Date().toISOString(),
        tone: "error",
      });
    });

    try {
      await wsService.connect(url, options);
    } catch (error) {
      addSystemMessage(
        "chatView.error.connectFailed",
        undefined,
        "error",
      );
      void error;
    }
  }

  async function init(): Promise<void> {
    const loaded = await loadSettings();
    await applyMinimizeToTraySetting(loaded.minimizeToTray);
    await connect(loaded.serverUrl);
  }

  async function handleSaveSettings(next: AppSettings): Promise<void> {
    await saveSettings(next);
    await applyMinimizeToTraySetting(next.minimizeToTray);
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
    await connect(next.serverUrl);
  }

  async function handleToggleTheme(): Promise<void> {
    const nextTheme = cycleTheme($settings.theme);
    await saveSettings({ ...$settings, theme: nextTheme });
  }

  async function handlePair(token: string): Promise<void> {
    pairingBusy = true;
    try {
      await sendPairingSessionStart(wsService, token, $settings.serverUrl);
    } catch (error) {
      pairingBusy = false;
      await handleSessionError(
        error instanceof Error
          ? error.message
          : getTranslateFn()("chatView.error.pairingFailed"),
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
        error instanceof Error
          ? error.message
          : getTranslateFn()("chatView.error.reconnectFailed"),
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
      sendToAuraGo: async (text) => {
        await sendChatMessage(
          (message) => wsService.send(message),
          $sessionState.sessionId,
          text,
        );
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
    if ($settings.speech.agentMode) {
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
          pending = true;
        },
      });
    } catch (error) {
      addSystemMessage(
        "chatView.error.speechTranscriptFailed",
        undefined,
        "error",
      );
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
    });
  }

  async function handleApproveRemote(): Promise<void> {
    try {
      await setInputApproval(true);
      sessionState.setRemoteControlActive(true);
      sessionState.setRemoteControlPending(false);
      const hasCapture = hasAdvertisedRemoteDesktopCapture(
        $sessionState.advertisedCapabilities,
      );
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

  async function handleSubmit(text: string): Promise<void> {
    if (!chatAllowed) {
      return;
    }
    try {
      await sendChatMessage(
        (message) => wsService.send(message),
        $sessionState.sessionId,
        text,
      );
      pending = true;
      playUiSound("send");
    } catch (error) {
      pending = false;
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

  $effect(() => {
    const conn = $connectionStatus;
    const prev = prevConnection;
    if (prev === "connected" && conn !== "connected" && pending) {
      pending = false;
      addSystemMessage("chatView.connectionLost", undefined, "error");
    }
    prevConnection = conn;
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

  {#if settingsOpen}
    <SettingsView
      serverUrl={$settings.serverUrl}
      theme={$settings.theme}
      locale={$settings.locale}
      speech={$settings.speech}
      uiSounds={$settings.uiSounds}
      minimizeToTray={$settings.minimizeToTray}
      desktopControlEnabled={$settings.desktopControlEnabled}
      browserControlEnabled={$settings.browserControlEnabled}
      fileAccess={$settings.fileAccess}
      connectionStatus={$connectionStatus}
      sessionStatus={$sessionState.status}
      sessionId={$sessionState.sessionId}
      sessionError={$sessionState.errorMessage}
      remoteControlActive={$sessionState.remoteControlActive}
      appVersion="0.1.0"
      onBack={() => (settingsOpen = false)}
      onSave={async (next) => {
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
    <div class="chat-view">
      <SpeechBackgroundVisualizer
        active={$speechState.isActive}
        status={$speechState.status}
      />
      <StatusBar
        serverUrl={$settings.serverUrl}
        theme={$settings.theme}
        sessionStatus={$sessionState.status}
        connectionStatus={$connectionStatus}
        advertisedCapabilities={$sessionState.advertisedCapabilities}
        desktopControlEnabled={$settings.desktopControlEnabled}
        minimizeToTray={$settings.minimizeToTray}
        onOpenSettings={() => (settingsOpen = true)}
        onReconnect={() => void connect($settings.serverUrl)}
        onToggleTheme={() => void handleToggleTheme()}
      />

      <PairingBanner
        visible={$sessionState.status === "awaiting_pairing" ||
          $sessionState.status === "error"}
        busy={pairingBusy}
        serverUrl={$settings.serverUrl}
        errorMessage={$sessionState.errorMessage}
        onPair={(token) => void handlePair(token)}
        onUnpair={() => void handleUnpair()}
      />

      {#if $sessionState.status === "pairing"}
        <section class="info-banner banner-glass" data-tone="info">
          {getTranslateFn()("chatView.pairing.authenticating")}
        </section>
      {/if}

      <SpeechBanner
        partialTranscript={$speechState.partialTranscript}
        errorMessage={$speechState.errorMessage}
        autoSendToAuraGo={$settings.speech.autoSendToAuraGo}
        agentMode={$settings.speech.agentMode}
        speechActive={$speechState.isActive}
      />

      <MessageList
        awaitingResponse={pending && !streamingActive}
        sessionStatus={$sessionState.status}
        connectionStatus={$connectionStatus}
        speechActive={$speechState.isActive}
        onOpenSettings={() => (settingsOpen = true)}
      />

      <InputBox
        disabled={!chatAllowed}
        hint={inputHint}
        bind:draft={composerDraft}
        speechStatus={$speechState.status}
        speechEnabled={speechAllowed}
        onSpeechToggle={() => void handleSpeechToggle()}
        onSubmit={(text) => void handleSubmit(text)}
      />
    </div>
  {/if}
</div>

<CertificateTrustModal
  open={certModalOpen}
  serverUrl={$settings.serverUrl}
  errorCode={tlsErrorCode}
  onClose={() => (certModalOpen = false)}
  onTrust={(probe) => void handleTrustCertificate(probe)}
  onOpenBrowser={handleOpenBrowser}
/>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
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
    position: relative;
    overflow: hidden;
  }

  .chat-view > :not(.speech-bg) {
    position: relative;
    z-index: 1;
  }

  .info-banner {
    margin: 0;
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
  }
</style>
