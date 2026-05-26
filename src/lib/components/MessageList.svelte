<script lang="ts">
  import { tick } from "svelte";
  import MessageBubble from "./MessageBubble.svelte";
  import { chatMessages } from "../stores/chat";

  let container: HTMLDivElement | undefined = $state();
  let shouldStickToBottom = $state(true);

  function handleScroll(): void {
    if (!container) {
      return;
    }
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottom = distanceFromBottom < 48;
  }

  async function scrollToBottom(): Promise<void> {
    await tick();
    if (container && shouldStickToBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }

  $effect(() => {
    const messages = $chatMessages;
    void messages.length;
    void scrollToBottom();
  });
</script>

<div class="message-list" bind:this={container} onscroll={handleScroll}>
  {#if $chatMessages.length === 0}
    <p class="empty">Noch keine Nachrichten. Verbinde dich mit einem Agent-Backend und starte den Chat.</p>
  {:else}
    {#each $chatMessages as message (message.id)}
      <MessageBubble {message} />
    {/each}
  {/if}
</div>

<style>
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
  }
</style>
