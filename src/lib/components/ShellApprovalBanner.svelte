<script lang="ts">
  import { i18n } from "../i18n";

  interface Props {
    visible?: boolean;
    command?: string;
    cwdLabel?: string;
    cwdDisplay?: string;
    timeoutMs?: number;
    onApprove?: () => void;
    onDeny?: () => void;
    onStopSession?: () => void;
  }

  let {
    visible = false,
    command = "",
    cwdLabel = "",
    cwdDisplay = "",
    timeoutMs = 0,
    onApprove,
    onDeny,
    onStopSession,
  }: Props = $props();

  const timeoutSeconds = $derived(Math.max(1, Math.round(timeoutMs / 1000)));
</script>

{#if visible}
  <div
    class="shell-banner banner-glass"
    data-tone="warning"
    aria-live="assertive"
    role="dialog"
    aria-labelledby="shell-approval-title"
  >
    <div>
      <strong id="shell-approval-title">{$i18n("shellApproval.title")}</strong>
      <p>{$i18n("shellApproval.description")}</p>
      <dl class="details">
        <div>
          <dt>{$i18n("shellApproval.command")}</dt>
          <dd><code>{command}</code></dd>
        </div>
        <div>
          <dt>{$i18n("shellApproval.cwd")}</dt>
          <dd>{cwdLabel} ({cwdDisplay})</dd>
        </div>
        <div>
          <dt>{$i18n("shellApproval.timeout")}</dt>
          <dd>{$i18n("shellApproval.timeoutValue", { seconds: timeoutSeconds })}</dd>
        </div>
        <div>
          <dt>{$i18n("shellApproval.origin")}</dt>
          <dd>{$i18n("common.brand.aurago")}</dd>
        </div>
      </dl>
    </div>
    <div class="actions">
      <button type="button" class="ui-btn ui-btn-primary" onclick={() => onApprove?.()}>
        {$i18n("shellApproval.run")}
      </button>
      <button type="button" class="ui-btn ui-btn-secondary" onclick={() => onDeny?.()}>
        {$i18n("shellApproval.deny")}
      </button>
      <button type="button" class="ui-btn ui-btn-danger" onclick={() => onStopSession?.()}>
        {$i18n("shellApproval.stopSession")}
      </button>
    </div>
  </div>
{/if}

<style>
  .shell-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 1rem;
    margin: 0.5rem 0.75rem 0;
    border-radius: var(--radius-md, 10px);
  }

  .details {
    display: grid;
    gap: 0.35rem;
    margin: 0.65rem 0 0;
    font-size: 0.85rem;
  }

  .details dt {
    font-weight: 600;
    opacity: 0.85;
  }

  .details dd {
    margin: 0;
    word-break: break-word;
  }

  .details code {
    display: block;
    white-space: pre-wrap;
    font-family: var(--font-mono, monospace);
    font-size: 0.82rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
</style>
