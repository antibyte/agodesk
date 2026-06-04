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

  async function stickToBottom(): Promise<void> {
    await tick();
    if (container && shouldStickToBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }

  async function scrollToBottom(): Promise<void> {
    shouldStickToBottom = true;
    lastSeenCount = $chatMessages.length;
    await stickToBottom();
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
    if (!shouldStickToBottom) {
      return;
    }
    lastSeenCount = messages.length;
    void stickToBottom();
  });
</script>

<div class="message-list-wrap">
  <div class="message-list" bind:this={container} onscroll={handleScroll}>
    {#if $chatMessages.length === 0}
      <div class="empty">
        <div class="empty-avatar" class:pulse={speechActive}>
          <PersonaAvatar
            imageUrl={$personaState.avatarUrl || $personaState.iconUrl}
            label={$personaState.persona}
            size="lg"
            loading={$personaState.loading}
          />
        </div>
        <h2>{$i18n("messageList.empty.title")}</h2>
        <p>{$i18n("messageList.empty.description")}</p>
        {#if sessionStatus === "awaiting_pairing"}
          <button type="button" class="ui-btn ui-btn-primary cta" onclick={() => onOpenSettings?.()}>
            {$i18n("messageList.empty.pairDevice")}
          </button>
        {:else if connectionStatus !== "connected"}
          <p class="hint">{$i18n("chatView.hint.noConnection")}</p>
        {/if}
        <ul class="tips glass-panel-subtle">
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
        <MessageBubble {message} {index} />
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
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    scroll-behavior: smooth;
  }

  .empty {
    margin: auto;
    max-width: 30rem;
    text-align: center;
    color: var(--color-muted);
    line-height: 1.65;
    padding: var(--space-6) var(--space-4);
  }

  .empty-avatar {
    display: inline-flex;
    margin-bottom: var(--space-4);
    filter: drop-shadow(0 0 32px color-mix(in srgb, var(--color-accent) 40%, transparent));
  }

  .empty-avatar.pulse {
    animation: glow 2s ease-in-out infinite;
  }

  .empty h2 {
    margin: 0 0 var(--space-2);
    color: var(--color-text);
    font-size: 1.375rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }

  .empty p {
    margin: 0 0 var(--space-4);
    font-size: 0.9375rem;
  }

  .cta {
    margin-bottom: var(--space-4);
  }

  .tips {
    list-style: none;
    padding: var(--space-4);
    margin: var(--space-4) 0 0;
    text-align: left;
    font-size: 0.8125rem;
    border-radius: var(--radius-xl);
  }

  .tips li {
    margin: var(--space-2) 0;
  }

  kbd {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    padding: 0.12rem 0.4rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--glass-surface) 80%, transparent);
  }

  .day-divider {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: var(--space-2) 0;
    color: var(--color-muted);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .day-divider::before,
  .day-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--color-border-subtle) 20%,
      var(--color-border-subtle) 80%,
      transparent
    );
  }

  .day-divider span {
    padding: 0.15rem 0.65rem;
    white-space: nowrap;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--glass-surface) 70%, transparent);
    border: 1px solid var(--color-border-subtle);
  }

  .typing {
    align-self: flex-start;
    display: inline-flex;
    gap: 0.35rem;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-xl);
    background: var(--color-assistant-bg);
    border: 1px solid var(--color-assistant-border);
    backdrop-filter: blur(calc(var(--blur) * 0.5));
    -webkit-backdrop-filter: blur(calc(var(--blur) * 0.5));
    box-shadow: var(--shadow-1);
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
    right: var(--space-5);
    bottom: var(--space-4);
    display: grid;
    place-items: center;
    width: 2.625rem;
    height: 2.625rem;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-full);
    background: var(--glass-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-2);
    backdrop-filter: blur(var(--blur));
    -webkit-backdrop-filter: blur(var(--blur));
    cursor: pointer;
    z-index: 2;
    transition:
      transform var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .scroll-fab:hover {
    transform: translateY(-2px);
    box-shadow: var(--accent-glow);
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
