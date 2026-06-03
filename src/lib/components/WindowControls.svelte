<script lang="ts">
  import { onMount } from "svelte";
  import { i18n } from "../i18n";
  import { closeMainWindow, isDesktopShell, minimizeMainWindow } from "../services/window-controls";

  interface Props {
    minimizeToTray?: boolean;
  }

  let { minimizeToTray = false }: Props = $props();

  let visible = $state(false);

  onMount(() => {
    visible = isDesktopShell();
  });

  const closeLabel = $derived(
    minimizeToTray ? $i18n("windowControls.close.minimizeToTray") : $i18n("windowControls.close.default"),
  );
</script>

{#if visible}
  <div class="window-controls">
    <button
      type="button"
      class="win-btn"
      aria-label={$i18n("windowControls.minimize.ariaLabel")}
      title={$i18n("windowControls.minimize.title")}
      onclick={() => void minimizeMainWindow()}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M1 5h8" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
      </svg>
    </button>
    <button
      type="button"
      class="win-btn win-btn-close"
      aria-label={closeLabel}
      title={closeLabel}
      onclick={() => void closeMainWindow()}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2 2 8 8M8 2 2 8" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
      </svg>
    </button>
  </div>
{/if}

<style>
  .window-controls {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    margin-left: var(--space-1);
    padding-left: var(--space-2);
    border-left: 1px solid var(--color-border-subtle);
  }

  .win-btn {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-muted);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }

  .win-btn:hover {
    background: var(--color-input-bg);
    color: var(--color-text);
  }

  .win-btn-close:hover {
    background: var(--color-danger-soft);
    color: var(--color-danger);
  }
</style>
