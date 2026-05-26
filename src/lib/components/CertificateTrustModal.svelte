<script lang="ts">
  import type { CertificateProbeResult, ClientErrorCode } from "../types/protocol";
  import { browserOrigin, probeServerCertificate } from "../services/tls";

  interface Props {
    open?: boolean;
    serverUrl?: string;
    errorCode?: ClientErrorCode | null;
    onClose?: () => void;
    onTrust?: (probe: CertificateProbeResult) => void;
    onOpenBrowser?: (url: string) => void;
  }

  let {
    open = false,
    serverUrl = "",
    errorCode = null,
    onClose,
    onTrust,
    onOpenBrowser,
  }: Props = $props();

  let loading = $state(false);
  let probeError = $state("");
  let probe = $state<CertificateProbeResult | null>(null);

  const title = $derived.by(() => {
    switch (errorCode) {
      case "CERTIFICATE_PIN_MISMATCH":
        return "Server-Zertifikat hat sich geaendert";
      case "CERTIFICATE_EXPIRED":
        return "Server-Zertifikat ist abgelaufen";
      default:
        return "Server-Zertifikat ist nicht vertrauenswuerdig";
    }
  });

  $effect(() => {
    if (!open || !serverUrl.startsWith("wss://")) {
      probe = null;
      probeError = "";
      loading = false;
      return;
    }

    loading = true;
    probeError = "";
    probe = null;

    void probeServerCertificate(serverUrl)
      .then((result) => {
        probe = result;
      })
      .catch((error) => {
        probeError =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Zertifikat konnte nicht gelesen werden.";
      })
      .finally(() => {
        loading = false;
      });
  });

  function trust(): void {
    if (probe) {
      onTrust?.(probe);
    }
  }

  function openBrowser(): void {
    const httpsUrl = serverUrl.replace(/^wss:/, "https:").replace(/\/api\/agodesk\/ws.*$/, "/");
    onOpenBrowser?.(httpsUrl);
  }
</script>

{#if open}
  <div class="backdrop" role="presentation" onclick={() => onClose?.()}></div>
  <dialog class="modal" open aria-labelledby="cert-title">
    <h2 id="cert-title">{title}</h2>
    <p class="intro">
      Die Verbindung zu AuraGo konnte wegen eines TLS-Problems nicht hergestellt werden.
      Pairing und Chat sind davon unabhaengig — zuerst muss das Zertifikat geprueft werden.
    </p>

    <dl class="details">
      <div>
        <dt>Host</dt>
        <dd>{browserOrigin(serverUrl)}</dd>
      </div>
      {#if loading}
        <div class="status">Zertifikat wird gelesen…</div>
      {:else if probeError}
        <div class="status error">{probeError}</div>
      {:else if probe}
        <div>
          <dt>Subject</dt>
          <dd>{probe.subject}</dd>
        </div>
        <div>
          <dt>Issuer</dt>
          <dd>{probe.issuer}</dd>
        </div>
        <div>
          <dt>Gueltig bis</dt>
          <dd>{probe.not_after}</dd>
        </div>
        <div>
          <dt>SHA-256 Fingerprint</dt>
          <dd class="mono">{probe.sha256_fingerprint}</dd>
        </div>
      {/if}
    </dl>

    <div class="actions">
      <button type="button" class="secondary" onclick={() => onClose?.()}>Abbrechen</button>
      {#if serverUrl.startsWith("wss://")}
        <button type="button" class="secondary" onclick={openBrowser}>
          AuraGo im Browser oeffnen
        </button>
      {/if}
      <button type="button" disabled={!probe || loading} onclick={trust}>
        Dieses Zertifikat fuer diesen Server vertrauen
      </button>
    </div>
  </dialog>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--color-backdrop);
    z-index: 20;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 21;
    width: min(92vw, 36rem);
    margin: 0;
    border: 1px solid var(--color-border);
    border-radius: 1rem;
    padding: 1.25rem;
    background: var(--color-surface);
    color: var(--color-text);
  }

  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.125rem;
  }

  .intro {
    margin: 0 0 1rem;
    font-size: 0.875rem;
    color: var(--color-muted);
    line-height: 1.5;
  }

  .details {
    display: grid;
    gap: 0.75rem;
    margin: 0;
  }

  .details > div {
    display: grid;
    gap: 0.25rem;
  }

  dt {
    font-size: 0.75rem;
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
    font-size: 0.8125rem;
  }

  .status {
    font-size: 0.875rem;
    color: var(--color-muted);
  }

  .status.error {
    color: #ef4444;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1.25rem;
  }

  button {
    border: none;
    border-radius: 0.5rem;
    padding: 0.55rem 0.9rem;
    cursor: pointer;
    background: var(--color-accent);
    color: white;
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
