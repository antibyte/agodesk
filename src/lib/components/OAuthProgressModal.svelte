<script lang="ts">
  import { focusTrap } from "../actions/focusTrap";
  import { dialogModal } from "../actions/dialogModal";
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
  <dialog
    bind:this={modalEl}
    class="oauth-modal ui-card"
    use:dialogModal={{ open: true, onClose: onCancel }}
    use:focusTrap
    aria-labelledby="oauth-progress-title"
  >
      <h2 id="oauth-progress-title">{$i18n("settings.llmProviders.oauth.title")}</h2>

      {#if errorMessage}
        <p class="oauth-error" role="alert">{errorMessage}</p>
        <div class="oauth-recovery">
          <p>{$i18n("settings.llmProviders.oauth.recoveryTitle")}</p>
          <ol>
            <li>{$i18n("settings.llmProviders.oauth.recoveryStep1")}</li>
            <li>{$i18n("settings.llmProviders.oauth.recoveryStep2")}</li>
            <li>{$i18n("settings.llmProviders.oauth.recoveryStep3")}</li>
          </ol>
        </div>
      {:else}
        <p class="oauth-intro">
          {$i18n("settings.llmProviders.oauth.waiting", { name: providerName || "Provider" })}
        </p>

        {#if busy}
          <div class="oauth-spinner" aria-hidden="true"></div>
        {/if}
        <p class="oauth-status">{$i18n("settings.llmProviders.oauth.browserHint")}</p>

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
{/if}

<style>
  .oauth-modal {
    width: min(480px, calc(100vw - 2rem));
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

  .oauth-recovery {
    margin: 0.75rem 0 1rem;
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--color-warning-soft) 80%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-warning) 25%, transparent);
    font-size: var(--font-size-sm);
  }

  .oauth-recovery ol {
    margin: var(--space-2) 0 0;
    padding-left: 1.2rem;
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
