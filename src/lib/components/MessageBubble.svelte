<script lang="ts">
  import type { ChatMessage } from "../types/protocol";

  interface Props {
    message: ChatMessage;
  }

  let { message }: Props = $props();

  function formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
</script>

<article class="bubble" class:user={message.role === "user"} class:assistant={message.role === "assistant"} class:system={message.role === "system"}>
  <p>{message.text}</p>
  <time datetime={message.timestamp}>{formatTime(message.timestamp)}</time>
</article>

<style>
  .bubble {
    max-width: min(80%, 640px);
    padding: 0.75rem 1rem;
    border-radius: 1rem;
    line-height: 1.5;
    word-break: break-word;
  }

  .bubble p {
    margin: 0;
    white-space: pre-wrap;
  }

  .bubble time {
    display: block;
    margin-top: 0.35rem;
    font-size: 0.75rem;
    opacity: 0.65;
  }

  .user {
    align-self: flex-end;
    background: var(--color-user-bg);
    color: var(--color-user-text);
    border-bottom-right-radius: 0.25rem;
    box-shadow: var(--color-bubble-shadow);
  }

  .assistant {
    align-self: flex-start;
    background: var(--color-assistant-bg);
    color: var(--color-assistant-text);
    border: 1px solid var(--color-assistant-border);
    border-bottom-left-radius: 0.25rem;
    box-shadow: var(--color-bubble-shadow);
  }

  .system {
    align-self: center;
    background: var(--color-system-bg);
    color: var(--color-system-text);
    border-radius: 0.5rem;
    max-width: 100%;
    text-align: center;
  }
</style>
