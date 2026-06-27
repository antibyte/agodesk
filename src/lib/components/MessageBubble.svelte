<script lang="ts">
  import type { ChatMessage } from "../types/protocol";
  import ChatMessageBody from "./ChatMessageBody.svelte";
  import ChatUserAttachmentPreview from "./ChatUserAttachmentPreview.svelte";
  import PersonaAvatar from "./PersonaAvatar.svelte";
  import { formatMessageTime, messageGroupMeta } from "../services/chat-format";
  import { chatMessages } from "../stores/chat";
  import { personaState } from "../stores/persona";
  import { resolvePersonaChatImage } from "../services/persona-display";

  interface Props {
    message: ChatMessage;
    index: number;
    serverUrl?: string;
  }

  let { message, index, serverUrl = "" }: Props = $props();

  const group = $derived(messageGroupMeta($chatMessages, index));
  const showAssistantAvatar = $derived(message.role === "assistant" && !group.groupWithPrevious);
  const showUserAvatar = $derived(message.role === "user" && !group.groupWithPrevious);
  const showTime = $derived(!group.groupWithNext);
  const chatPersonaImage = $derived(resolvePersonaChatImage($personaState));
</script>

<div
  class="message-row"
  class:user={message.role === "user"}
  class:assistant={message.role === "assistant"}
  class:system={message.role === "system"}
  class:grouped={group.groupWithPrevious}
>
  {#if message.role === "user"}
    <article
      class="bubble"
      class:tail-user={!group.groupWithNext}
      class:grouped={group.groupWithPrevious}
    >
      {#if message.attachments?.length}
        <ChatUserAttachmentPreview attachments={message.attachments} {serverUrl} />
      {/if}
      {#if message.text.trim()}
        <ChatMessageBody text={message.text} tone={message.role} />
      {/if}
      {#if showTime}
        <time datetime={message.timestamp}>{formatMessageTime(message.timestamp)}</time>
      {/if}
    </article>
    {#if showUserAvatar}
      <PersonaAvatar tone="user" size="sm" />
    {:else}
      <span class="avatar-spacer" aria-hidden="true"></span>
    {/if}
  {:else}
    {#if showAssistantAvatar}
      <PersonaAvatar
        imageUrl={chatPersonaImage.imageUrl}
        fallbackImageUrl={chatPersonaImage.fallbackImageUrl}
        label={$personaState.persona}
        size="sm"
        imageFit="contain"
        loading={$personaState.loading}
      />
    {:else if message.role === "assistant"}
      <span class="avatar-spacer" aria-hidden="true"></span>
    {/if}

    <article
      class="bubble"
      class:tail-assistant={message.role === "assistant" && !group.groupWithNext}
      class:grouped={group.groupWithPrevious}
      class:streaming={message.streaming === true}
    >
      {#if message.role === "system"}
        <p>{message.text}</p>
      {:else}
        <ChatMessageBody text={message.text} tone={message.role} />
      {/if}
      {#if showTime && !message.streaming}
        <time datetime={message.timestamp}>{formatMessageTime(message.timestamp)}</time>
      {/if}
    </article>
  {/if}
</div>

<style>
  .message-row {
    display: flex;
    gap: var(--space-2);
    align-items: flex-end;
    max-width: min(88%, 780px);
  }

  @media (min-width: 1024px) {
    .message-row {
      max-width: min(88%, 820px);
    }
  }

  .message-row.user {
    align-self: flex-end;
  }

  .message-row.assistant {
    align-self: flex-start;
  }

  .message-row.system {
    align-self: center;
    max-width: 100%;
    justify-content: center;
  }

  .message-row.grouped {
    margin-top: -0.35rem;
  }

  .avatar-spacer {
    width: 2.125rem;
    flex-shrink: 0;
  }

  .bubble {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-xl);
    line-height: var(--line-height-normal);
    word-break: break-word;
    min-width: 0;
    flex: 1;
    font-variant-numeric: tabular-nums;
  }

  .bubble :global(.message-body p) {
    margin: 0;
  }

  .bubble :global(.message-body p + p) {
    margin-top: 0.45rem;
  }

  .bubble :global(.message-body .md-heading + p),
  .bubble :global(.message-body .md-heading + .md-list),
  .bubble :global(.message-body p + .md-heading),
  .bubble :global(.message-body .md-list + p) {
    margin-top: 0.45rem;
  }

  .bubble time {
    display: block;
    margin-top: var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--color-footnote);
    font-variant-numeric: tabular-nums;
  }

  .user .bubble time {
    color: color-mix(in srgb, var(--color-user-text) 78%, transparent);
  }

  .user .bubble {
    background: var(--color-user-bg);
    color: var(--color-user-text);
    box-shadow:
      0 2px 8px color-mix(in srgb, var(--color-accent) 18%, transparent),
      0 10px 28px color-mix(in srgb, var(--color-accent) 10%, transparent);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .user .bubble.tail-user {
    border-bottom-right-radius: var(--radius-sm);
  }

  .user .bubble.grouped {
    border-top-right-radius: var(--radius-sm);
  }

  .assistant .bubble {
    background: var(--color-assistant-bg);
    color: var(--color-assistant-text);
    border: 1px solid var(--color-assistant-border);
    box-shadow: var(--color-bubble-shadow);
  }

  .assistant .bubble.tail-assistant {
    border-bottom-left-radius: var(--radius-sm);
  }

  .assistant .bubble.grouped {
    border-top-left-radius: var(--radius-sm);
  }

  .assistant .bubble.streaming {
    box-shadow:
      var(--color-bubble-shadow),
      0 0 0 1px color-mix(in srgb, var(--color-accent) 18%, transparent);
  }

  .system .bubble {
    background: var(--color-system-bg);
    color: var(--color-system-text);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    text-align: center;
    font-size: 0.8125rem;
    box-shadow: var(--shadow-1);
  }

  .system .bubble p {
    margin: 0;
  }
</style>
