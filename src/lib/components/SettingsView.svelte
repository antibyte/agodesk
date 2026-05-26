<script lang="ts">
  import type {
    ConnectionStatus,
    SessionStatus,
    ThemeMode,
  } from "../types/protocol";
  import { getWsOrigin } from "../types/protocol";
  import { loadDeviceId } from "../services/credentials";
  import { collectHostInfo, type HostInfo } from "../services/desktop";
  import { SERVER_PRESETS } from "../services/settings-presets";
  import { normalizeServerUrl } from "../services/server-url";
  import { THEME_LABELS } from "../services/theme";

  interface Props {
    serverUrl?: string;
    theme?: ThemeMode;
    connectionStatus?: ConnectionStatus;
    sessionStatus?: SessionStatus;
    sessionId?: string;
    sessionError?: string;
    remoteControlActive?: boolean;
    appVersion?: string;
    onBack?: () => void;
    onSave?: (settings: { serverUrl: string; theme: ThemeMode }) => void;
    onReconnect?: () => void;
    onRetryPairing?: () => void;
    onUnpair?: () => void;
    onOpenTlsTrust?: () => void;
  }

  let {
    serverUrl = "",
    theme = "system",
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

  type SettingsSection = "connection" | "device" | "appearance" | "desktop" | "about";

  let activeSection = $state<SettingsSection>("connection");
  let draftUrl = $state("");
  let draftTheme = $state<ThemeMode>("system");
  let deviceId = $state<string | null>(null);
  let hostInfo = $state<HostInfo | null>(null);
  let dirty = $state(false);

  const sections: { id: SettingsSection; label: string; hint: string }[] = [
    { id: "connection", label: "Verbindung", hint: "Server & Netzwerk" },
    { id: "device", label: "Gerät", hint: "Pairing & Session" },
    { id: "appearance", label: "Darstellung", hint: "Theme & UI" },
    { id: "desktop", label: "Desktop", hint: "Remote Control" },
    { id: "about", label: "Info", hint: "Version & Hilfe" },
  ];

  const connectionLabels: Record<ConnectionStatus, string> = {
    connected: "Verbunden",
    connecting: "Verbinde…",
    disconnected: "Getrennt",
    error: "Fehler",
  };

  const sessionLabels: Record<SessionStatus, string> = {
    idle: "Inaktiv",
    awaiting_pairing: "Pairing erforderlich",
    pairing: "Authentifiziere…",
    accepted: "Aktiv",
    loopback: "Loopback-Dev",
    error: "Fehler",
  };

  const serverOrigin = $derived.by(() => {
    try {
      return getWsOrigin(normalizeServerUrl(draftUrl));
    } catch {
      return "—";
    }
  });

  const isSecureServer = $derived(/^wss:/i.test(normalizeServerUrl(draftUrl)));

  $effect(() => {
    draftUrl = serverUrl;
    draftTheme = theme;
    dirty = false;
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

  function markDirty(): void {
    dirty = true;
  }

  function applyPreset(url: string): void {
    draftUrl = url;
    markDirty();
  }

  function save(): void {
    onSave?.({
      serverUrl: normalizeServerUrl(draftUrl.trim()),
      theme: draftTheme,
    });
    dirty = false;
    onBack?.();
  }

  function truncate(value: string, max = 28): string {
    if (!value || value.length <= max) {
      return value || "—";
    }
    return `${value.slice(0, max)}…`;
  }
</script>

<div class="settings-page">
  <header class="settings-header">
    <button type="button" class="back-button" onclick={() => onBack?.()}>
      ← Zurück
    </button>
    <div class="header-copy">
      <h1>Einstellungen</h1>
      <p>Konfiguration von Verbindung, Geraet und Darstellung</p>
    </div>
    <div class="header-actions">
      {#if dirty}
        <span class="dirty-badge">Ungespeichert</span>
      {/if}
      <button type="button" class="primary" onclick={save} disabled={!dirty}>
        Speichern & verbinden
      </button>
    </div>
  </header>

  <div class="settings-layout">
    <nav class="settings-nav" aria-label="Einstellungsbereiche">
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
      {#if activeSection === "connection"}
        <section class="card">
          <div class="card-header">
            <h2>WebSocket-Server</h2>
            <p>AuraGo-Endpunkt fuer Chat, Pairing und Desktop-Befehle.</p>
          </div>

          <label class="field">
            <span class="field-label">Server-URL</span>
            <input
              type="url"
              bind:value={draftUrl}
              oninput={markDirty}
              placeholder="wss://host:8443/api/agodesk/ws"
            />
          </label>

          <p class="help">
            Pfad muss auf <code>/api/agodesk/ws</code> enden. Loopback-Dev:
            <code>?insecure_loopback=1</code>
          </p>

          <div class="preset-grid">
            {#each SERVER_PRESETS as preset (preset.id)}
              <button
                type="button"
                class="preset-card"
                class:selected={draftUrl === preset.url}
                onclick={() => applyPreset(preset.url)}
              >
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
              </button>
            {/each}
          </div>
        </section>

        <section class="card">
          <div class="card-header">
            <h2>Verbindungsstatus</h2>
          </div>

          <dl class="info-grid">
            <div>
              <dt>Status</dt>
              <dd>
                <span class="badge" data-tone={connectionStatus}>
                  {connectionLabels[connectionStatus]}
                </span>
              </dd>
            </div>
            <div>
              <dt>Origin</dt>
              <dd><code>{serverOrigin}</code></dd>
            </div>
            <div>
              <dt>Transport</dt>
              <dd>{isSecureServer ? "WSS (TLS)" : "WS (ohne TLS)"}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>
                <span class="badge" data-tone={sessionStatus}>
                  {sessionLabels[sessionStatus]}
                </span>
              </dd>
            </div>
          </dl>

          <div class="action-row">
            <button type="button" class="secondary" onclick={() => onReconnect?.()}>
              Neu verbinden
            </button>
            {#if isSecureServer}
              <button type="button" class="secondary" onclick={() => onOpenTlsTrust?.()}>
                TLS-Zertifikat pruefen
              </button>
            {/if}
          </div>
        </section>
      {/if}

      {#if activeSection === "device"}
        <section class="card">
          <div class="card-header">
            <h2>Geraet & Pairing</h2>
            <p>Gekoppelte Geraete authentifizieren sich per HMAC-Reconnect.</p>
          </div>

          <dl class="info-grid">
            <div>
              <dt>Device-ID</dt>
              <dd><code>{deviceId ?? "Nicht gekoppelt"}</code></dd>
            </div>
            <div>
              <dt>Session-ID</dt>
              <dd><code title={sessionId}>{truncate(sessionId, 36)}</code></dd>
            </div>
            <div>
              <dt>Pairing-Status</dt>
              <dd>{sessionLabels[sessionStatus]}</dd>
            </div>
            {#if hostInfo}
              <div>
                <dt>Hostname</dt>
                <dd>{hostInfo.hostname}</dd>
              </div>
              <div>
                <dt>Plattform</dt>
                <dd>{hostInfo.platform} / {hostInfo.arch}</dd>
              </div>
            {/if}
          </dl>

          {#if sessionError}
            <p class="error-box">{sessionError}</p>
          {/if}

          <div class="action-row">
            <button type="button" class="secondary" onclick={() => onRetryPairing?.()}>
              Session erneut starten
            </button>
            <button type="button" class="secondary danger" onclick={() => onUnpair?.()}>
              Geraet entkoppeln
            </button>
          </div>
        </section>
      {/if}

      {#if activeSection === "appearance"}
        <section class="card">
          <div class="card-header">
            <h2>Erscheinungsbild</h2>
            <p>Theme fuer Chat, Banner und Einstellungen.</p>
          </div>

          <div class="theme-grid">
            {#each Object.entries(THEME_LABELS) as [value, label] (value)}
              <label class="theme-card" class:selected={draftTheme === value}>
                <input
                  type="radio"
                  bind:group={draftTheme}
                  value={value}
                  onchange={markDirty}
                />
                <span class="theme-icon">
                  {value === "system" ? "◐" : value === "light" ? "☀" : "☾"}
                </span>
                <strong>{label}</strong>
                <span>
                  {value === "system"
                    ? "Folgt Windows"
                    : value === "light"
                      ? "Helles Layout"
                      : "Dunkles Layout"}
                </span>
              </label>
            {/each}
          </div>
        </section>
      {/if}

      {#if activeSection === "desktop"}
        <section class="card">
          <div class="card-header">
            <h2>Desktop-Steuerung</h2>
            <p>Screenshots und Eingaben werden nativ ueber Tauri ausgefuehrt.</p>
          </div>

          <dl class="info-grid">
            <div>
              <dt>Screenshots</dt>
              <dd>Monitor & Fenster (Multi-Monitor)</dd>
            </div>
            <div>
              <dt>Maus / Tastatur</dt>
              <dd>Nur nach lokaler Freigabe</dd>
            </div>
            <div>
              <dt>Remote Control</dt>
              <dd>
                <span class="badge" data-tone={remoteControlActive ? "accepted" : "idle"}>
                  {remoteControlActive ? "Freigegeben" : "Nicht aktiv"}
                </span>
              </dd>
            </div>
          </dl>

          <p class="help">
            Screenshots und Eingaben erfordern eine lokale Freigabe im
            Remote-Control-Banner (oben im Fenster).
          </p>
          <p class="help warn">
            Wichtig: Das Geraet muss in AuraGo unter <strong>Remote Control</strong> freigegeben
            werden. Ohne Freigabe antwortet der Agent mit „device is not approved“ und kann keine
            Screenshots anfordern.
          </p>
        </section>
      {/if}

      {#if activeSection === "about"}
        <section class="card">
          <div class="card-header">
            <h2>Ueber agodesk</h2>
          </div>

          <dl class="info-grid">
            <div>
              <dt>Version</dt>
              <dd>{appVersion}</dd>
            </div>
            <div>
              <dt>Protokoll</dt>
              <dd><code>agodesk.v1</code></dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd><code>/api/agodesk/ws</code></dd>
            </div>
          </dl>

          <p class="help">
            Dokumentation: <code>docs/BACKEND_PROTOCOL.md</code> und
            <code>docs/BACKEND_FEATURE_PLANNING.md</code>
          </p>
        </section>
      {/if}
    </div>
  </div>
</div>

<style>
  .settings-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--color-bg);
  }

  .settings-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    box-shadow: var(--color-panel-shadow);
    flex-wrap: wrap;
  }

  .header-copy {
    flex: 1;
    min-width: 12rem;
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
  }

  .dirty-badge {
    font-size: 0.8125rem;
    color: #d97706;
  }

  .settings-layout {
    display: grid;
    grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr);
    gap: 1rem;
    padding: 1rem;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .settings-nav {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    overflow: auto;
  }

  .nav-item {
    display: grid;
    gap: 0.15rem;
    text-align: left;
    border: 1px solid transparent;
    border-radius: 0.75rem;
    padding: 0.75rem 0.9rem;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .nav-item:hover {
    background: color-mix(in srgb, var(--color-accent) 8%, transparent);
  }

  .nav-item.active {
    border-color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 12%, transparent);
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
  }

  .card {
    border: 1px solid var(--color-border);
    border-radius: 1rem;
    padding: 1rem 1.1rem;
    background: var(--color-surface);
    box-shadow: var(--color-panel-shadow);
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

  .field-label {
    font-size: 0.875rem;
    font-weight: 600;
  }

  input[type="url"] {
    border: 1px solid var(--color-border);
    border-radius: 0.65rem;
    padding: 0.7rem 0.8rem;
    background: var(--color-input-bg);
    color: var(--color-text);
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

  .preset-grid,
  .theme-grid {
    display: grid;
    gap: 0.65rem;
    margin-top: 1rem;
  }

  .preset-grid {
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  }

  .preset-card,
  .theme-card {
    display: grid;
    gap: 0.25rem;
    text-align: left;
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    padding: 0.8rem;
    background: var(--color-input-bg);
    cursor: pointer;
    color: inherit;
  }

  .preset-card.selected,
  .theme-card.selected {
    border-color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 10%, var(--color-input-bg));
  }

  .preset-card span:last-child,
  .theme-card span:last-child {
    font-size: 0.8125rem;
    color: var(--color-muted);
  }

  .theme-grid {
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  }

  .theme-card input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .theme-icon {
    font-size: 1.25rem;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 0.85rem 1rem;
    margin: 1rem 0 0;
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

  .badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 0.15rem 0.55rem;
    font-size: 0.8125rem;
    background: var(--color-input-bg);
    border: 1px solid var(--color-border);
  }

  .badge[data-tone="connected"],
  .badge[data-tone="accepted"],
  .badge[data-tone="loopback"] {
    border-color: #22c55e;
    color: #15803d;
  }

  .badge[data-tone="connecting"],
  .badge[data-tone="pairing"],
  .badge[data-tone="awaiting_pairing"] {
    border-color: #eab308;
    color: #a16207;
  }

  .badge[data-tone="error"],
  .badge[data-tone="disconnected"] {
    border-color: #ef4444;
    color: #b91c1c;
  }

  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .error-box {
    margin: 1rem 0 0;
    padding: 0.75rem 0.85rem;
    border-radius: 0.65rem;
    background: var(--color-system-bg);
    color: var(--color-system-text);
    font-size: 0.875rem;
  }

  .back-button,
  .primary,
  .secondary {
    border-radius: 0.55rem;
    padding: 0.55rem 0.9rem;
    cursor: pointer;
    font: inherit;
  }

  .back-button,
  .secondary {
    border: 1px solid var(--color-border);
    background: transparent;
    color: inherit;
  }

  .primary {
    border: none;
    background: var(--color-accent);
    color: white;
  }

  .primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .danger {
    border-color: #ef4444;
    color: #ef4444;
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
