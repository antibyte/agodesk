<script lang="ts">
  import { i18n } from "../i18n";
  import { getWsOrigin } from "../types/protocol";
  import { loadPairingToken, savePairingToken } from "../services/credentials";

  interface Props {
    visible?: boolean;
    busy?: boolean;
    serverUrl?: string;
    errorMessage?: string;
    onPair?: (token: string) => void;
    onUnpair?: () => void;
  }

  let {
    visible = false,
    busy = false,
    serverUrl = "",
    errorMessage = "",
    onPair,
    onUnpair,
  }: Props = $props();

  let pairingToken = $state("");
  let showToken = $state(false);
  let loadedOrigin = $state("");

  $effect(() => {
    if (!visible || !serverUrl) {
      return;
    }

    const origin = getWsOrigin(serverUrl);
    if (loadedOrigin === origin) {
      return;
    }

    loadedOrigin = origin;
    void loadPairingToken(origin).then((token) => {
      pairingToken = token ?? "";
    });
  });

  function submit(): void {
    const token = pairingToken.trim();
    if (!token) {
      return;
    }
    if (serverUrl) {
      void savePairingToken(getWsOrigin(serverUrl), token);
    }
    onPair?.(token);
  }
</script>

{#if visible}
  <section class="pairing-banner" aria-live="polite">
    <div class="intro">
      <strong>{$i18n("pairing.title")}</strong>
      <p>{$i18n("pairing.description")}</p>
      <ol class="steps">
        <li>{$i18n("pairing.step1")}</li>
        <li>{$i18n("pairing.step2")}</li>
      </ol>
      {#if errorMessage}
        <p class="error">{errorMessage}</p>
      {/if}
    </div>
    <div class="actions">
      <div class="token-row">
        <input
          type={showToken ? "text" : "password"}
          bind:value={pairingToken}
          placeholder={$i18n("pairing.token.placeholder")}
          disabled={busy}
          autocomplete="off"
          onchange={() => {
            if (serverUrl && pairingToken.trim()) {
              void savePairingToken(getWsOrigin(serverUrl), pairingToken);
            }
          }}
        />
        <button
          type="button"
          class="secondary icon-btn"
          aria-label={showToken
            ? $i18n("pairing.token.hide.ariaLabel")
            : $i18n("pairing.token.show.ariaLabel")}
          title={showToken
            ? $i18n("pairing.token.hide.title")
            : $i18n("pairing.token.show.title")}
          onclick={() => (showToken = !showToken)}
        >
          {showToken ? "◉" : "◎"}
        </button>
      </div>
      <button type="button" disabled={busy || !pairingToken.trim()} onclick={submit}>
        {busy ? $i18n("pairing.submit.busy") : $i18n("pairing.submit")}
      </button>
      <button
        type="button"
        class="secondary"
        disabled={busy}
        onclick={() => {
          pairingToken = "";
          onUnpair?.();
        }}
      >
        {$i18n("pairing.reset")}
      </button>
    </div>
  </section>
{/if}

<style>
  .pairing-banner {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.85rem 1.25rem;
    border-bottom: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-accent) 8%, var(--color-surface));
  }

  .intro p {
    margin: 0.35rem 0 0;
    color: var(--color-muted);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .steps {
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;
    color: var(--color-muted);
    font-size: 0.8125rem;
  }

  .error {
    color: var(--color-danger);
    background: var(--color-danger-soft);
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    margin-top: 0.5rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .token-row {
    display: flex;
    gap: 0.35rem;
    flex: 1;
    min-width: 12rem;
  }

  input {
    flex: 1;
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    padding: 0.55rem 0.75rem;
    background: var(--color-input-bg);
    color: var(--color-text);
  }

  button {
    border: none;
    border-radius: 0.5rem;
    padding: 0.55rem 0.9rem;
    background: var(--color-accent);
    color: white;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .secondary {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text);
  }

  .icon-btn {
    min-width: 2.5rem;
    padding-inline: 0.5rem;
  }
</style>
