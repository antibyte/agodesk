<script lang="ts">
  import { i18n } from "../i18n";
  import type { CertificateProbeResult, ClientErrorCode } from "../types/protocol";
  import {
    browserOrigin,
    detectAntivirusTlsInterception,
    probeServerCertificate,
  } from "../services/tls";
  import { focusTrap } from "../actions/focusTrap";
  import { dialogModal } from "../actions/dialogModal";

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

  let modalEl = $state<HTMLDialogElement | null>(null);
  let firstActionBtn = $state<HTMLButtonElement | null>(null);

  const title = $derived.by(() => {
    switch (errorCode) {
      case "CERTIFICATE_PIN_MISMATCH":
        return $i18n("certModal.title.pinMismatch");
      case "CERTIFICATE_EXPIRED":
        return $i18n("certModal.title.expired");
      default:
        return $i18n("certModal.title.untrusted");
    }
  });

  const mitmProduct = $derived(probe ? detectAntivirusTlsInterception(probe.issuer) : null);

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
        probeError = error instanceof Error ? error.message : $i18n("certModal.error.readFailed");
      })
      .finally(() => {
        loading = false;
      });
  });

  // Focus management on open (quick win for a11y)
  // Note: Escape is handled centrally in parent ChatView for priority (cert > settings)
  $effect(() => {
    if (open && modalEl) {
      // small timeout to allow DOM paint
      setTimeout(() => {
        (firstActionBtn || modalEl)?.focus();
      }, 10);
    }
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
  <dialog
    bind:this={modalEl}
    class="modal ui-card glass-panel"
    use:dialogModal={{ open: true, onClose }}
    use:focusTrap
    aria-modal="true"
    aria-labelledby="cert-title"
    onclick={(e) => e.stopPropagation()}
  >
    <h2 id="cert-title">{title}</h2>
    <p class="intro">{$i18n("certModal.intro")}</p>

    {#if mitmProduct}
      <p class="mitm-warning" role="status">
        {$i18n("certModal.mitmWarning", { product: mitmProduct })}
      </p>
    {/if}

    <dl class="details">
      <div>
        <dt>{$i18n("certModal.host.label")}</dt>
        <dd>{browserOrigin(serverUrl)}</dd>
      </div>
      {#if loading}
        <div class="status">{$i18n("certModal.loading")}</div>
      {:else if probeError}
        <div class="status error">{probeError}</div>
      {:else if probe}
        <div>
          <dt>{$i18n("certModal.subject.label")}</dt>
          <dd>{probe.subject}</dd>
        </div>
        <div>
          <dt>{$i18n("certModal.issuer.label")}</dt>
          <dd>{probe.issuer}</dd>
        </div>
        <div>
          <dt>{$i18n("certModal.validUntil.label")}</dt>
          <dd>{probe.not_after}</dd>
        </div>
        <div>
          <dt>{$i18n("certModal.fingerprint.label")}</dt>
          <dd class="mono">{probe.sha256_fingerprint}</dd>
        </div>
      {/if}
    </dl>

    <div class="actions">
      <button
        bind:this={firstActionBtn}
        type="button"
        class="ui-btn ui-btn-secondary"
        onclick={() => onClose?.()}
      >
        {$i18n("certModal.cancel")}
      </button>
      {#if serverUrl.startsWith("wss://")}
        <button type="button" class="ui-btn ui-btn-secondary" onclick={openBrowser}>
          {$i18n("certModal.openBrowser")}
        </button>
      {/if}
      <button
        type="button"
        class="ui-btn ui-btn-primary"
        disabled={!probe || loading}
        onclick={trust}
      >
        {$i18n("certModal.trust")}
      </button>
    </div>
  </dialog>
{/if}

<style>
  .modal {
    width: min(92vw, 36rem);
    padding: var(--space-5);
  }

  h2 {
    margin: 0 0 var(--space-3);
    font-size: 1.125rem;
  }

  .intro {
    margin: 0 0 var(--space-4);
    font-size: 0.875rem;
    color: var(--color-muted);
    line-height: 1.5;
  }

  .mitm-warning {
    margin: 0 0 var(--space-4);
    padding: var(--space-3);
    border-radius: var(--radius-md, 0.5rem);
    border: 1px solid color-mix(in srgb, var(--color-warning) 40%, var(--color-border));
    background: var(--color-warning-soft);
    color: color-mix(in srgb, var(--color-warning) 75%, var(--color-text));
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .details {
    display: grid;
    gap: var(--space-3);
    margin: 0;
  }

  .details > div {
    display: grid;
    gap: var(--space-1);
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
    color: var(--color-danger);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-top: var(--space-5);
  }
</style>
