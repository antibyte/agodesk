<script lang="ts">
  import type { MessageKey } from "../i18n/types";
  import { i18n } from "../i18n";
  import type { WebhostIntegration } from "../types/protocol";
  import { resolvePersonaAssetUrl } from "../types/protocol";
  import { openExternalUrl } from "../services/open-external-url";
  import IntegrationIcon from "./IntegrationIcon.svelte";

  interface Props {
    visible?: boolean;
    webhosts?: WebhostIntegration[];
    serverUrl?: string;
    onClose?: () => void;
    onOpenEmbedded?: (url: string, title?: string) => void;
  }

  let { visible = false, webhosts = [], serverUrl = "", onClose, onOpenEmbedded }: Props = $props();

  function resolveWebhostUrl(url: string): string {
    return resolvePersonaAssetUrl(serverUrl, url);
  }

  function statusLabel(status: string): string {
    if (status === "running" || status === "starting" || status === "stopped") {
      return $i18n(`integrations.status.${status}` as MessageKey);
    }
    return status;
  }

  function statusTone(status: string): string {
    if (status === "running") {
      return "running";
    }
    if (status === "starting") {
      return "starting";
    }
    return "stopped";
  }

  function openWebhost(webhost: WebhostIntegration): void {
    const url = resolveWebhostUrl(webhost.url);
    if (onOpenEmbedded) {
      onOpenEmbedded(url, webhost.name);
      return;
    }
    void openExternalUrl(url);
  }
</script>

{#if visible}
  <aside class="integrations-panel glass-panel" aria-label={$i18n("integrations.title")}>
    <header class="panel-header">
      <h2>{$i18n("integrations.title")}</h2>
      <button
        type="button"
        class="ui-btn ui-btn-secondary ui-btn-sm"
        aria-label={$i18n("common.close")}
        onclick={() => onClose?.()}
      >
        ×
      </button>
    </header>

    {#if webhosts.length === 0}
      <p class="empty">{$i18n("integrations.empty")}</p>
    {:else}
      <ul class="webhost-list">
        {#each webhosts as webhost (webhost.id)}
          <li>
            <button type="button" class="webhost-item" onclick={() => openWebhost(webhost)}>
              <IntegrationIcon
                icon={webhost.icon}
                webhostUrl={webhost.url}
                {serverUrl}
                label={webhost.name}
              />
              <span class="copy">
                <span class="name">{webhost.name}</span>
                {#if webhost.description}
                  <span class="description">{webhost.description}</span>
                {/if}
                <span class="status" data-tone={statusTone(webhost.status)}>
                  {statusLabel(webhost.status)}
                </span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>
{/if}

<style>
  .integrations-panel {
    position: absolute;
    top: calc(100% + var(--space-2));
    right: var(--space-5);
    width: min(22rem, calc(100vw - 2rem));
    max-height: min(24rem, 50vh);
    overflow: auto;
    z-index: 5;
    border-radius: var(--radius-xl);
    padding: var(--space-3);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .panel-header h2 {
    margin: 0;
    font-size: 0.9375rem;
  }

  .empty {
    margin: 0;
    color: var(--color-muted);
    font-size: 0.8125rem;
  }

  .webhost-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }

  .webhost-item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    width: 100%;
    text-align: left;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--glass-surface) 70%, transparent);
    padding: var(--space-3);
    cursor: pointer;
    color: inherit;
  }

  .webhost-item:hover {
    border-color: color-mix(in srgb, var(--color-accent) 30%, var(--color-border));
  }

  .copy {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  .name {
    font-weight: 600;
    font-size: 0.875rem;
  }

  .description {
    font-size: 0.75rem;
    color: var(--color-muted);
  }

  .status {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .status[data-tone="running"] {
    color: var(--color-success);
  }

  .status[data-tone="starting"] {
    color: var(--color-warning);
  }

  .status[data-tone="stopped"] {
    color: var(--color-muted);
  }
</style>
