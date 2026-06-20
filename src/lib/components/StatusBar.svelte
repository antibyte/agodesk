<script lang="ts">
  import { i18n } from "../i18n";
  import type { ConnectionStatus, SessionStatus, ThemeMode } from "../types/protocol";
  import { hasAdvertisedRemoteDesktopCapture } from "../types/protocol";
  import type { MessageKey } from "../i18n/types";
  import { playUiSound } from "../services/ui-sounds";
  import WindowControls from "./WindowControls.svelte";
  import Icon from "./Icon.svelte";
  import { returnFocusToTrigger, setFocusTrigger } from "../actions/focusTrap";
  import type { CompanionPresenceTone } from "../services/companion-presence";

  interface Props {
    serverUrl?: string;
    theme?: ThemeMode;
    sessionStatus?: SessionStatus;
    connectionStatus?: ConnectionStatus;
    advertisedCapabilities?: string[];
    desktopControlEnabled?: boolean;
    minimizeToTray?: boolean;
    voiceResponsesEnabled?: boolean;
    historyEnabled?: boolean;
    historyActive?: boolean;
    integrationsEnabled?: boolean;
    integrationsActive?: boolean;
    integrationsCount?: number;
    warningsEnabled?: boolean;
    warningsActive?: boolean;
    warningsUnacknowledged?: number;
    companionTone?: CompanionPresenceTone;
    speechActive?: boolean;
    requestInFlight?: boolean;
    onOpenSettings?: () => void;
    onReconnect?: () => void;
    onToggleTheme?: () => void;
    onToggleVoiceOutput?: () => void;
    onToggleHistory?: () => void;
    onToggleIntegrations?: () => void;
    onToggleWarnings?: () => void;
  }

  let {
    serverUrl = "",
    theme = "system",
    sessionStatus = "idle",
    connectionStatus = "disconnected",
    advertisedCapabilities = [],
    desktopControlEnabled = true,
    minimizeToTray = false,
    voiceResponsesEnabled = true,
    historyEnabled = false,
    historyActive = false,
    integrationsEnabled = false,
    integrationsActive = false,
    integrationsCount = 0,
    warningsEnabled = false,
    warningsActive = false,
    warningsUnacknowledged = 0,
    companionTone = "ready",
    speechActive = false,
    requestInFlight = false,
    onOpenSettings,
    onReconnect,
    onToggleTheme,
    onToggleVoiceOutput,
    onToggleHistory,
    onToggleIntegrations,
    onToggleWarnings,
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

  const themeIcon = $derived(
    theme === "light" ? "sun" : theme === "dark" ? "moon" : ("system" as const),
  );

  let overflowOpen = $state(false);
  let overflowWrapEl = $state<HTMLDivElement | undefined>();
  let overflowToggleEl = $state<HTMLButtonElement | undefined>();
  let overflowMenuEl = $state<HTMLDivElement | undefined>();
  let overflowFocusIndex = $state(0);

  function handleReconnect(): void {
    playUiSound("notice");
    onReconnect?.();
    overflowOpen = false;
  }

  function toggleOverflow(): void {
    if (!overflowOpen && overflowToggleEl) {
      setFocusTrigger(overflowToggleEl);
    }
    overflowOpen = !overflowOpen;
    if (overflowOpen) {
      overflowFocusIndex = 0;
    }
  }

  function runOverflowAction(action: () => void): void {
    action();
    overflowOpen = false;
    returnFocusToTrigger();
  }

  function overflowItems(): HTMLButtonElement[] {
    if (!overflowMenuEl) {
      return [];
    }
    return [...overflowMenuEl.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  }

  function focusOverflowItem(index: number): void {
    const items = overflowItems();
    if (items.length === 0) {
      return;
    }
    const next = Math.max(0, Math.min(index, items.length - 1));
    overflowFocusIndex = next;
    items[next]?.focus();
  }

  function handleOverflowKeydown(event: KeyboardEvent): void {
    const items = overflowItems();
    if (items.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOverflowItem((overflowFocusIndex + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOverflowItem((overflowFocusIndex - 1 + items.length) % items.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOverflowItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOverflowItem(items.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      overflowOpen = false;
      returnFocusToTrigger();
    }
  }

  $effect(() => {
    if (!overflowOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && overflowWrapEl?.contains(target)) {
        return;
      }
      overflowOpen = false;
    };
    document.addEventListener("mousedown", handlePointerDown);
    queueMicrotask(() => focusOverflowItem(0));
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  });
</script>

<header class="status-bar glass-panel">
  <button
    class="status-pill"
    type="button"
    title={$i18n("statusBar.openSettings.title")}
    onclick={() => onOpenSettings?.()}
  >
    <span
      class="brand-mark"
      data-companion-tone={companionTone}
      class:companion-live={speechActive || requestInFlight}
      aria-hidden="true"
    >
      <Icon name="brand" size={18} />
    </span>
    <span class="status-copy">
      <span class="status-line">
        <span
          class="ui-status-orb"
          data-tone={companionTone}
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
        {remoteDesktopReady ? $i18n("statusBar.remote.ready") : $i18n("statusBar.remote.missing")}
      </span>
    {/if}
  </button>

  <div class="titlebar-drag" data-tauri-drag-region aria-hidden="true"></div>

  <div class="actions">
    {#if historyEnabled}
      <button
        class="ui-btn ui-btn-secondary ui-btn-icon compact-hide"
        class:is-active={historyActive}
        type="button"
        title={$i18n("chatView.history.title")}
        aria-label={$i18n("chatView.history.toggle.ariaLabel")}
        aria-pressed={historyActive}
        onclick={() => onToggleHistory?.()}
      >
        <Icon name="history" size={15} />
      </button>
    {/if}

    {#if integrationsEnabled}
      <button
        class="ui-btn ui-btn-secondary ui-btn-icon compact-hide"
        class:is-active={integrationsActive}
        type="button"
        title={$i18n("integrations.title")}
        aria-label={$i18n("integrations.toggle.ariaLabel")}
        aria-pressed={integrationsActive}
        onclick={() => onToggleIntegrations?.()}
      >
        <Icon name="integrations" size={15} />
        {#if integrationsCount > 0}
          <span class="action-badge">{integrationsCount > 9 ? "9+" : integrationsCount}</span>
        {/if}
      </button>
    {/if}

    {#if warningsEnabled}
      <button
        class="ui-btn ui-btn-secondary ui-btn-icon compact-hide"
        class:is-active={warningsActive}
        type="button"
        title={warningsUnacknowledged > 0
          ? `${warningsUnacknowledged} ${$i18n("warnings.unacknowledgedLabel")}`
          : $i18n("warnings.title")}
        aria-label={$i18n("warnings.toggle.ariaLabel")}
        aria-pressed={warningsActive}
        onclick={() => onToggleWarnings?.()}
      >
        <Icon name="bell" size={15} />
        {#if warningsUnacknowledged > 0}
          <span class="action-badge warning"
            >{warningsUnacknowledged > 9 ? "9+" : warningsUnacknowledged}</span
          >
        {/if}
      </button>
    {/if}

    <button
      class="ui-btn ui-btn-secondary ui-btn-icon compact-hide"
      class:is-active={voiceResponsesEnabled}
      type="button"
      title={voiceResponsesEnabled
        ? $i18n("statusBar.voiceOutput.on.title")
        : $i18n("statusBar.voiceOutput.off.title")}
      aria-label={$i18n("statusBar.voiceOutput.toggle.ariaLabel")}
      aria-pressed={voiceResponsesEnabled}
      onclick={() => onToggleVoiceOutput?.()}
    >
      <Icon name={voiceResponsesEnabled ? "voice-on" : "voice-off"} size={15} class="icon-voice" />
    </button>

    <button
      class="ui-btn ui-btn-secondary ui-btn-icon compact-hide"
      type="button"
      title={$i18n("statusBar.theme.toggle.title", { theme: currentThemeLabel })}
      aria-label={$i18n("statusBar.theme.toggle.ariaLabel", {
        theme: currentThemeLabel,
      })}
      onclick={() => onToggleTheme?.()}
    >
      <Icon name={themeIcon} size={15} class="icon-theme" />
    </button>

    {#if connectionStatus === "disconnected" || connectionStatus === "error"}
      <button class="ui-btn ui-btn-secondary compact-hide" type="button" onclick={handleReconnect}>
        {$i18n("statusBar.reconnect")}
      </button>
    {/if}

    <div class="overflow-wrap compact-only" bind:this={overflowWrapEl}>
      <button
        bind:this={overflowToggleEl}
        class="ui-btn ui-btn-secondary ui-btn-icon"
        type="button"
        title={$i18n("statusBar.overflow.title")}
        aria-label={$i18n("statusBar.overflow.ariaLabel")}
        aria-expanded={overflowOpen}
        aria-haspopup="menu"
        onclick={toggleOverflow}
      >
        <Icon name="overflow" size={15} />
      </button>
      {#if overflowOpen}
        <div
          bind:this={overflowMenuEl}
          class="overflow-menu glass-panel"
          role="menu"
          tabindex="-1"
          onkeydown={handleOverflowKeydown}
        >
          {#if historyEnabled}
            <button
              type="button"
              class="overflow-item"
              class:is-active={historyActive}
              role="menuitem"
              onclick={() => runOverflowAction(() => onToggleHistory?.())}
            >
              {$i18n("chatView.history.title")}
            </button>
          {/if}
          {#if integrationsEnabled}
            <button
              type="button"
              class="overflow-item"
              class:is-active={integrationsActive}
              role="menuitem"
              onclick={() => runOverflowAction(() => onToggleIntegrations?.())}
            >
              {$i18n("integrations.title")}
              {#if integrationsCount > 0}
                <span class="overflow-badge"
                  >{integrationsCount > 9 ? "9+" : integrationsCount}</span
                >
              {/if}
            </button>
          {/if}
          {#if warningsEnabled}
            <button
              type="button"
              class="overflow-item"
              class:is-active={warningsActive}
              role="menuitem"
              onclick={() => runOverflowAction(() => onToggleWarnings?.())}
            >
              {$i18n("warnings.title")}
              {#if warningsUnacknowledged > 0}
                <span class="overflow-badge warning"
                  >{warningsUnacknowledged > 9 ? "9+" : warningsUnacknowledged}</span
                >
              {/if}
            </button>
          {/if}
          <button
            type="button"
            class="overflow-item"
            class:is-active={voiceResponsesEnabled}
            role="menuitem"
            onclick={() => runOverflowAction(() => onToggleVoiceOutput?.())}
          >
            {voiceResponsesEnabled
              ? $i18n("statusBar.voiceOutput.on.title")
              : $i18n("statusBar.voiceOutput.off.title")}
          </button>
          <button
            type="button"
            class="overflow-item"
            role="menuitem"
            onclick={() => runOverflowAction(() => onToggleTheme?.())}
          >
            {$i18n("statusBar.theme.toggle.title", { theme: currentThemeLabel })}
          </button>
          {#if connectionStatus === "disconnected" || connectionStatus === "error"}
            <button type="button" class="overflow-item" role="menuitem" onclick={handleReconnect}>
              {$i18n("statusBar.reconnect")}
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <button
      class="ui-btn ui-btn-secondary ui-btn-icon btn-settings"
      type="button"
      title={$i18n("statusBar.settings.title")}
      aria-label={$i18n("statusBar.settings.ariaLabel")}
      onclick={() => onOpenSettings?.()}
    >
      <Icon name="settings" size={15} class="icon-settings" />
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
    z-index: var(--z-status);
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
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
  }

  .status-pill:hover {
    border-color: color-mix(in srgb, var(--color-accent) 30%, var(--color-border));
    box-shadow: var(--accent-glow);
    transform: translateY(-1px);
  }

  .status-pill:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .status-pill:active {
    transform: translateY(0) scale(0.99);
  }

  .brand-mark {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: white;
    flex-shrink: 0;
    transition: box-shadow var(--motion-companion);
    box-shadow: var(--accent-glow), 0 0 0 2px var(--color-companion-ring);
  }

  @media (prefers-reduced-motion: no-preference) {
    .brand-mark.companion-live {
      animation: status-ring-pulse 2.4s ease-in-out infinite;
    }
  }

  @keyframes status-ring-pulse {
    0%,
    100% {
      box-shadow: var(--accent-glow), 0 0 0 2px color-mix(in srgb, var(--color-companion-ring) 55%, transparent);
    }
    50% {
      box-shadow: var(--accent-glow), 0 0 0 4px color-mix(in srgb, var(--color-companion-ring) 90%, transparent);
    }
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
    font-size: var(--font-size-md);
    font-weight: 500;
  }

  .connection-label {
    color: var(--color-text);
  }

  .session-sep {
    color: var(--color-muted);
    opacity: 0.7;
  }

  .session {
    font-size: var(--font-size-sm);
    color: var(--color-accent);
  }

  .url {
    color: var(--color-muted);
    font-size: var(--font-size-xs);
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

  :global(.icon-settings) {
    transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .btn-settings:hover :global(.icon-settings) {
    transform: rotate(45deg);
  }

  :global(.icon-theme),
  :global(.icon-voice) {
    transition: transform var(--transition-fast);
  }

  .ui-btn-icon:hover :global(.icon-theme),
  .ui-btn-icon:hover :global(.icon-voice) {
    transform: scale(1.04);
  }

  .ui-btn-icon.is-active {
    color: var(--color-accent);
    border-color: color-mix(in srgb, var(--color-accent) 35%, var(--color-border));
    box-shadow: var(--accent-glow);
  }

  .ui-btn-icon {
    position: relative;
  }

  .action-badge {
    position: absolute;
    top: -0.25rem;
    right: -0.25rem;
    min-width: 1rem;
    height: 1rem;
    padding: 0 0.2rem;
    border-radius: var(--radius-full);
    background: var(--color-accent);
    color: white;
    font-size: 0.5625rem;
    font-weight: 700;
    display: grid;
    place-items: center;
  }

  .action-badge.warning {
    background: var(--color-warning);
  }

  .compact-only {
    display: none;
    position: relative;
  }

  .overflow-menu {
    position: absolute;
    top: calc(100% + var(--space-2));
    right: 0;
    min-width: 11rem;
    padding: var(--space-2);
    border-radius: var(--radius-lg);
    z-index: var(--z-panel);
    display: grid;
    gap: var(--space-1);
  }

  .overflow-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    padding: var(--space-2) var(--space-3);
    font: inherit;
    font-size: var(--font-size-sm);
    text-align: left;
    cursor: pointer;
  }

  .overflow-item:hover,
  .overflow-item.is-active,
  .overflow-item:focus-visible {
    background: color-mix(in srgb, var(--color-accent) 10%, transparent);
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .overflow-badge {
    border-radius: var(--radius-full);
    background: var(--color-accent);
    color: white;
    font-size: 0.625rem;
    font-weight: 700;
    padding: 0.1rem 0.35rem;
  }

  .overflow-badge.warning {
    background: var(--color-warning);
  }

  @media (max-width: 720px) {
    .compact-hide {
      display: none !important;
    }

    .compact-only {
      display: block;
    }

    .status-pill .url {
      max-width: 8rem;
    }
  }
</style>
