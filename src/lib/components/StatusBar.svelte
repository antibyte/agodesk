<script lang="ts">
  import { i18n } from "../i18n";
  import type { ConnectionStatus, SessionStatus, ThemeMode } from "../types/protocol";
  import { hasAdvertisedRemoteDesktopCapture } from "../types/protocol";
  import type { MessageKey } from "../i18n/types";
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

  const currentThemeLabel = $derived($i18n(`theme.${theme}` as MessageKey));

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

<header class="status-bar glass-panel">
  <button
    class="status-pill"
    type="button"
    title={$i18n("statusBar.openSettings.title")}
    onclick={() => onOpenSettings?.()}
  >
    <span class="brand-mark" aria-hidden="true">A</span>
    <span class="status-copy">
      <span class="status-line">
        <span
          class="dot"
          data-status={connectionStatus}
          aria-label={$i18n("statusBar.connectionStatus.ariaLabel")}
        ></span>
        <span class="connection-label">{$i18n(`connection.status.${connectionStatus}`)}</span>
        {#if sessionHint}
          <span class="session-sep">·</span>
          <span class="session">{sessionHint}</span>
        {/if}
      </span>
      {#if serverUrl}
        <span class="url" title={serverUrl}>{serverUrl}</span>
      {/if}
    </span>
    {#if !desktopControlEnabled}
      <span class="ui-chip" data-tone="idle" title={$i18n("statusBar.desktop.disabled.title")}>
        {$i18n("statusBar.desktop.disabled")}
      </span>
    {:else if sessionStatus === "accepted" || sessionStatus === "loopback"}
      <span
        class="ui-chip"
        data-tone={remoteDesktopReady ? "connected" : "awaiting_pairing"}
        title={remoteDesktopReady
          ? $i18n("statusBar.remote.ready.title")
          : $i18n("statusBar.remote.missing.title")}
      >
        {remoteDesktopReady
          ? $i18n("statusBar.remote.ready")
          : $i18n("statusBar.remote.missing")}
      </span>
    {/if}
  </button>

  <div class="titlebar-drag" data-tauri-drag-region aria-hidden="true"></div>

  <div class="actions">
    <button
      class="ui-btn ui-btn-secondary ui-btn-icon"
      type="button"
      title={$i18n("statusBar.theme.toggle.title", { theme: currentThemeLabel })}
      aria-label={$i18n("statusBar.theme.toggle.ariaLabel", {
        theme: currentThemeLabel,
      })}
      onclick={() => onToggleTheme?.()}
    >
      {#if theme === "light"}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="icon-theme">
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
        </svg>
      {:else if theme === "dark"}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="icon-theme">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
        </svg>
      {:else}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="icon-theme">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 2v20M12 2a10 10 0 0 1 0 20Z" fill="currentColor"></path>
        </svg>
      {/if}
    </button>

    {#if connectionStatus === "disconnected" || connectionStatus === "error"}
      <button
        class="ui-btn ui-btn-secondary"
        type="button"
        onclick={handleReconnect}
      >
        {$i18n("statusBar.reconnect")}
      </button>
    {/if}

    <button
      class="ui-btn ui-btn-secondary ui-btn-icon btn-settings"
      type="button"
      title={$i18n("statusBar.settings.title")}
      aria-label={$i18n("statusBar.settings.ariaLabel")}
      onclick={() => onOpenSettings?.()}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="icon-settings">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    </button>

    <WindowControls {minimizeToTray} />
  </div>
</header>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--color-border-subtle);
    border-radius: 0;
    flex-shrink: 0;
    z-index: 2;
  }

  .titlebar-drag {
    flex: 1;
    align-self: stretch;
    min-width: 1.5rem;
    min-height: 2rem;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--glass-surface) 60%, transparent);
    color: inherit;
    cursor: pointer;
    padding: var(--space-2) var(--space-3);
    min-width: 0;
    text-align: left;
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .status-pill:hover {
    border-color: color-mix(in srgb, var(--color-accent) 30%, var(--color-border));
    box-shadow: var(--accent-glow);
  }

  .brand-mark {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: white;
    font-weight: 800;
    font-size: 0.875rem;
    flex-shrink: 0;
    box-shadow: var(--accent-glow);
  }

  .status-copy {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }

  .status-line {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .connection-label {
    color: var(--color-text);
  }

  .session-sep {
    color: var(--color-muted);
    opacity: 0.6;
  }

  .session {
    font-size: 0.8125rem;
    color: var(--color-accent);
  }

  .url {
    color: var(--color-muted);
    font-size: 0.75rem;
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: var(--radius-full);
    background: var(--color-muted);
    flex-shrink: 0;
    box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 15%, transparent);
  }

  .dot[data-status="connected"] {
    background: var(--color-success);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-success) 55%, transparent);
  }

  .dot[data-status="connecting"] {
    background: var(--color-warning);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-warning) 55%, transparent);
  }

  .dot[data-status="error"],
  .dot[data-status="disconnected"] {
    background: var(--color-danger);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-danger) 55%, transparent);
  }

  .icon-settings {
    transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .btn-settings:hover .icon-settings {
    transform: rotate(45deg);
  }

  .icon-theme {
    transition: transform var(--transition-fast);
  }

  .ui-btn-icon:hover .icon-theme {
    transform: scale(1.08);
  }
</style>
