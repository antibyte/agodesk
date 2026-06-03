<script lang="ts">
  import { parseChatContent } from "../services/chat-format";
  import { i18n } from "../i18n";
  import { onDestroy } from "svelte";

  interface Props {
    text: string;
    tone?: "user" | "assistant" | "system";
  }

  let { text, tone = "assistant" }: Props = $props();

  const blocks = $derived(parseChatContent(text));

  let copiedIndex = $state<number | null>(null);
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;

  async function copyCode(value: string, index: number): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      copiedIndex = index;
      if (copyTimeout) {
        clearTimeout(copyTimeout);
      }
      copyTimeout = setTimeout(() => {
        copiedIndex = null;
      }, 2000);
    } catch {
      // Clipboard nicht verfügbar
    }
  }

  onDestroy(() => {
    if (copyTimeout) {
      clearTimeout(copyTimeout);
    }
  });
</script>

<div class="message-body" data-tone={tone}>
  {#each blocks as block, index (index)}
    {#if block.type === "codeblock"}
      <div class="codeblock">
        <div class="codeblock-header">
          <span class="codeblock-lang">{block.language || $i18n("chatMessageBody.codeLanguageFallback")}</span>
          <button
            type="button"
            class="codeblock-copy"
            aria-label={copiedIndex === index ? $i18n("chatMessageBody.copyCode.ariaLabelDone") : $i18n("chatMessageBody.copyCode.ariaLabel")}
            title={copiedIndex === index ? $i18n("chatMessageBody.copyCode.titleDone") : $i18n("chatMessageBody.copyCode.title")}
            onclick={() => void copyCode(block.value, index)}
          >
            {#if copiedIndex === index}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              {$i18n("chatMessageBody.copyCode.buttonDone")}
            {:else}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.75" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.75" />
              </svg>
              {$i18n("chatMessageBody.copyCode.button")}
            {/if}
          </button>
        </div>
        <pre><code>{block.value}</code></pre>
      </div>
    {:else}
      <p>
        {#each block.segments as segment, segmentIndex (segmentIndex)}
          {#if segment.type === "code"}
            <code class="inline-code">{segment.value}</code>
          {:else if segment.type === "bold"}
            <strong>{segment.value}</strong>
          {:else}
            {segment.value}
          {/if}
        {/each}
      </p>
    {/if}
  {/each}
</div>

<style>
  .message-body {
    display: grid;
    gap: 0.55rem;
  }

  .message-body p {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .inline-code {
    font-family: var(--font-mono);
    font-size: 0.84em;
    padding: 0.12rem 0.35rem;
    border-radius: 0.35rem;
    background: color-mix(in srgb, var(--color-text) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-text) 10%, transparent);
  }

  .message-body[data-tone="user"] .inline-code {
    background: color-mix(in srgb, #fff 16%, transparent);
    border-color: color-mix(in srgb, #fff 22%, transparent);
  }

  .codeblock {
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-bg) 65%, var(--color-surface));
    box-shadow: var(--shadow-1);
  }

  .message-body[data-tone="user"] .codeblock {
    border-color: color-mix(in srgb, #fff 18%, transparent);
    background: color-mix(in srgb, #000 18%, transparent);
  }

  .codeblock-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: 0.35rem 0.65rem;
    border-bottom: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-bg) 40%, transparent);
  }

  .codeblock-lang {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-muted);
  }

  .codeblock-copy {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-muted);
    font-size: 0.6875rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      color var(--transition-fast),
      background var(--transition-fast),
      border-color var(--transition-fast);
  }

  .codeblock-copy:hover {
    color: var(--color-accent);
    background: var(--color-accent-soft);
    border-color: color-mix(in srgb, var(--color-accent) 25%, transparent);
  }

  .codeblock pre {
    margin: 0;
    padding: 0.75rem 0.85rem;
    overflow-x: auto;
    background: linear-gradient(
      to right,
      transparent calc(100% - 1.5rem),
      color-mix(in srgb, var(--color-muted) 8%, transparent)
    );
  }

  .codeblock code {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    line-height: 1.55;
    white-space: pre;
  }
</style>
