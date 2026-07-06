<script lang="ts">
  import { onMount } from "svelte";
  import { i18n } from "../i18n";
  import {
    closeMainWindow,
    isDesktopShell,
    minimizeMainWindow,
    toggleMaximizeMainWindow,
  } from "../services/window-controls";

  interface Props {
    minimizeToTray?: boolean;
  }

  let { minimizeToTray = false }: Props = $props();

  let visible = $state(false);
  let maximized = $state(false);

  onMount(() => {
    visible = isDesktopShell();
    if (!visible) {
      return;
    }
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      maximized = await win.isMaximized();
      const unlisten = await win.onResized(async () => {
        maximized = await win.isMaximized();
      });
      return () => {
        void unlisten();
      };
    });
  });

  const closeLabel = $derived(
    minimizeToTray
      ? $i18n("windowControls.close.minimizeToTray")
      : $i18n("windowControls.close.default"),
  );

  async function handleToggleMaximize(): Promise<void> {
    maximized = await toggleMaximizeMainWindow();
  }
</script>

{#if visible}
  <div class="window-controls">
    <button
      type="button"
      class="win-btn ui-btn ui-btn-icon"
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
      class="win-btn ui-btn ui-btn-icon"
      aria-label={maximized
        ? $i18n("windowControls.restore.ariaLabel")
        : $i18n("windowControls.maximize.ariaLabel")}
      title={maximized
        ? $i18n("windowControls.restore.title")
        : $i18n("windowControls.maximize.title")}
      onclick={() => void handleToggleMaximize()}
    >
      {#if maximized}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M3 2.5h4.5V7M2.5 3v4.5H7"
            stroke="currentColor"
            stroke-width="1.1"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      {:else}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect
            x="1.75"
            y="1.75"
            width="6.5"
            height="6.5"
            rx="1"
            stroke="currentColor"
            stroke-width="1.1"
            fill="none"
          />
        </svg>
      {/if}
    </button>
    <button
      type="button"
      class="win-btn win-btn-close ui-btn ui-btn-icon"
      aria-label={closeLabel}
      title={closeLabel}
      onclick={() => void closeMainWindow()}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path
          d="M2 2 8 8M8 2 2 8"
          stroke="currentColor"
          stroke-width="1.25"
          stroke-linecap="round"
        />
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
    width: var(--ui-btn-icon-size);
    height: var(--ui-btn-icon-size);
  }

  .win-btn-close:hover {
    background: var(--color-danger-soft);
    color: var(--color-danger);
  }
</style>
