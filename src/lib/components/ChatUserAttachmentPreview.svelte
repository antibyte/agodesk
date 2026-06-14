<script lang="ts">
  import { get } from "svelte/store";
  import { i18n } from "../i18n";
  import type { ChatAttachmentItem } from "../types/protocol";
  import { inferAttachmentKindFromMime } from "../types/protocol";
  import {
    getLocalAttachmentPreview,
    signedAttachmentPathsVersion,
  } from "../services/chat-attachment-paths";
  import {
    fetchFirstChatMediaItemAssetDataUrl,
    resolveAuraGoChatMediaUrl,
  } from "../services/server-asset-fetch";
  import { isInlineImageSrc, resolveInlineImageFallback } from "../services/chat-media-inline";
  import { chatMessages } from "../stores/chat";

  interface Props {
    attachments: ChatAttachmentItem[];
    serverUrl?: string;
  }

  let { attachments, serverUrl = "" }: Props = $props();

  let previewUrls = $state<Record<string, string>>({});

  function isImageAttachment(item: ChatAttachmentItem): boolean {
    if (item.kind === "image") {
      return true;
    }
    if (item.mime_type?.startsWith("image/")) {
      return true;
    }
    return inferAttachmentKindFromMime(item.mime_type ?? "") === "image";
  }

  $effect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      const next = await buildPreviewMap(attachments, serverUrl);
      if (!cancelled) {
        previewUrls = next;
      }
    };

    void run();
    const unsubscribe = signedAttachmentPathsVersion.subscribe(() => {
      if (!cancelled) {
        void run();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  });

  async function buildPreviewMap(
    items: ChatAttachmentItem[],
    url: string,
  ): Promise<Record<string, string>> {
    const messages = get(chatMessages);
    const next: Record<string, string> = {};
    for (const item of items) {
      if (!isImageAttachment(item)) {
        continue;
      }

      const localPreview = getLocalAttachmentPreview(item.attachment_id);
      if (localPreview && isInlineImageSrc(localPreview)) {
        next[item.attachment_id] = localPreview;
        continue;
      }

      if (!url) {
        continue;
      }

      try {
        const fetched = await fetchFirstChatMediaItemAssetDataUrl(
          url,
          {
            attachment_id: item.attachment_id,
            path: item.path,
            filename: item.filename,
          },
          {
            mediaItem: {
              id: item.attachment_id,
              attachment_id: item.attachment_id,
              filename: item.filename,
              path: item.path,
            },
            messages,
          },
        );
        if (fetched?.dataUrl && isInlineImageSrc(fetched.dataUrl)) {
          next[item.attachment_id] = fetched.dataUrl;
          continue;
        }

        const fallback = resolveInlineImageFallback(url, item.path);
        if (isInlineImageSrc(fallback)) {
          next[item.attachment_id] = fallback;
        }
      } catch {
        // Preview optional for history rehydration.
      }
    }
    return next;
  }
</script>

{#if attachments.length > 0}
  <ul class="attachment-list" aria-label={$i18n("chatAttachments.list.ariaLabel")}>
    {#each attachments as attachment (attachment.attachment_id)}
      {@const previewUrl = previewUrls[attachment.attachment_id]}
      <li class="attachment-chip">
        {#if previewUrl}
          <img src={previewUrl} alt={attachment.filename} class="thumb" loading="lazy" />
        {:else}
          <span class="file-icon" aria-hidden="true">📎</span>
        {/if}
        <span class="meta">
          <span class="name">{attachment.filename}</span>
          {#if attachment.mime_type}
            <span class="mime">{attachment.mime_type}</span>
          {/if}
        </span>
        {#if serverUrl && attachment.path}
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
