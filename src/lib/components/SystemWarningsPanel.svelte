<script lang="ts">
  import { i18n } from "../i18n";
  import type { MessageKey } from "../i18n/types";
  import ChatMessageBody from "./ChatMessageBody.svelte";
  import type { SystemWarning } from "../types/protocol";
  import { formatMessageTime } from "../services/chat-format";
  import { focusTrap } from "../actions/focusTrap";
  import Icon from "./Icon.svelte";

  interface Props {
    visible?: boolean;
    warnings?: SystemWarning[];
    unacknowledged?: number;
    onClose?: () => void;
    onAcknowledge?: (id: string) => void;
    onAcknowledgeAll?: () => void;
  }

  let {
    visible = false,
    warnings = [],
    unacknowledged = 0,
    onClose,
    onAcknowledge,
    onAcknowledgeAll,
  }: Props = $props();

  function severityLabel(severity: string): string {
    if (severity === "info" || severity === "warning" || severity === "error") {
      return $i18n(`warnings.severity.${severity}` as MessageKey);
    }
    return severity;
  }
</script>

{#if visible}
  <aside class="warnings-panel glass-panel" aria-label={$i18n("warnings.title")} use:focusTrap>
    <header class="panel-header">
      <div>
        <h2>{$i18n("warnings.title")}</h2>
        {#if unacknowledged > 0}
          <p class="badge-line">
            <span class="unack-count">{unacknowledged}</span>
            <span>{$i18n("warnings.unacknowledgedLabel")}</span>
          </p>
        {/if}
      </div>
      <div class="header-actions">
        {#if unacknowledged > 0}
          <button
            type="button"
            class="ui-btn ui-btn-secondary ui-btn-sm"
            onclick={() => onAcknowledgeAll?.()}
          >
            {$i18n("warnings.acknowledgeAll")}
          </button>
        {/if}
        <button
          type="button"
          class="ui-btn ui-btn-secondary ui-btn-sm"
          aria-label={$i18n("common.close")}
          onclick={() => onClose?.()}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </header>

    {#if warnings.length === 0}
      <p class="empty">{$i18n("warnings.empty")}</p>
    {:else}
      <ul class="warning-list">
        {#each warnings as warning (warning.id)}
          <li class="warning-item" data-severity={warning.severity} data-ack={warning.acknowledged}>
            <div class="warning-head">
              <span class="severity">{severityLabel(warning.severity)}</span>
              {#if warning.category}
                <span class="category">{warning.category}</span>
              {/if}
              {#if warning.timestamp}
                <time datetime={warning.timestamp}>{formatMessageTime(warning.timestamp)}</time>
              {/if}
            </div>
            <h3>{warning.title}</h3>
            {#if warning.description}
              <div class="description">
                <ChatMessageBody text={warning.description} tone="assistant" />
              </div>
            {/if}
            {#if !warning.acknowledged}
              <button
                type="button"
                class="ui-btn ui-btn-secondary ui-btn-sm"
                onclick={() => onAcknowledge?.(warning.id)}
              >
                {$i18n("warnings.acknowledge")}
              </button>
            {:else}
              <span class="ack-label">{$i18n("warnings.acknowledged")}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </aside>
{/if}

<style>
  .warnings-panel {
    position: absolute;
    top: calc(100% + var(--space-2));
    right: var(--space-5);
    width: min(24rem, calc(100vw - 2rem));
    max-height: min(28rem, 55vh);
    overflow: auto;
    z-index: var(--z-panel);
    border-radius: var(--radius-xl);
    padding: var(--space-3);
  }

  .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .panel-header h2 {
    margin: 0;
    font-size: 0.9375rem;
  }

  .badge-line {
    margin: 0.15rem 0 0;
    display: inline-flex;
    align-items: baseline;
    gap: 0.35rem;
    font-size: 0.75rem;
    color: var(--color-warning);
  }

  .unack-count {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .header-actions {
    display: flex;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .empty {
    margin: 0;
    color: var(--color-muted);
    font-size: 0.8125rem;
  }

  .warning-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }

  .warning-item {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
    background: color-mix(in srgb, var(--glass-surface) 70%, transparent);
  }

  .warning-item[data-severity="error"] {
    border-color: color-mix(in srgb, var(--color-danger) 35%, var(--color-border-subtle));
  }

  .warning-item[data-severity="warning"] {
    border-color: color-mix(in srgb, var(--color-warning) 35%, var(--color-border-subtle));
  }

  .warning-head {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    font-size: 0.6875rem;
    color: var(--color-muted);
    margin-bottom: var(--space-1);
  }

  .severity {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .warning-item h3 {
    margin: 0 0 var(--space-2);
    font-size: 0.875rem;
  }

  .description :global(.message-body) {
    font-size: 0.8125rem;
  }

  .ack-label {
    font-size: 0.75rem;
    color: var(--color-muted);
  }
</style>
