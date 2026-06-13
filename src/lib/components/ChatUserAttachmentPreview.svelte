<script lang="ts">
  import { onDestroy } from "svelte";
  import { i18n } from "../i18n";
  import type { ChatAttachmentItem } from "../types/protocol";
  import { resolveAuraGoChatMediaUrl } from "../services/server-asset-fetch";
  import { fetchFirstChatMediaItemAssetDataUrl } from "../services/server-asset-fetch";

  interface Props {
    attachments: ChatAttachmentItem[];
    serverUrl?: string;
  }

  let { attachments, serverUrl = "" }: Props = $props();

  let previewUrls = $state<Record<string, string>>({});

  $effect(() => {
    void loadPreviews(attachments, serverUrl);
  });

  async function loadPreviews(items: ChatAttachmentItem[], url: string): Promise<void> {
    const next: Record<string, string> = {};
    for (const item of items) {
      if (item.kind !== "image" || !item.path || !url) {
        continue;
      }
      try {
        const fetched = await fetchFirstChatMediaItemAssetDataUrl(url, {
          path: item.path,
          filename: item.filename,
        });
        if (fetched?.dataUrl) {
          next[item.attachment_id] = fetched.dataUrl;
        }
      } catch {
        // Preview optional for history rehydration.
      }
    }
    previewUrls = next;
  }

  onDestroy(() => {
    previewUrls = {};
  });
</script>

{#if attachments.length > 0}
  <ul class="attachment-list" aria-label={$i18n("chatAttachments.list.ariaLabel")}>
    {#each attachments as attachment (attachment.attachment_id)}
      <li class="attachment-chip">
        {#if previewUrls[attachment.attachment_id]}
          <img
            src={previewUrls[attachment.attachment_id]}
            alt={attachment.filename}
            class="thumb"
            loading="lazy"
          />
        {:else}
          <span class="file-icon" aria-hidden="true">📎</span>
        {/if}
        <span class="meta">
          <span class="name">{attachment.filename}</span>
          {#if attachment.mime_type}
            <span class="mime">{attachment.mime_type}</span>
          {/if}
        </span>
        {#if attachment.path && serverUrl}
          <a
            class="open-link"
            href={resolveAuraGoChatMediaUrl(serverUrl, attachment.path)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {$i18n("chatAttachments.open")}
          </a>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .attachment-list {
    list-style: none;
    margin: 0 0 var(--space-2);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .attachment-chip {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-user-text) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-user-text) 12%, transparent);
  }

  .thumb {
    width: 3rem;
    height: 3rem;
    object-fit: cover;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .file-icon {
    width: 3rem;
    text-align: center;
    flex-shrink: 0;
    font-size: 1.25rem;
  }

  .meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .name {
    font-size: 0.8125rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mime {
    font-size: 0.6875rem;
    opacity: 0.7;
  }

  .open-link {
    font-size: 0.6875rem;
    color: inherit;
    opacity: 0.85;
    flex-shrink: 0;
  }
</style>
