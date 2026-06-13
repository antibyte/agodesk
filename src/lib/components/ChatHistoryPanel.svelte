<script lang="ts">
  import { i18n } from "../i18n";
  import type { ChatSessionSummary } from "../types/protocol";
  import { formatDayLabel } from "../i18n/format";
  import { activeLocale } from "../i18n/store";

  import { filterVisibleChatSessions } from "../types/protocol";

  interface Props {
    visible?: boolean;
    sessions?: ChatSessionSummary[];
    activeConversationId?: string | null;
    onSelect?: (conversationId: string) => void;
    onNewChat?: () => void;
    onClose?: () => void;
  }

  let {
    visible = false,
    sessions = [],
    activeConversationId = null,
    onSelect,
    onNewChat,
    onClose,
  }: Props = $props();

  const visibleSessions = $derived(filterVisibleChatSessions(sessions));

  function formatWhen(value: string): string {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return formatDayLabel(value, $activeLocale);
  }
</script>

{#if visible}
  <aside class="chat-history-panel glass-panel" aria-label={$i18n("chatView.history.title")}>
    <header class="panel-header">
      <h2>{$i18n("chatView.history.title")}</h2>
      <div class="header-actions">
        <button
          type="button"
          class="ui-btn ui-btn-secondary ui-btn-sm"
          onclick={() => onNewChat?.()}
        >
          {$i18n("chatView.newChat")}
        </button>
        <button
          type="button"
          class="ui-btn ui-btn-secondary ui-btn-sm"
          aria-label={$i18n("common.close")}
          onclick={() => onClose?.()}
        >
          ×
        </button>
      </div>
    </header>

    {#if visibleSessions.length === 0}
      <p class="empty">{$i18n("chatView.history.empty")}</p>
    {:else}
      <ul class="session-list">
        {#each visibleSessions as session (session.id)}
          <li>
            <button
              type="button"
              class="session-item"
              class:active={session.id === activeConversationId}
              onclick={() => onSelect?.(session.id)}
            >
              <span class="preview">{session.preview || $i18n("chatView.history.untitled")}</span>
              <span class="meta">
                {formatWhen(session.last_active_at || session.created_at)}
                · {$i18n("chatView.history.messageCount", { count: session.message_count })}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>
{/if}

<style>
  .chat-history-panel {
    position: absolute;
    top: calc(100% + var(--space-3));
    left: var(--space-4);
    width: min(22rem, calc(100vw - 2rem));
    max-height: min(24rem, 50vh);
    display: flex;
    flex-direction: column;
    z-index: 5;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--glass-border);
  }

  .panel-header h2 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    gap: var(--space-2);
  }

  .empty {
    margin: 0;
    padding: var(--space-4);
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .session-list {
    list-style: none;
    margin: 0;
    padding: var(--space-2);
    overflow: auto;
  }

  .session-item {
    width: 100%;
    text-align: left;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    padding: var(--space-3);
    cursor: pointer;
    color: inherit;
  }

  .session-item:hover,
  .session-item.active {
    background: color-mix(in srgb, var(--color-accent) 10%, transparent);
    border-color: color-mix(in srgb, var(--color-accent) 25%, transparent);
  }

  .preview {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    display: block;
    margin-top: var(--space-1);
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
</style>
