<script lang="ts">
  import { i18n } from "../i18n";
  import { vaultSecretPromptState } from "../stores/vault-secret-prompt";
  import { focusTrap } from "../actions/focusTrap";
  import { dialogModal } from "../actions/dialogModal";

  interface Props {
    /** Send the entered secret to the server. Value is never persisted/logged. */
    onSubmit?: (value: string) => void | Promise<void>;
    onCancel?: () => void | Promise<void>;
  }

  let { onSubmit, onCancel }: Props = $props();

  // Plaintext lives ONLY in this component-local state and is cleared on close.
  let value = $state("");
  let reveal = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);

  const request = $derived($vaultSecretPromptState.request);
  const busy = $derived($vaultSecretPromptState.busy);
  const open = $derived(request !== null);
  const canSave = $derived(value.trim().length > 0 && !busy);

  // Reset local secret state whenever a new prompt appears or the dialog closes.
  let lastRequestId = $state<string | null>(null);
  $effect(() => {
    const currentId = request?.requestId ?? null;
    if (currentId !== lastRequestId) {
      lastRequestId = currentId;
      value = "";
      reveal = false;
      if (currentId) {
        setTimeout(() => inputEl?.focus(), 10);
      }
    }
  });

  async function save(): Promise<void> {
    if (!canSave) {
      return;
    }
    const secret = value;
    // Clear the local copy immediately; the server owns storage from here.
    value = "";
    await onSubmit?.(secret);
  }

  async function cancel(): Promise<void> {
    value = "";
    reveal = false;
    await onCancel?.();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      void cancel();
    }
  }
</script>

{#if open && request}
  <dialog
    class="modal ui-card glass-panel"
    use:dialogModal={{ open: true, onClose: () => void cancel() }}
    use:focusTrap
    aria-modal="true"
    aria-labelledby="vault-secret-title"
    onclick={(e) => e.stopPropagation()}
    onkeydown={onKeydown}
  >
    <h2 id="vault-secret-title">{$i18n("vaultSecretPrompt.title")}</h2>

    {#if request.prompt}
      <p class="prompt">{request.prompt}</p>
    {/if}

    <p class="privacy-hint" role="note">{$i18n("vaultSecretPrompt.hint")}</p>

    <dl class="meta">
      <div>
        <dt>{$i18n("vaultSecretPrompt.keyLabel")}</dt>
        <dd class="mono">{request.vaultKey}</dd>
      </div>
    </dl>

    <form
      class="entry"
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label class="sr-only" for="vault-secret-input">
        {$i18n("vaultSecretPrompt.inputLabel")}
      </label>
      <div class="field">
        <input
          bind:this={inputEl}
          id="vault-secret-input"
          type={reveal ? "text" : "password"}
          class="ui-input"
          bind:value
          placeholder={$i18n("vaultSecretPrompt.placeholder")}
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          disabled={busy}
        />
        <button
          type="button"
          class="ui-btn ui-btn-ghost reveal"
          onclick={() => (reveal = !reveal)}
          aria-pressed={reveal}
          disabled={busy}
        >
          {reveal ? $i18n("vaultSecretPrompt.hide") : $i18n("vaultSecretPrompt.show")}
        </button>
      </div>

      <div class="actions">
        <button
          type="button"
          class="ui-btn ui-btn-secondary"
          onclick={() => void cancel()}
          disabled={busy}
        >
          {$i18n("vaultSecretPrompt.cancel")}
        </button>
        <button type="submit" class="ui-btn ui-btn-primary" disabled={!canSave}>
          {busy ? $i18n("vaultSecretPrompt.saving") : $i18n("vaultSecretPrompt.save")}
        </button>
      </div>
    </form>
  </dialog>
{/if}

<style>
  .modal {
    width: min(92vw, 32rem);
    padding: var(--space-5);
  }

  h2 {
    margin: 0 0 var(--space-3);
    font-size: 1.125rem;
  }

  .prompt {
    margin: 0 0 var(--space-3);
    font-size: 0.95rem;
    line-height: 1.5;
    color: var(--color-text);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .privacy-hint {
    margin: 0 0 var(--space-4);
    padding: var(--space-3);
    border-radius: var(--radius-md, 0.5rem);
    border: 1px solid color-mix(in srgb, var(--color-accent) 30%, var(--color-border));
    background: color-mix(in srgb, var(--color-accent) 10%, transparent);
    color: var(--color-muted);
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .meta {
    display: grid;
    gap: var(--space-1);
    margin: 0 0 var(--space-4);
  }

  dt {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted);
  }

  dd {
    margin: 0;
    font-size: 0.875rem;
    word-break: break-word;
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .entry {
    display: grid;
    gap: var(--space-4);
  }

  .field {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .field .ui-input {
    flex: 1;
    min-width: 0;
  }

  .reveal {
    flex: 0 0 auto;
    font-size: 0.8125rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
