<script lang="ts">
  import { i18n } from "../i18n";
  import type { UpdateStatus } from "../services/update-flow";

  interface Props {
    visible?: boolean;
    version?: string;
    notes?: string;
    status?: UpdateStatus;
    progress?: number;
    onInstall?: () => void;
    onDismiss?: () => void;
  }

  let {
    visible = false,
    version = "",
    notes = "",
    status = "available",
    progress = 0,
    onInstall,
    onDismiss,
  }: Props = $props();

  const installing = $derived(status === "downloading");
</script>

{#if visible}
  <div
    class="update-banner banner-glass"
    data-tone="info"
    aria-live="polite"
    role="dialog"
    aria-labelledby="update-banner-title"
  >
    <div class="copy">
      <strong id="update-banner-title">{$i18n("update.banner.title")}</strong>
      <p>
        {$i18n("update.banner.description", { version: version || "?" })}
      </p>
      {#if notes}
        <p class="notes">{notes}</p>
      {/if}
      {#if installing}
        <div class="progress-wrap" aria-label={$i18n("update.banner.installing")}>
          <div class="progress-bar" style:width="{Math.max(0, Math.min(100, progress))}%"></div>
        </div>
        <p class="progress-label">
          {$i18n("update.banner.progress", { percent: String(progress) })}
        </p>
      {/if}
    </div>
    <div class="actions">
      {#if !installing}
        <button type="button" class="ui-btn ui-btn-primary" onclick={() => onInstall?.()}>
          {$i18n("update.banner.install")}
        </button>
        <button type="button" class="ui-btn ui-btn-secondary" onclick={() => onDismiss?.()}>
          {$i18n("update.banner.later")}
        </button>
      {:else}
        <button type="button" class="ui-btn ui-btn-primary" disabled>
          {$i18n("update.banner.installing")}
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .update-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    margin: 0;
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
    z-index: var(--z-banner);
  }

  .copy {
    min-width: 0;
    flex: 1;
  }

  .copy p {
    margin: var(--space-2) 0 0;
    font-size: var(--font-size-sm);
    line-height: var(--line-height-normal);
  }

  .notes {
    color: var(--color-muted);
    white-space: pre-wrap;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    flex-shrink: 0;
  }

  .progress-wrap {
    margin-top: var(--space-3);
    height: 0.35rem;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--color-text) 10%, transparent);
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    border-radius: inherit;
    background: var(--color-accent);
    transition: width var(--transition-fast);
  }

  .progress-label {
    margin-top: var(--space-1);
    font-size: var(--font-size-xs);
    color: var(--color-footnote);
  }
</style>
