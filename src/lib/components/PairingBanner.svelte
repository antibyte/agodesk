<script lang="ts">
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
    <div>
      <strong>Geraet koppeln</strong>
      <p>
        Nach erfolgreicher Kopplung reconnectet agodesk automatisch. Der
        Enrollment-Token wird bis dahin pro Server gespeichert.
      </p>
      {#if errorMessage}
        <p class="error">{errorMessage}</p>
      {/if}
    </div>
    <div class="actions">
      <input
        type="password"
        bind:value={pairingToken}
        placeholder="Pairing-Token"
        disabled={busy}
        autocomplete="off"
        onchange={() => {
          if (serverUrl && pairingToken.trim()) {
            void savePairingToken(getWsOrigin(serverUrl), pairingToken);
          }
        }}
      />
      <button type="button" disabled={busy || !pairingToken.trim()} onclick={submit}>
        {busy ? "Koppelt…" : "Koppeln"}
      </button>
      <button type="button" class="secondary" disabled={busy} onclick={() => onUnpair?.()}>
        Geraet entfernen
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

  p {
    margin: 0.35rem 0 0;
    color: var(--color-muted);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .error {
    color: var(--color-system-text);
    background: var(--color-system-bg);
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  input {
    flex: 1;
    min-width: 12rem;
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
</style>
