<script lang="ts">
  import { i18n } from "../i18n";
  import { getWsOrigin } from "../types/protocol";
  import { loadPairingToken, savePairingToken } from "../services/credentials";

  interface Props {
    visible?: boolean;
    busy?: boolean;
    compact?: boolean;
    serverUrl?: string;
    errorMessage?: string;
    focusRequest?: number;
    onPair?: (token: string) => void;
    onUnpair?: () => void;
  }

  let {
    visible = false,
    busy = false,
    compact = false,
    serverUrl = "",
    errorMessage = "",
    focusRequest = 0,
    onPair,
    onUnpair,
  }: Props = $props();

  let pairingToken = $state("");
  let showToken = $state(false);
  let loadedOrigin = $state("");
  let tokenInputEl = $state<HTMLInputElement | undefined>();

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

  $effect(() => {
    void focusRequest;
    if (!visible || focusRequest <= 0) {
      return;
    }
    queueMicrotask(() => {
      tokenInputEl?.focus();
      tokenInputEl?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
  <section class="pairing-banner banner-glass" class:compact data-tone="accent" aria-live="polite">
    <div class="intro">
      <strong>{$i18n("pairing.title")}</strong>
      {#if !compact}
        <p>{$i18n("pairing.description")}</p>
        <ol class="steps">
          <li>{$i18n("pairing.step1")}</li>
          <li>{$i18n("pairing.step2")}</li>
        </ol>
      {/if}
      {#if errorMessage}
        <p class="error banner-glass" data-tone="danger">{errorMessage}</p>
      {/if}
    </div>
    <div class="actions">
      <div class="token-row">
        <input
          bind:this={tokenInputEl}
          class="ui-input"
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
          class="ui-btn ui-btn-secondary ui-btn-icon"
          aria-label={showToken
            ? $i18n("pairing.token.hide.ariaLabel")
            : $i18n("pairing.token.show.ariaLabel")}
          title={showToken ? $i18n("pairing.token.hide.title") : $i18n("pairing.token.show.title")}
          onclick={() => (showToken = !showToken)}
        >
          {showToken ? "◉" : "◎"}
        </button>
      </div>
      <button
        type="button"
        class="ui-btn ui-btn-primary"
        disabled={busy || !pairingToken.trim()}
        onclick={submit}
      >
        {busy ? $i18n("pairing.submit.busy") : $i18n("pairing.submit")}
      </button>
      <button
        type="button"
        class="ui-btn ui-btn-secondary"
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
    gap: var(--space-3);
    margin: 0;
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
  }

  .pairing-banner.compact {
    gap: var(--space-2);
  }

  .pairing-banner.compact .actions {
    flex-wrap: nowrap;
  }

  .intro p {
    margin: var(--space-2) 0 0;
    color: var(--color-muted);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .steps {
    margin: var(--space-2) 0 0;
    padding-left: 1.25rem;
    color: var(--color-muted);
    font-size: 0.8125rem;
  }

  .error {
    margin: var(--space-3) 0 0;
    padding: var(--space-2) var(--space-3);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    align-items: center;
  }

  .token-row {
    display: flex;
    gap: var(--space-2);
    flex: 1;
    min-width: 12rem;
  }

  .token-row .ui-input {
    flex: 1;
  }
</style>
