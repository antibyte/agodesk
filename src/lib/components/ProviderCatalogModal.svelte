<script lang="ts">
  import { focusTrap } from "../actions/focusTrap";
  import { i18n } from "../i18n";
  import type { ConfigProviderCatalogEntry } from "../types/protocol";

  interface Props {
    open?: boolean;
    entries?: ConfigProviderCatalogEntry[];
    busy?: boolean;
    onClose?: () => void;
    onSelect?: (entry: ConfigProviderCatalogEntry) => void;
  }

  let { open = false, entries = [], busy = false, onClose, onSelect }: Props = $props();
</script>

{#if open}
  <div class="catalog-backdrop" role="presentation" onclick={() => onClose?.()}></div>
  <dialog
    class="catalog-modal ui-card glass-panel"
    open
    use:focusTrap
    aria-modal="true"
    aria-labelledby="catalog-title"
    onclick={(event) => event.stopPropagation()}
  >
      <header class="catalog-header">
        <h2 id="catalog-title">{$i18n("settings.llmProviders.catalog.title")}</h2>
        <p>{$i18n("settings.llmProviders.catalog.description")}</p>
      </header>

      {#if busy}
        <p class="catalog-loading">{$i18n("settings.llmProviders.catalog.loading")}</p>
      {:else if entries.length === 0}
        <p class="catalog-empty">{$i18n("settings.llmProviders.catalog.empty")}</p>
      {:else}
        <ul class="catalog-list">
          {#each entries as entry (entry.id)}
            <li>
              <button
                type="button"
                class="catalog-item"
                disabled={entry.available === false}
                onclick={() => onSelect?.(entry)}
              >
                <span class="catalog-name">{entry.name}</span>
                {#if entry.default_model}
                  <span class="catalog-model">{entry.default_model}</span>
                {/if}
                {#if entry.availability}
                  <span
                    class="ui-chip"
                    data-tone={entry.available === false ? "error" : "connected"}
                  >
                    {entry.availability}
                  </span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="catalog-actions">
        <button type="button" class="ui-btn ghost" onclick={() => onClose?.()}>
          {$i18n("certModal.cancel")}
        </button>
      </div>
    </dialog>
{/if}

<style>
  .catalog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1150;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
  }

  .catalog-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 1160;
    transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 2rem));
    max-height: min(80vh, 720px);
    overflow: auto;
    margin: 0;
    border: none;
    padding: 1.25rem;
  }

  .catalog-header h2 {
    margin: 0;
  }

  .catalog-header p {
    margin: 0.35rem 0 1rem;
    opacity: 0.85;
  }

  .catalog-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }

  .catalog-item {
    width: 100%;
    text-align: left;
    display: grid;
    gap: 0.25rem;
    padding: 0.75rem;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
    background: color-mix(in srgb, var(--surface) 92%, transparent);
  }

  .catalog-item:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .catalog-name {
    font-weight: 600;
  }

  .catalog-model {
    font-size: 0.85rem;
    opacity: 0.75;
  }

  .catalog-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
  }
</style>
