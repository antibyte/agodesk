<script lang="ts">
  import { tick } from "svelte";
  import { fly } from "svelte/transition";
  import { i18n } from "../i18n";
  import MessageBubble from "./MessageBubble.svelte";
  import PersonaAvatar from "./PersonaAvatar.svelte";
  import { chatMessages } from "../stores/chat";
  import { personaState } from "../stores/persona";
  import { formatDayLabel } from "../services/chat-format";
  import type { ConnectionStatus, SessionStatus } from "../types/protocol";

  interface Props {
    awaitingResponse?: boolean;
    sessionStatus?: SessionStatus;
    connectionStatus?: ConnectionStatus;
    speechActive?: boolean;
    onOpenSettings?: () => void;
  }

  let {
    awaitingResponse = false,
    sessionStatus = "idle",
    connectionStatus = "disconnected",
    speechActive = false,
    onOpenSettings,
  }: Props = $props();

  let container: HTMLDivElement | undefined = $state();
  let shouldStickToBottom = $state(true);
  let lastSeenCount = $state(0);

  const newMessageCount = $derived(
    Math.max(0, $chatMessages.length - lastSeenCount),
  );

  const showScrollFab = $derived(!shouldStickToBottom && $chatMessages.length > 0);

  const scrollFabTitle = $derived(
    newMessageCount > 0
      ? $i18n("messageList.scrollToBottom.titleNew", {
          count: newMessageCount > 99 ? "99+" : String(newMessageCount),
        })
      : $i18n("messageList.scrollToBottom.titleGeneric"),
  );

  function handleScroll(): void {
    if (!container) {
      return;
    }
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottom = distanceFromBottom < 48;
    if (shouldStickToBottom) {
      lastSeenCount = $chatMessages.length;
    }
  }

  async function scrollToBottom(): Promise<void> {
    await tick();
    if (container) {
      container.scrollTop = container.scrollHeight;
      lastSeenCount = $chatMessages.length;
      shouldStickToBottom = true;
    }
  }

  function dayLabelFor(timestamp: string, index: number): string {
    if (index === 0) {
      return formatDayLabel(timestamp);
    }
    const prev = $chatMessages[index - 1];
    const currentDay = formatDayLabel(timestamp);
    const prevDay = formatDayLabel(prev.timestamp);
    return currentDay !== prevDay ? currentDay : "";
  }

  $effect(() => {
    const messages = $chatMessages;
    void messages.length;
    void awaitingResponse;
    if (shouldStickToBottom) {
      lastSeenCount = messages.length;
    }
    void scrollToBottom();
  });
</script>

<div class="message-list-wrap">
  <div class="message-list" bind:this={container} onscroll={handleScroll}>
    {#if $chatMessages.length === 0}
      <div class="empty">
        <div class="empty-avatar" class:pulse={speechActive}>
          <PersonaAvatar
            imageUrl={$personaState.avatarUrl}
            label={$personaState.persona}
            size="lg"
            loading={$personaState.loading}
          />
        </div>
        <h2>{$i18n("messageList.empty.title")}</h2>
        <p>{$i18n("messageList.empty.description")}</p>
        {#if sessionStatus === "awaiting_pairing"}
          <button type="button" class="cta" onclick={() => onOpenSettings?.()}>
            {$i18n("messageList.empty.pairDevice")}
          </button>
        {:else if connectionStatus !== "connected"}
          <p class="hint">{$i18n("chatView.hint.noConnection")}</p>
        {/if}
        <ul class="tips">
          <li>
            <kbd>Enter</kbd> — {$i18n("messageList.tip.sendMessage")}
          </li>
          <li>
            <kbd>Shift</kbd>+<kbd>Enter</kbd> — {$i18n("messageList.tip.newline")}
          </li>
          <li>
            <strong>{$i18n("messageList.tip.settingsLabel")}</strong>
            — {$i18n("messageList.tip.settingsDescription")}
          </li>
        </ul>
      </div>
    {:else}
      {#each $chatMessages as message, index (message.id)}
        {@const dayLabel = dayLabelFor(message.timestamp, index)}
        {#if dayLabel}
          <div class="day-divider" role="separator">
            <span>{dayLabel}</span>
          </div>
        {/if}
        <MessageBubble {message} />
      {/each}
      {#if awaitingResponse}
        <div class="typing" aria-label={$i18n("messageList.typing.ariaLabel")}>
          <span></span><span></span><span></span>
        </div>
      {/if}
    {/if}
  </div>

  {#if showScrollFab}
    <button
      type="button"
      class="scroll-fab"
      title={scrollFabTitle}
      aria-label={$i18n("messageList.scrollToBottom.ariaLabel")}
      onclick={() => void scrollToBottom()}
      transition:fly={{ y: 8, duration: 180 }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 16 6 10h12l-6 6Z" fill="currentColor" />
      </svg>
      {#if newMessageCount > 0}
        <span class="badge">
          {newMessageCount > 99
            ? $i18n("messageList.scrollBadge.overflow")
            : newMessageCount}
        </span>
      {/if}
    </button>
  {/if}
</div>

<style>
  .message-list-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .message-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
  }

  .empty {
    margin: auto;
    max-width: 28rem;
    text-align: center;
    color: var(--color-muted);
    line-height: 1.6;
    padding: 2rem 0;
  }

  .empty-avatar {
    display: inline-flex;
    margin-bottom: 1rem;
    filter: drop-shadow(0 0 24px color-mix(in srgb, var(--color-accent) 35%, transparent));
  }

  .empty-avatar.pulse {
    animation: glow 2s ease-in-out infinite;
  }

  .empty h2 {
    margin: 0 0 0.5rem;
    color: var(--color-text);
    font-size: 1.25rem;
  }

  .empty p {
    margin: 0 0 1rem;
  }

  .cta {
    margin-bottom: 1rem;
    border: none;
    border-radius: var(--radius-md);
    padding: 0.55rem 1rem;
    background: var(--color-accent);
    color: white;
    cursor: pointer;
  }

  .tips {
    list-style: none;
    padding: 0;
    margin: 0;
    text-align: left;
    font-size: 0.8125rem;
  }

  .tips li {
    margin: 0.35rem 0;
  }

  kbd {
    font-family: inherit;
    font-size: 0.75rem;
    padding: 0.1rem 0.35rem;
    border-radius: 0.25rem;
    border: 1px solid var(--color-border);
    background: var(--color-input-bg);
  }

  .day-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0.5rem 0;
    color: var(--color-muted);
    font-size: 0.75rem;
  }

  .day-divider::before,
  .day-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--color-border-subtle);
  }

  .day-divider span {
    padding: 0 0.25rem;
    white-space: nowrap;
  }

  .typing {
    align-self: flex-start;
    display: inline-flex;
    gap: 0.35rem;
    padding: 0.65rem 0.9rem;
    border-radius: 1rem;
    background: var(--color-assistant-bg);
    border: 1px solid var(--color-assistant-border);
  }

  .typing span {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 999px;
    background: var(--color-muted);
    animation: bounce 1.2s ease-in-out infinite;
  }

  .typing span:nth-child(2) {
    animation-delay: 0.15s;
  }

  .typing span:nth-child(3) {
    animation-delay: 0.3s;
  }

  .scroll-fab {
    position: absolute;
    right: 1.25rem;
    bottom: 1rem;
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-md);
    cursor: pointer;
    z-index: 2;
  }

  .scroll-fab .badge {
    position: absolute;
    top: -0.35rem;
    right: -0.35rem;
    min-width: 1.1rem;
    height: 1.1rem;
    padding: 0 0.25rem;
    border-radius: var(--radius-full);
    background: var(--color-accent);
    color: white;
    font-size: 0.625rem;
    font-weight: 700;
    display: grid;
    place-items: center;
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
      transform: translateY(0);
      opacity: 0.45;
    }
    40% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }

  @keyframes glow {
    0%,
    100% {
      filter: drop-shadow(0 0 12px color-mix(in srgb, var(--color-accent) 25%, transparent));
    }
    50% {
      filter: drop-shadow(0 0 28px color-mix(in srgb, var(--color-accent) 45%, transparent));
    }
  }
</style>
