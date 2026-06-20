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
      case "desktop_ui_tree":
        return $i18n("remoteControl.operation.uiTree");
      case "desktop_ui_action":
        return $i18n("remoteControl.operation.uiAction");
      case "desktop_browser_connect":
        return $i18n("remoteControl.operation.browserConnect");
      case "desktop_browser_snapshot":
        return $i18n("remoteControl.operation.browserSnapshot");
      case "desktop_browser_action":
        return $i18n("remoteControl.operation.browserAction");
      case "desktop_browser_disconnect":
        return $i18n("remoteControl.operation.browserDisconnect");
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
    class="remote-banner banner-glass"
    data-tone={active ? "success" : "warning"}
    class:is-active={active}
    aria-live="assertive"
    role="dialog"
    aria-labelledby="remote-title"
  >
    <div>
      <strong id="remote-title">
        {active ? $i18n("remoteControl.title.active") : $i18n("remoteControl.title.pending")}
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
        <button type="button" class="ui-btn ui-btn-danger" onclick={() => onStop?.()}>
          {$i18n("remoteControl.stop")}
        </button>
      {:else if pending}
        <button type="button" class="ui-btn ui-btn-primary" onclick={() => onApprove?.()}>
          {$i18n("remoteControl.approve")}
        </button>
        <button type="button" class="ui-btn ui-btn-secondary" onclick={() => onDeny?.()}>
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
    gap: var(--space-4);
    margin: 0;
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
    z-index: var(--z-banner);
  }

  .op {
    color: var(--color-muted);
    font-size: 0.8125rem;
  }

  p {
    margin: var(--space-2) 0 0;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    flex-shrink: 0;
  }
</style>
