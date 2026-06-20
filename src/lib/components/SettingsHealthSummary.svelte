<script lang="ts">
  import { i18n } from "../i18n";
  import type { ConnectionStatus, SessionStatus, SpeechProvider } from "../types/protocol";

  type HealthTone = "ready" | "blocked" | "thinking" | "error";

  interface Props {
    connectionStatus: ConnectionStatus;
    sessionStatus: SessionStatus;
    speechEnabled: boolean;
    speechProvider: SpeechProvider;
    fileAccessEnabled: boolean;
    fileRootCount: number;
    shellAccessEnabled: boolean;
    shellCwdCount: number;
    openPetsEnabled: boolean;
    dirty: boolean;
  }

  let {
    connectionStatus,
    sessionStatus,
    speechEnabled,
    speechProvider,
    fileAccessEnabled,
    fileRootCount,
    shellAccessEnabled,
    shellCwdCount,
    openPetsEnabled,
    dirty,
  }: Props = $props();

  const connectionTone = $derived.by((): HealthTone => {
    if (connectionStatus === "error" || sessionStatus === "error") {
      return "error";
    }
    if (
      connectionStatus === "connected" &&
      (sessionStatus === "accepted" || sessionStatus === "loopback")
    ) {
      return "ready";
    }
    return "blocked";
  });

  const connectionDetail = $derived.by(() => {
    if (connectionTone === "ready") {
      return $i18n("settings.health.connection.ready");
    }
    if (connectionTone === "error") {
      return $i18n("settings.health.connection.error");
    }
    return $i18n("settings.health.connection.blocked");
  });

  const speechTone = $derived<HealthTone>(speechEnabled ? "ready" : "blocked");

  const speechDetail = $derived(
    speechEnabled
      ? $i18n("settings.health.speech.provider", { provider: speechProvider })
      : $i18n("settings.health.speech.disabled"),
  );

  const accessTone = $derived.by((): HealthTone => {
    if (fileAccessEnabled && fileRootCount > 0) {
      return "ready";
    }
    if (shellAccessEnabled && shellCwdCount > 0) {
      return "thinking";
    }
    return "blocked";
  });

  const accessDisabledOnly = $derived(!fileAccessEnabled && !shellAccessEnabled);

  const companionTone = $derived<HealthTone>(openPetsEnabled ? "ready" : "blocked");

  const companionDetail = $derived(
    openPetsEnabled
      ? $i18n("settings.health.companion.enabled")
      : $i18n("settings.health.companion.disabled"),
  );

  function statusLabel(tone: HealthTone): string {
    const key =
      tone === "ready"
        ? "settings.health.status.ready"
        : tone === "thinking"
          ? "settings.health.status.thinking"
          : tone === "error"
            ? "settings.health.status.error"
            : "settings.health.status.blocked";
    return $i18n(key);
  }

  function chipTone(tone: HealthTone): string {
    if (tone === "ready") {
      return "connected";
    }
    if (tone === "error") {
      return "error";
    }
    if (tone === "thinking") {
      return "connecting";
    }
    return "idle";
  }
</script>

<section class="settings-health" aria-labelledby="settings-health-title">
  <div class="settings-health-head">
    <h2 id="settings-health-title">{$i18n("settings.health.title")}</h2>
    {#if dirty}
      <span class="ui-chip" data-tone="warning">{$i18n("settings.health.unsaved")}</span>
    {/if}
  </div>

  <div class="settings-health-grid">
    <article class="health-card ui-card" data-tone={connectionTone}>
      <h3>{$i18n("settings.health.connection.title")}</h3>
      <span class="health-status ui-chip" data-tone={chipTone(connectionTone)}
        >{statusLabel(connectionTone)}</span
      >
      <p>{connectionDetail}</p>
    </article>

    <article class="health-card ui-card" data-tone={speechTone}>
      <h3>{$i18n("settings.health.speech.title")}</h3>
      <span class="health-status ui-chip" data-tone={chipTone(speechTone)}
        >{statusLabel(speechTone)}</span
      >
      <p>{speechDetail}</p>
    </article>

    <article class="health-card ui-card" data-tone={accessTone}>
      <h3>{$i18n("settings.health.access.title")}</h3>
      <span class="health-status ui-chip" data-tone={chipTone(accessTone)}
        >{statusLabel(accessTone)}</span
      >
      {#if accessDisabledOnly}
        <p>{$i18n("settings.health.access.disabled")}</p>
      {:else}
        <div class="access-lines">
          {#if fileAccessEnabled}
            <span>{$i18n("settings.health.access.files", { count: String(fileRootCount) })}</span>
          {/if}
          {#if shellAccessEnabled}
            <span>{$i18n("settings.health.access.shell", { count: String(shellCwdCount) })}</span>
          {/if}
        </div>
      {/if}
    </article>

    <article class="health-card ui-card" data-tone={companionTone}>
      <h3>{$i18n("settings.health.companion.title")}</h3>
      <span class="health-status ui-chip" data-tone={chipTone(companionTone)}
        >{statusLabel(companionTone)}</span
      >
      <p>{companionDetail}</p>
    </article>
  </div>
</section>

<style>
  .settings-health {
    flex-shrink: 0;
    padding: 0 var(--space-5) var(--space-4);
  }

  .settings-health-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .settings-health-head h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 650;
  }

  .settings-health-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .health-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
    min-height: 0;
  }

  .health-card h3 {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-strong);
  }

  .health-card p {
    margin: 0;
    font-size: var(--font-size-xs);
    line-height: var(--line-height-normal);
    color: var(--color-muted);
  }

  .access-lines {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: var(--font-size-xs);
    line-height: var(--line-height-normal);
    color: var(--color-muted);
  }

  .health-status {
    align-self: flex-start;
  }

  @media (max-width: 1100px) {
    .settings-health-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 820px) {
    .settings-health-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-height: 720px) and (min-width: 821px) {
    .settings-health-grid {
      grid-template-columns: repeat(4, minmax(10rem, 1fr));
      overflow-x: auto;
      padding-bottom: var(--space-1);
    }
  }
</style>
