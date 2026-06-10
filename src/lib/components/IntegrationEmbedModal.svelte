<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { i18n } from "../i18n";
  import { openExternalUrl } from "../services/open-external-url";
  import {
    closeIntegrationEmbed,
    isIntegrationEmbedAvailable,
    openIntegrationEmbed,
    readEmbedHostBounds,
    syncEmbedHostBounds,
  } from "../services/integration-embed";

  interface Props {
    open?: boolean;
    url?: string;
    title?: string;
    onClose?: () => void;
  }

  let { open = false, url = "", title = "", onClose }: Props = $props();

  const nativeEmbedAvailable = isIntegrationEmbedAvailable();

  let hostEl: HTMLDivElement | undefined = $state();
  let shellVisible = $state(false);
  let usingNativeEmbed = $state(false);
  let embedLoading = $state(false);
  let embedFailed = $state(false);
  let mountGeneration = 0;
  let resizeObserver: ResizeObserver | null = null;

  async function mountEmbed(targetUrl: string, generation: number): Promise<void> {
    if (!targetUrl || generation !== mountGeneration) {
      return;
    }

    if (!nativeEmbedAvailable) {
      embedLoading = false;
      embedFailed = false;
      return;
    }

    embedLoading = true;
    embedFailed = false;
    await tick();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    if (generation !== mountGeneration || !hostEl || !shellVisible) {
      embedLoading = false;
      embedFailed = generation === mountGeneration && !hostEl;
      return;
    }

    const bounds = await readEmbedHostBounds(hostEl);
    usingNativeEmbed = await openIntegrationEmbed(targetUrl, bounds);
    if (generation !== mountGeneration) {
      if (usingNativeEmbed) {
        void closeIntegrationEmbed();
      }
      return;
    }

    if (usingNativeEmbed && hostEl) {
      await syncEmbedHostBounds(hostEl);
      window.setTimeout(() => {
        if (generation === mountGeneration && hostEl) {
          void syncEmbedHostBounds(hostEl);
        }
      }, 120);
    }
    embedLoading = false;
    embedFailed = !usingNativeEmbed;
  }

  function teardownEmbed(): void {
    usingNativeEmbed = false;
    embedLoading = false;
    embedFailed = false;
    void closeIntegrationEmbed();
  }

  $effect(() => {
    const isOpen = open;
    const targetUrl = url;

    if (isOpen && targetUrl) {
      shellVisible = true;
      const generation = ++mountGeneration;
      void mountEmbed(targetUrl, generation);
      return;
    }

    mountGeneration += 1;
    shellVisible = false;
    teardownEmbed();
  });

  onMount(() => {
    resizeObserver = new ResizeObserver(() => {
      if (!open || !shellVisible || !usingNativeEmbed || !hostEl) {
        return;
      }
      void syncEmbedHostBounds(hostEl);
    });
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    mountGeneration += 1;
    void closeIntegrationEmbed();
  });

  $effect(() => {
    if (!hostEl || !resizeObserver) {
      return;
    }
    resizeObserver.disconnect();
    if (open && shellVisible) {
      resizeObserver.observe(hostEl);
    }
  });

  function handleClose(): void {
    mountGeneration += 1;
    shellVisible = false;
    teardownEmbed();
    onClose?.();
  }
</script>

{#if shellVisible && url}
  <div class="embed-backdrop" role="presentation" onclick={handleClose}></div>
  <section class="embed-modal glass-panel" aria-label={title || $i18n("integrations.embed.title")}>
    <header class="embed-header">
      <h2>{title || $i18n("integrations.embed.title")}</h2>
      <div class="actions">
        <button
          type="button"
          class="ui-btn ui-btn-secondary ui-btn-sm"
          onclick={() => void openExternalUrl(url)}
        >
          {$i18n("integrations.embed.openExternal")}
        </button>
        <button
          type="button"
          class="ui-btn ui-btn-secondary ui-btn-sm"
          aria-label={$i18n("common.close")}
          onclick={handleClose}
        >
          ×
        </button>
      </div>
    </header>
    <div class="embed-host" bind:this={hostEl}>
      {#if !nativeEmbedAvailable}
        <iframe class="embed-frame" src={url} title={title || $i18n("integrations.embed.title")}></iframe>
      {:else if embedLoading}
        <p class="embed-placeholder">{$i18n("integrations.embed.loading")}</p>
      {:else if embedFailed}
        <div class="embed-placeholder">
          <p>{$i18n("integrations.embed.unavailable")}</p>
          <button
            type="button"
            class="ui-btn ui-btn-secondary ui-btn-sm"
            onclick={() => void openExternalUrl(url)}
          >
            {$i18n("integrations.embed.openExternal")}
          </button>
        </div>
      {/if}
    </div>
  </section>
{/if}

<style>
  .embed-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 30;
  }

  .embed-modal {
    position: fixed;
    inset: var(--space-5);
    z-index: 31;
    display: grid;
    grid-template-rows: auto 1fr;
    border-radius: var(--radius-xl);
    overflow: hidden;
    pointer-events: none;
  }

  .embed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border-subtle);
    pointer-events: auto;
  }

  .embed-header h2 {
    margin: 0;
    font-size: 0.9375rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .embed-host {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 12rem;
    background: #ffffff;
    pointer-events: none;
  }

  .embed-frame {
    width: 100%;
    height: 100%;
    border: 0;
    background: white;
    pointer-events: auto;
  }

  .embed-placeholder {
    display: grid;
    place-content: center;
    gap: var(--space-3);
    height: 100%;
    padding: var(--space-4);
    text-align: center;
    color: var(--color-text-muted);
    pointer-events: auto;
  }

  .embed-placeholder p {
    margin: 0;
  }
</style>
