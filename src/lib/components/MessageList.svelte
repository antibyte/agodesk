<script lang="ts">
  import { tick } from "svelte";
  import { fade } from "svelte/transition";
  import { i18n } from "../i18n";
  import MessageBubble from "./MessageBubble.svelte";
  import ChatMediaBlock from "./ChatMediaBlock.svelte";
  import CompanionPresenceCard from "./CompanionPresenceCard.svelte";
  import { chatMessages } from "../stores/chat";
  import { personaState } from "../stores/persona";
  import { resolvePersonaWelcomeImage } from "../services/persona-display";
  import { deriveCompanionPresence } from "../services/companion-presence";
  import { formatDayLabel } from "../services/chat-format";
  import type { ChatMediaItem, ConnectionStatus, SessionStatus } from "../types/protocol";

  interface Props {
    awaitingResponse?: boolean;
    sessionStatus?: SessionStatus;
    connectionStatus?: ConnectionStatus;
    speechActive?: boolean;
    speechErrorMessage?: string;
    mediaItems?: ChatMediaItem[];
    mediaEnabled?: boolean;
    serverUrl?: string;
    onOpenEmbedded?: (url: string, title?: string) => void;
    onPairDevice?: () => void;
  }

  let {
    awaitingResponse = false,
    sessionStatus = "idle",
    connectionStatus = "disconnected",
    speechActive = false,
    speechErrorMessage = "",
    mediaItems = [],
    mediaEnabled = false,
    serverUrl = "",
    onOpenEmbedded,
    onPairDevice,
  }: Props = $props();

  let container: HTMLDivElement | undefined = $state();
  let shouldStickToBottom = $state(true);
  let lastSeenCount = $state(0);

  const newMessageCount = $derived(Math.max(0, $chatMessages.length - lastSeenCount));

  const showScrollFab = $derived(!shouldStickToBottom && $chatMessages.length > 0);

  const welcomePersonaImage = $derived(resolvePersonaWelcomeImage($personaState));

  const emptyPresence = $derived(
    deriveCompanionPresence({
      connectionStatus,
      sessionStatus,
      requestInFlight: awaitingResponse,
      speechActive,
      speechErrorMessage,
    }),
  );

  const showPairAction = $derived(
    sessionStatus === "awaiting_pairing" || sessionStatus === "error",
  );

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
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scrollFabTransition = reducedMotion ? { duration: 0 } : { duration: 220 };
</script>

<div class="message-list-wrap">
  <div class="message-list" bind:this={container} onscroll={handleScroll}>
    {#if $chatMessages.length === 0}
      <div class="empty">
        <CompanionPresenceCard
          state={emptyPresence}
          imageUrl={welcomePersonaImage.imageUrl}
          fallbackImageUrl={welcomePersonaImage.fallbackImageUrl}
          label={$personaState.persona}
          loading={$personaState.loading}
          primaryActionLabel={showPairAction ? $i18n("messageList.empty.pairDevice") : undefined}
          onPrimaryAction={showPairAction ? () => onPairDevice?.() : undefined}
          facts={[
            {
              label: $i18n("messageList.empty.title"),
              value: $i18n("messageList.empty.description"),
            },
          ]}
        />
      </div>
    {:else}
      {#each $chatMessages as message, index (message.id)}
        {@const dayLabel = dayLabelFor(message.timestamp, index)}
        {#if dayLabel}
          <div class="day-divider" role="separator">
            <span>{dayLabel}</span>
          </div>
        {/if}
        <MessageBubble {message} {index} {serverUrl} />
      {/each}
      {#if mediaEnabled && mediaItems.length > 0}
        <div class="media-strip">
          {#each mediaItems as item (item.id)}
            <ChatMediaBlock {item} {serverUrl} {onOpenEmbedded} />
          {/each}
        </div>
      {/if}
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
      transition:fade={scrollFabTransition}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 16 6 10h12l-6 6Z" fill="currentColor" />
      </svg>
      {#if newMessageCount > 0}
        <span class="badge">
          {newMessageCount > 99 ? $i18n("messageList.scrollBadge.overflow") : newMessageCount}
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
    font-variant-numeric: tabular-nums;
  }

  @media (min-width: 1024px) {
    .message-list {
      align-items: center;
    }

    .message-list :global(.message-row) {
      width: 100%;
      max-width: 720px;
    }
  }

  .empty {
    margin: auto;
    width: 100%;
    max-width: 32rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6) var(--space-4);
  }

  .day-divider {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: var(--space-2) 0;
    color: var(--color-footnote);
    font-size: var(--font-size-xs);
    font-weight: 500;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .day-divider::before,
  .day-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--color-border-subtle);
  }

  .media-strip {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
  }

  .typing {
    display: flex;
    gap: 0.35rem;
    padding: var(--space-2) var(--space-4);
    align-self: flex-start;
    margin-left: var(--space-2);
  }

  .typing span {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: var(--radius-full);
    background: var(--color-accent);
    opacity: 0.45;
    animation: typing-bounce 1.2s ease-in-out infinite;
  }

  .typing span:nth-child(2) {
    animation-delay: 0.15s;
  }

  .typing span:nth-child(3) {
    animation-delay: 0.3s;
  }

  @keyframes typing-bounce {
    0%,
    80%,
    100% {
      transform: translateY(0);
      opacity: 0.35;
    }

    40% {
      transform: translateY(-4px);
      opacity: 0.9;
    }
  }

  .scroll-fab {
    position: absolute;
    right: var(--space-5);
    bottom: var(--space-4);
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-full);
    background: var(--glass-surface);
    color: var(--color-text);
    cursor: pointer;
    box-shadow: var(--shadow-2);
    backdrop-filter: blur(var(--blur));
    -webkit-backdrop-filter: blur(var(--blur));
    z-index: 2;
  }

  .scroll-fab:hover {
    border-color: color-mix(in srgb, var(--color-accent) 35%, var(--color-border));
    color: var(--color-accent);
  }

  .scroll-fab:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .badge {
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

  @media (prefers-reduced-motion: reduce) {
    .typing span {
      animation: none;
      opacity: 0.6;
    }
  }
</style>
