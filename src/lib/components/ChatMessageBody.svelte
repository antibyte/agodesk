<script lang="ts">
  import {
    parseChatContent,
    type ChatContentBlock,
    type ChatTextSegment,
  } from "../services/chat-format";
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

{#snippet inlineSegments(segments: ChatTextSegment[])}
  {#each segments as segment, segmentIndex (segmentIndex)}
    {#if segment.type === "code"}
      <code class="inline-code">{segment.value}</code>
    {:else if segment.type === "bold"}
      <strong>{segment.value}</strong>
    {:else if segment.type === "italic"}
      <em>{segment.value}</em>
    {:else if segment.type === "strike"}
      <del>{segment.value}</del>
    {:else if segment.type === "link"}
      <a href={segment.href} target="_blank" rel="noopener noreferrer">{segment.label}</a>
    {:else}
      {segment.value}
    {/if}
  {/each}
{/snippet}

{#snippet renderBlocks(contentBlocks: ChatContentBlock[], codeIndexOffset = 0)}
  {#each contentBlocks as block, index (index)}
    {@const codeIndex = codeIndexOffset + index}
    {#if block.type === "codeblock"}
      <div class="codeblock">
        <div class="codeblock-header">
          <span class="codeblock-lang">{block.language || $i18n("chatMessageBody.codeLanguageFallback")}</span>
          <button
            type="button"
            class="codeblock-copy"
            aria-label={copiedIndex === codeIndex ? $i18n("chatMessageBody.copyCode.ariaLabelDone") : $i18n("chatMessageBody.copyCode.ariaLabel")}
            title={copiedIndex === codeIndex ? $i18n("chatMessageBody.copyCode.titleDone") : $i18n("chatMessageBody.copyCode.title")}
            onclick={() => void copyCode(block.value, codeIndex)}
          >
            {#if copiedIndex === codeIndex}
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
    {:else if block.type === "heading"}
      {#if block.level === 1}
        <h1 class="md-heading" data-level="1">{@render inlineSegments(block.segments)}</h1>
      {:else if block.level === 2}
        <h2 class="md-heading" data-level="2">{@render inlineSegments(block.segments)}</h2>
      {:else if block.level === 3}
        <h3 class="md-heading" data-level="3">{@render inlineSegments(block.segments)}</h3>
      {:else if block.level === 4}
        <h4 class="md-heading" data-level="4">{@render inlineSegments(block.segments)}</h4>
      {:else if block.level === 5}
        <h5 class="md-heading" data-level="5">{@render inlineSegments(block.segments)}</h5>
      {:else}
        <h6 class="md-heading" data-level="6">{@render inlineSegments(block.segments)}</h6>
      {/if}
    {:else if block.type === "list"}
      {#if block.ordered}
        <ol class="md-list">
          {#each block.items as item, itemIndex (itemIndex)}
            <li class:task-item={typeof item.checked === "boolean"}>
              {#if typeof item.checked === "boolean"}
                <input type="checkbox" checked={item.checked} disabled aria-hidden="true" />
              {/if}
              {@render inlineSegments(item.segments)}
              {#if item.nested?.length}
                <div class="md-nested">{@render renderBlocks(item.nested, codeIndexOffset + 1000)}</div>
              {/if}
            </li>
          {/each}
        </ol>
      {:else}
        <ul class="md-list">
          {#each block.items as item, itemIndex (itemIndex)}
            <li class:task-item={typeof item.checked === "boolean"}>
              {#if typeof item.checked === "boolean"}
                <input type="checkbox" checked={item.checked} disabled aria-hidden="true" />
              {/if}
              {@render inlineSegments(item.segments)}
              {#if item.nested?.length}
                <div class="md-nested">{@render renderBlocks(item.nested, codeIndexOffset + 1000)}</div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    {:else if block.type === "table"}
      <div class="md-table-wrap">
        <table class="md-table">
          <thead>
            <tr>
              {#each block.headerRow as header, headerIndex (headerIndex)}
                <th>{@render inlineSegments(header)}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each block.rows as row, rowIndex (rowIndex)}
              <tr>
                {#each row as cell, cellIndex (cellIndex)}
                  <td>{@render inlineSegments(cell)}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if block.type === "blockquote"}
      <blockquote class="md-quote">{@render inlineSegments(block.segments)}</blockquote>
    {:else if block.type === "hr"}
      <hr class="md-hr" />
    {:else}
      <p>{@render inlineSegments(block.segments)}</p>
    {/if}
  {/each}
{/snippet}

<div class="message-body" data-tone={tone}>
  {@render renderBlocks(blocks)}
</div>

<style>
  .message-body {
    display: grid;
    gap: 0.55rem;
  }

  .message-body :global(p) {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .md-heading {
    margin: 0;
    line-height: 1.3;
    font-weight: 700;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .md-heading[data-level="1"] {
    font-size: 1.25rem;
  }

  .md-heading[data-level="2"] {
    font-size: 1.125rem;
  }

  .md-heading[data-level="3"] {
    font-size: 1rem;
  }

  .md-heading[data-level="4"],
  .md-heading[data-level="5"],
  .md-heading[data-level="6"] {
    font-size: 0.9375rem;
  }

  .md-list {
    margin: 0;
    padding-left: 1.25rem;
    display: grid;
    gap: 0.25rem;
  }

  .md-list li {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .md-list li.task-item {
    list-style: none;
    margin-left: -1.25rem;
    display: flex;
    gap: 0.45rem;
    align-items: flex-start;
  }

  .md-list li.task-item input {
    margin-top: 0.2rem;
    flex-shrink: 0;
  }

  .md-nested {
    margin-top: 0.35rem;
  }

  .md-table-wrap {
    overflow-x: auto;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
  }

  .md-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .md-table th,
  .md-table td {
    padding: 0.45rem 0.65rem;
    border-bottom: 1px solid var(--color-border-subtle);
    text-align: left;
    vertical-align: top;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .md-table th {
    font-weight: 700;
    background: color-mix(in srgb, var(--color-bg) 55%, transparent);
  }

  .md-table tr:last-child td {
    border-bottom: none;
  }

  .md-quote {
    margin: 0;
    padding-left: 0.85rem;
    border-left: 3px solid color-mix(in srgb, var(--color-accent) 45%, var(--color-border));
    color: color-mix(in srgb, var(--color-text) 88%, var(--color-muted));
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .md-hr {
    border: none;
    border-top: 1px solid var(--color-border-subtle);
    margin: 0.15rem 0;
  }

  .message-body :global(a) {
    color: var(--color-accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .message-body[data-tone="user"] :global(a) {
    color: color-mix(in srgb, #fff 92%, var(--color-accent));
  }

  .message-body :global(em) {
    font-style: italic;
  }

  .message-body :global(del) {
    opacity: 0.75;
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
