<script lang="ts">
  import { focusTrap } from "../actions/focusTrap";
  import { i18n } from "../i18n";

  interface Props {
    open?: boolean;
    providerName?: string;
    manualPasteEnabled?: boolean;
    manualRedirectUrl?: string;
    busy?: boolean;
    errorMessage?: string;
    onCancel?: () => void;
    onManualPaste?: (redirectUrl: string) => void;
  }

  let {
    open = false,
    providerName = "",
    manualPasteEnabled = false,
    manualRedirectUrl = $bindable(""),
    busy = false,
    errorMessage = "",
    onCancel,
    onManualPaste,
  }: Props = $props();

  let modalEl = $state<HTMLDialogElement | null>(null);
  let firstBtn = $state<HTMLButtonElement | null>(null);

  $effect(() => {
    if (open && modalEl) {
      setTimeout(() => {
        (firstBtn || modalEl)?.focus();
      }, 10);
    }
  });
</script>

{#if open}
  <div class="oauth-modal-backdrop" role="presentation">
    <dialog
      bind:this={modalEl}
      class="oauth-modal ui-card"
      open
      aria-labelledby="oauth-progress-title"
      use:focusTrap
    >
      <h2 id="oauth-progress-title">{$i18n("settings.llmProviders.oauth.title")}</h2>
      <p class="oauth-intro">
        {$i18n("settings.llmProviders.oauth.waiting", { name: providerName || "Provider" })}
      </p>

      {#if busy}
        <div class="oauth-spinner" aria-hidden="true"></div>
      {/if}
      <p class="oauth-status">{$i18n("settings.llmProviders.oauth.browserHint")}</p>

      {#if errorMessage}
        <p class="oauth-error" role="alert">{errorMessage}</p>
      {/if}

      {#if manualPasteEnabled}
        <label class="oauth-manual">
          <span>{$i18n("settings.llmProviders.oauth.manualLabel")}</span>
          <input
            type="url"
            bind:value={manualRedirectUrl}
            placeholder={$i18n("settings.llmProviders.oauth.manualPlaceholder")}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          class="ui-btn"
          disabled={busy || !manualRedirectUrl.trim()}
          onclick={() => onManualPaste?.(manualRedirectUrl.trim())}
        >
          {$i18n("settings.llmProviders.oauth.manualSubmit")}
        </button>
      {/if}

      <div class="oauth-actions">
        <button
          bind:this={firstBtn}
          type="button"
          class="ui-btn ghost"
          onclick={() => onCancel?.()}
        >
          {$i18n("certModal.cancel")}
        </button>
      </div>
    </dialog>
  </div>
{/if}

<style>
  .oauth-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1200;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
  }

  .oauth-modal {
    width: min(480px, calc(100vw - 2rem));
    margin: 0;
    border: none;
    padding: 1.25rem;
  }

  .oauth-intro {
    margin: 0.5rem 0 1rem;
    opacity: 0.85;
  }

  .oauth-spinner {
    width: 2rem;
    height: 2rem;
    margin: 0.75rem auto;
    border-radius: 999px;
    border: 3px solid color-mix(in srgb, var(--text) 20%, transparent);
    border-top-color: var(--accent, #6ea8fe);
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .oauth-status,
  .oauth-error {
    margin: 0.75rem 0;
  }

  .oauth-error {
    color: var(--danger, #f87171);
  }

  .oauth-manual {
    display: grid;
    gap: 0.35rem;
    margin: 1rem 0;
  }

  .oauth-manual input {
    width: 100%;
  }

  .oauth-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
  }
</style>
