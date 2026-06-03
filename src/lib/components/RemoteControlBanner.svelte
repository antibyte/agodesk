<script lang="ts">
  import { i18n } from "../i18n";

  interface Props {
    visible?: boolean;
    pending?: boolean;
    active?: boolean;
    operation?: string;
    onApprove?: () => void;
    onDeny?: () => void;
    onStop?: () => void;
  }

  let {
    visible = false,
    pending = false,
    active = false,
    operation = "",
    onApprove,
    onDeny,
    onStop,
  }: Props = $props();

  const operationLabel = $derived.by(() => {
    switch (operation) {
      case "desktop_screenshot":
        return $i18n("remoteControl.operation.screenshot");
      case "desktop_input":
        return $i18n("remoteControl.operation.input");
      case "desktop_permission_request":
        return $i18n("remoteControl.operation.permissionRequest");
      default:
        return operation
          ? $i18n("remoteControl.operation.default")
          : $i18n("remoteControl.operation.default");
    }
  });
</script>

{#if visible}
  <div
    class="remote-banner"
    class:active
    aria-live="assertive"
    role="dialog"
    aria-labelledby="remote-title"
  >
    <div>
      <strong id="remote-title">
        {active
          ? $i18n("remoteControl.title.active")
          : $i18n("remoteControl.title.pending")}
      </strong>
      <p>
        {active
          ? $i18n("remoteControl.description.active")
          : $i18n("remoteControl.description.pending")}
        {#if operation}
          <span class="op">({operationLabel})</span>
        {/if}
      </p>
    </div>
    <div class="actions">
      {#if active}
        <button type="button" class="danger" onclick={() => onStop?.()}>
          {$i18n("remoteControl.stop")}
        </button>
      {:else if pending}
        <button type="button" onclick={() => onApprove?.()}>
          {$i18n("remoteControl.approve")}
        </button>
        <button type="button" class="secondary" onclick={() => onDeny?.()}>
          {$i18n("remoteControl.deny")}
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .remote-banner {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 1.25rem;
    border-bottom: 2px solid #f59e0b;
    background: color-mix(in srgb, #f59e0b 22%, var(--color-surface));
    box-shadow: 0 2px 8px color-mix(in srgb, #f59e0b 25%, transparent);
    z-index: 20;
  }

  .remote-banner.active {
    border-bottom-color: #22c55e;
    background: color-mix(in srgb, #22c55e 14%, var(--color-surface));
  }

  .op {
    color: var(--color-muted);
    font-size: 0.8125rem;
  }

  p {
    margin: 0.35rem 0 0;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  button {
    border: none;
    border-radius: 0.5rem;
    padding: 0.55rem 0.9rem;
    background: var(--color-accent);
    color: white;
    cursor: pointer;
  }

  .secondary,
  .danger {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text);
  }

  .danger {
    border-color: #ef4444;
    color: #ef4444;
  }
</style>
