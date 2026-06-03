<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import InputBox from "./InputBox.svelte";
  import MessageList from "./MessageList.svelte";
  import StatusBar from "./StatusBar.svelte";
  import SettingsView from "./SettingsView.svelte";
  import PairingBanner from "./PairingBanner.svelte";
  import RemoteControlBanner from "./RemoteControlBanner.svelte";
  import CertificateTrustModal from "./CertificateTrustModal.svelte";
  import SpeechBackgroundVisualizer from "./SpeechBackgroundVisualizer.svelte";
  import { chatMessages } from "../stores/chat";
  import { settings } from "../stores/settings";
  import { sessionState } from "../stores/session";
  import { connectionStatus } from "../stores/connection";
  import { speechState } from "../stores/speech";
  import { loadSettings, saveSettings } from "../services/settings";
  import { cycleTheme, destroyThemeListener } from "../services/theme";
  import { saveTrustedCertificate } from "../services/tls";
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
  import {
    WebSocketService,
    isChatError,
    isChatResponse,
    isDesktopCommand,
    isSessionAccepted,
    isSystemConnected,
  } from "../services/websocket";
  import type {
    AppSettings,
    CertificateProbeResult,
    ClientErrorCode,
    WsMessage,
  } from "../types/protocol";
  import { canSendChat, isTlsFatalError } from "../types/protocol";
  import { formatInvokeError } from "../services/errors";

  let pending = $state(false);
  let settingsOpen = $state(false);
  let pairingBusy = $state(false);
  let remoteOperation = $state("");
  let certModalOpen = $state(false);
  let tlsErrorCode = $state<ClientErrorCode | null>(null);
  let wsService = new WebSocketService();

  const chatAllowed = $derived(
    canSendChat(
      $sessionState.status,
      $connectionStatus,
      $sessionState.sessionId,
    ) && !pending,
  );

  const inputHint = $derived.by(() => {
    if (certModalOpen) {
      return "TLS-Zertifikat muss bestaetigt werden.";
    }
    if ($connectionStatus !== "connected") {
      return "Keine Verbindung zum Server.";
    }
    if ($sessionState.status === "awaiting_pairing") {
      return "Bitte Geraet koppeln, bevor du chatten kannst.";
    }
    if ($sessionState.status === "pairing") {
      return "Session wird authentifiziert…";
    }
    if ($sessionState.status === "error") {
      return $sessionState.errorMessage || "Session-Fehler.";
    }
    if (pending) {
      return "Warte auf Antwort…";
    }
    return "";
  });

  function handleTlsError(code: ClientErrorCode): void {
    if (!isTlsFatalError(code)) {
      return;
    }
    tlsErrorCode = code;
    certModalOpen = true;
  }

  async function handleIncomingMessage(message: WsMessage): Promise<void> {
    if (isSessionAccepted(message)) {
      pairingBusy = false;
      await handleSessionAccepted(message.payload, $settings.serverUrl);
      return;
    }

    if (isSystemConnected(message)) {
      pairingBusy = true;
      sessionState.reset();
      try {
        await handleSystemConnected(
          wsService,
          message.payload,
          $settings.serverUrl,
        );
      } finally {
        if ($sessionState.status === "awaiting_pairing") {
          pairingBusy = false;
        }
      }
      return;
    }

    if (isChatResponse(message)) {
      pending = false;
      chatMessages.addMessage({
        id: message.id,
        role: "assistant",
        text: message.payload.text,
        timestamp: message.timestamp,
        requestId: message.payload.request_id,
      });
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
        onRemoteControlPrompt: (operation) => {
          chatMessages.addMessage({
            id: crypto.randomUUID(),
            role: "system",
            text: `Remote Control angefragt (${operation}). Bitte oben auf „Freigeben“ klicken.`,
            timestamp: new Date().toISOString(),
          });
        },
        wsSend: async (resultMessage) => {
          try {
            await wsService.send(resultMessage);
          } catch (error) {
            chatMessages.addMessage({
              id: crypto.randomUUID(),
              role: "system",
              text: formatInvokeError(
                error,
                "desktop.result konnte nicht gesendet werden (Verbindung unterbrochen?).",
              ),
              timestamp: new Date().toISOString(),
            });
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
    await resetDesktopSession().catch(() => {});
    resetDesktopCommandState();
    clearRemoteControlState();
    sessionState.reset();
    certModalOpen = false;
    tlsErrorCode = null;

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
      });
    });

    try {
      await wsService.connect(url, options);
    } catch (error) {
      chatMessages.addMessage({
        id: crypto.randomUUID(),
        role: "system",
        text: formatInvokeError(
          error,
          "Verbindung konnte nicht gestartet werden.",
        ),
        timestamp: new Date().toISOString(),
      });
    }
  }

  async function init(): Promise<void> {
    const loaded = await loadSettings();
    await connect(loaded.serverUrl);
  }

  async function handleSaveSettings(next: AppSettings): Promise<void> {
    await saveSettings(next);
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
        error instanceof Error ? error.message : "Pairing fehlgeschlagen.",
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
        error instanceof Error ? error.message : "Reconnect fehlgeschlagen.",
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
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleApproveRemote(): Promise<void> {
    await setInputApproval(true);
    sessionState.setRemoteControlActive(true);
    sessionState.setRemoteControlPending(false);
    chatMessages.addMessage({
      id: crypto.randomUUID(),
      role: "system",
      text: "Remote Control freigegeben. Der Agent kann jetzt Screenshots anfordern.",
      timestamp: new Date().toISOString(),
    });
    await flushPendingInputCommands(
      async (resultMessage) => {
        await wsService.send(resultMessage);
      },
      true,
      {
        sessionId: $sessionState.sessionId,
        deviceId: $sessionState.deviceId,
      },
    );
  }

  async function handleDenyRemote(): Promise<void> {
    await setInputApproval(false);
    sessionState.setRemoteControlPending(false);
    sessionState.setRemoteControlActive(false);
    await rejectPendingInputCommands(async (resultMessage) => {
      await wsService.send(resultMessage);
    }, {
      sessionId: $sessionState.sessionId,
      deviceId: $sessionState.deviceId,
    });
  }

  async function handleStopRemote(): Promise<void> {
    await setInputApproval(false);
    sessionState.setRemoteControlActive(false);
    sessionState.setRemoteControlPending(false);
    await rejectPendingInputCommands(async (resultMessage) => {
      await wsService.send(resultMessage);
    }, {
      sessionId: $sessionState.sessionId,
      deviceId: $sessionState.deviceId,
    });
  }

  async function handleSubmit(text: string): Promise<void> {
    if (!chatAllowed) {
      return;
    }

    const message: WsMessage = {
      id: crypto.randomUUID(),
      type: "chat.message",
      timestamp: new Date().toISOString(),
      payload: {
        session_id: $sessionState.sessionId,
        text,
        role: "user",
      },
    };

    chatMessages.addMessage({
      id: message.id,
      role: "user",
      text,
      timestamp: message.timestamp,
    });

    try {
      await wsService.send(message);
      pending = true;
    } catch (error) {
      pending = false;
      chatMessages.addMessage({
        id: crypto.randomUUID(),
        role: "system",
        text:
          error instanceof Error
            ? error.message
            : "Nachricht konnte nicht gesendet werden.",
        timestamp: new Date().toISOString(),
      });
    }
  }

  onMount(() => {
    void init();
  });

  onDestroy(() => {
    void wsService.disconnect();
    destroyThemeListener();
  });
</script>

<div class="app-shell">
<RemoteControlBanner
  visible={$sessionState.remoteControlPending || $sessionState.remoteControlActive}
  operation={remoteOperation}
  onApprove={() => void handleApproveRemote()}
  onDeny={() => void handleDenyRemote()}
  onStop={() => void handleStopRemote()}
/>

{#if settingsOpen}
  <SettingsView
    serverUrl={$settings.serverUrl}
    theme={$settings.theme}
    connectionStatus={$connectionStatus}
    sessionStatus={$sessionState.status}
    sessionId={$sessionState.sessionId}
    sessionError={$sessionState.errorMessage}
    remoteControlActive={$sessionState.remoteControlActive}
    appVersion="0.1.0"
    onBack={() => (settingsOpen = false)}
    onSave={(next) => void handleSaveSettings({ ...$settings, ...next })}
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
    <section class="info-banner">Session wird authentifiziert…</section>
  {/if}

  <MessageList />
  <InputBox disabled={!chatAllowed} hint={inputHint} onSubmit={(text) => void handleSubmit(text)} />
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
  }

  .chat-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  /* Ensure chat UI sits above the audio-reactive background visualizer */
  .chat-view > :not(.speech-bg) {
    position: relative;
    z-index: 1;
  }

  .info-banner {
    padding: 0.65rem 1.25rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-input-bg);
    color: var(--color-muted);
    font-size: 0.875rem;
  }
</style>
