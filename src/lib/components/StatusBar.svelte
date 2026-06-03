<script lang="ts">
  import { i18n } from "../i18n";
  import type { ConnectionStatus, SessionStatus, ThemeMode } from "../types/protocol";
  import { hasAdvertisedRemoteDesktopCapture } from "../types/protocol";
  import { THEME_LABELS } from "../services/theme";
  import { playUiSound } from "../services/ui-sounds";
  import WindowControls from "./WindowControls.svelte";

  interface Props {
    serverUrl?: string;
    theme?: ThemeMode;
    sessionStatus?: SessionStatus;
    connectionStatus?: ConnectionStatus;
    advertisedCapabilities?: string[];
    desktopControlEnabled?: boolean;
    minimizeToTray?: boolean;
    onOpenSettings?: () => void;
    onReconnect?: () => void;
    onToggleTheme?: () => void;
  }

  let {
    serverUrl = "",
    theme = "system",
    sessionStatus = "idle",
    connectionStatus = "disconnected",
    advertisedCapabilities = [],
    desktopControlEnabled = true,
    minimizeToTray = false,
    onOpenSettings,
    onReconnect,
    onToggleTheme,
  }: Props = $props();

  const themeIcons: Record<ThemeMode, string> = {
    system: "◐",
    light: "☀",
    dark: "☾",
  };

  const sessionHint = $derived.by(() => {
    switch (sessionStatus) {
      case "awaiting_pairing":
        return $i18n("statusBar.session.awaiting_pairing");
      case "accepted":
        return $i18n("statusBar.session.accepted");
      case "loopback":
        return $i18n("statusBar.session.loopback");
      case "error":
        return $i18n("statusBar.session.error");
      default:
        return "";
    }
  });

  const remoteDesktopReady = $derived(
    desktopControlEnabled && hasAdvertisedRemoteDesktopCapture(advertisedCapabilities),
  );

  function handleReconnect(): void {
    playUiSound("notice");
    onReconnect?.();
  }
</script>

<header class="status-bar">
  <button
    class="status"
    type="button"
    title={$i18n("statusBar.openSettings.title")}
    onclick={() => onOpenSettings?.()}
  >
    <span
      class="dot"
      data-status={connectionStatus}
      aria-label={$i18n("statusBar.connectionStatus.ariaLabel")}
    ></span>
    <span>{$i18n(`connection.status.${connectionStatus}`)}</span>
    {#if sessionHint}
      <span class="session">{sessionHint}</span>
    {/if}
    {#if !desktopControlEnabled}
      <span
        class="badge muted"
        title={$i18n("statusBar.desktop.disabled.title")}
      >
        {$i18n("statusBar.desktop.disabled")}
      </span>
    {:else if sessionStatus === "accepted" || sessionStatus === "loopback"}
      <span
        class="badge"
        class:ok={remoteDesktopReady}
        class:warn={!remoteDesktopReady}
        title={remoteDesktopReady
          ? $i18n("statusBar.remote.ready.title")
          : $i18n("statusBar.remote.missing.title")}
      >
        {remoteDesktopReady
          ? $i18n("statusBar.remote.ready")
          : $i18n("statusBar.remote.missing")}
      </span>
    {/if}
    {#if serverUrl}
      <span class="url">{serverUrl}</span>
    {/if}
  </button>

  <div class="actions">
    <button
      class="theme-toggle"
      type="button"
      title={$i18n("statusBar.theme.toggle.title", { theme: THEME_LABELS[theme] })}
      aria-label={$i18n("statusBar.theme.toggle.ariaLabel", {
        theme: THEME_LABELS[theme],
      })}
      onclick={() => onToggleTheme?.()}
    >
      {themeIcons[theme]}
    </button>

    {#if connectionStatus === "disconnected" || connectionStatus === "error"}
      <button class="reconnect" type="button" onclick={handleReconnect}>
        {$i18n("statusBar.reconnect")}
      </button>
    {/if}

    <button
      class="settings-btn"
      type="button"
      title={$i18n("statusBar.settings.title")}
      aria-label={$i18n("statusBar.settings.ariaLabel")}
      onclick={() => onOpenSettings?.()}
    >
      ⚙
    </button>

    <WindowControls {minimizeToTray} />
  </div>
</header>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    box-shadow: var(--color-panel-shadow);
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 0;
    flex-wrap: wrap;
    min-width: 0;
    text-align: left;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .dot {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 999px;
    background: var(--color-muted);
    flex-shrink: 0;
  }

  .dot[data-status="connected"] {
    background: #22c55e;
  }

  .dot[data-status="connecting"] {
    background: #eab308;
  }

  .dot[data-status="error"],
  .dot[data-status="disconnected"] {
    background: #ef4444;
  }

  .session {
    font-size: 0.8125rem;
    color: var(--color-accent);
  }

  .badge {
    font-size: 0.75rem;
    padding: 0.1rem 0.45rem;
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border);
  }

  .badge.ok {
    color: #16a34a;
    border-color: color-mix(in srgb, #16a34a 35%, var(--color-border));
  }

  .badge.warn {
    color: #ca8a04;
    border-color: color-mix(in srgb, #ca8a04 35%, var(--color-border));
  }

  .badge.muted {
    color: var(--color-muted);
  }

  .url {
    color: var(--color-muted);
    font-size: 0.8125rem;
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .theme-toggle,
  .reconnect,
  .settings-btn {
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    padding: 0.35rem 0.75rem;
    background: var(--color-input-bg);
    color: inherit;
    cursor: pointer;
  }

  .theme-toggle,
  .settings-btn {
    min-width: 2.25rem;
    font-size: 1rem;
    line-height: 1;
  }
</style>
