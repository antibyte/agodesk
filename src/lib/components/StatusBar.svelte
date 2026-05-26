<script lang="ts">
  import { connectionStatus } from "../stores/connection";
  import type { ConnectionStatus, SessionStatus, ThemeMode } from "../types/protocol";
  import { THEME_LABELS } from "../services/theme";

  interface Props {
    serverUrl?: string;
    theme?: ThemeMode;
    sessionStatus?: SessionStatus;
    onOpenSettings?: () => void;
    onReconnect?: () => void;
    onToggleTheme?: () => void;
  }

  let {
    serverUrl = "",
    theme = "system",
    sessionStatus = "idle",
    onOpenSettings,
    onReconnect,
    onToggleTheme,
  }: Props = $props();

  const connectionLabels: Record<ConnectionStatus, string> = {
    connected: "Verbunden",
    connecting: "Verbinde…",
    disconnected: "Getrennt",
    error: "Verbindungsfehler",
  };

  const sessionLabels: Record<SessionStatus, string> = {
    idle: "",
    awaiting_pairing: "Pairing erforderlich",
    pairing: "Authentifiziere…",
    accepted: "Session aktiv",
    loopback: "Loopback-Dev",
    error: "Session-Fehler",
  };

  const themeIcons: Record<ThemeMode, string> = {
    system: "◐",
    light: "☀",
    dark: "☾",
  };
</script>

<header class="status-bar">
  <button class="status" type="button" onclick={() => onOpenSettings?.()}>
    <span class="dot" data-status={$connectionStatus}></span>
    <span>{connectionLabels[$connectionStatus]}</span>
    {#if sessionLabels[sessionStatus]}
      <span class="session">{sessionLabels[sessionStatus]}</span>
    {/if}
    {#if serverUrl}
      <span class="url">{serverUrl}</span>
    {/if}
  </button>

  <div class="actions">
    <button
      class="theme-toggle"
      type="button"
      title="Design: {THEME_LABELS[theme]}"
      aria-label="Design umschalten ({THEME_LABELS[theme]})"
      onclick={() => onToggleTheme?.()}
    >
      {themeIcons[theme]}
    </button>

    {#if $connectionStatus === "disconnected" || $connectionStatus === "error"}
      <button class="reconnect" type="button" onclick={() => onReconnect?.()}>
        Erneut verbinden
      </button>
    {/if}
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
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .dot {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 999px;
    background: var(--color-muted);
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

  .url {
    color: var(--color-muted);
    font-size: 0.875rem;
  }

  .theme-toggle,
  .reconnect {
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    padding: 0.35rem 0.75rem;
    background: var(--color-input-bg);
    color: inherit;
    cursor: pointer;
  }

  .theme-toggle {
    min-width: 2.25rem;
    font-size: 1rem;
    line-height: 1;
  }
</style>
