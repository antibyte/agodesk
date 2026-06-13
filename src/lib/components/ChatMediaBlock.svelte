<script lang="ts">
  import { onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { i18n } from "../i18n";
  import ChatMessageBody from "./ChatMessageBody.svelte";
  import type { ChatMediaItem } from "../types/protocol";
  import { resolvePersonaAssetUrl } from "../types/protocol";
  import { fetchFirstChatMediaItemAssetDataUrl, resolveAuraGoChatMediaUrl } from "../services/server-asset-fetch";
  import { openExternalUrl } from "../services/open-external-url";
  import { formatInvokeError } from "../services/errors";
  import {
    findUserAttachmentsForRequest,
    getLocalAttachmentPreview,
    getLocalAttachmentPreviewForRequest,
    resolveAttachmentIdForMedia,
    signedAttachmentPathsVersion,
  } from "../services/chat-attachment-paths";
  import { chatMessages } from "../stores/chat";
  import {
    enqueueChatMediaAudio,
    registerActiveChatMediaElement,
  } from "../services/chat-media-playback";
  import { isInlineImageSrc, resolveInlineImageFallback } from "../services/chat-media-inline";

  interface Props {
    item: ChatMediaItem;
    serverUrl: string;
    onOpenEmbedded?: (url: string, title?: string) => void;
  }

  let { item, serverUrl, onOpenEmbedded }: Props = $props();

  let assetDataUrl = $state<string | null>(null);
  let previewDataUrl = $state<string | null>(null);
  let loadError = $state(false);
  let openError = $state<string | null>(null);
  let openingExternal = $state(false);
  let youtubeEmbedBlocked = $state(false);
  let unregisterMedia: (() => void) | null = null;

  const displayTitle = $derived(item.title || item.filename || item.kind);
  const resolvedPath = $derived(
    item.path || item.agent_path
      ? resolveAuraGoChatMediaUrl(serverUrl, item.path ?? item.agent_path ?? "")
      : "",
  );
  const resolvedUrl = $derived(
    item.url ? resolvePersonaAssetUrl(serverUrl, item.url) : resolvedPath,
  );
  const embedUrl = $derived.by(() => {
    if (item.embed_url) {
      return resolvePersonaAssetUrl(serverUrl, item.embed_url);
    }
    if (item.kind === "youtube_video" && item.url) {
      return resolvePersonaAssetUrl(serverUrl, item.url);
    }
    return "";
  });

  async function loadInlineAsset(mediaItem: ChatMediaItem): Promise<string | null> {
    const messages = get(chatMessages);
    const userAttachments = findUserAttachmentsForRequest(mediaItem.request_id, messages);
    const localPreview = getLocalAttachmentPreviewForRequest(
      mediaItem.request_id,
      messages,
      mediaItem.filename ?? mediaItem.title,
    );
    if (localPreview) {
      return localPreview;
    }

    const attachmentId = resolveAttachmentIdForMedia(mediaItem, userAttachments, messages);
    if (attachmentId) {
      const cachedLocal = getLocalAttachmentPreview(attachmentId);
      if (cachedLocal) {
        return cachedLocal;
      }
    }

    const fetched = await fetchFirstChatMediaItemAssetDataUrl(
      serverUrl,
      {
        attachment_id: attachmentId,
        path: mediaItem.path,
        agent_path: mediaItem.agent_path,
        preview_url: mediaItem.preview_url,
        url: mediaItem.url,
        filename: mediaItem.filename,
        storage_filename: mediaItem.storage_filename,
      },
      {
        mediaItem,
        messages,
        userAttachments,
      },
    );
    return fetched?.dataUrl ?? null;
  }

  $effect(() => {
    const mediaItem = item;
    let cancelled = false;

    const run = async (): Promise<void> => {
      assetDataUrl = null;
      previewDataUrl = null;
      loadError = false;

      if (
        mediaItem.kind !== "image" &&
        !(mediaItem.kind === "document" && (mediaItem.preview_url || mediaItem.path))
      ) {
        return;
      }

      try {
        if (mediaItem.kind === "image") {
          const loaded = await loadInlineAsset(mediaItem);
          if (cancelled) {
            return;
          }
          if (isInlineImageSrc(loaded)) {
            assetDataUrl = loaded;
            loadError = false;
          } else {
            const fallback = resolveInlineImageFallback(
              serverUrl,
              mediaItem.path,
              mediaItem.agent_path,
            );
            if (isInlineImageSrc(fallback)) {
              assetDataUrl = fallback;
              loadError = false;
            } else {
              assetDataUrl = null;
              loadError = true;
            }
          }
        } else if (mediaItem.kind === "document" && (mediaItem.preview_url || mediaItem.path)) {
          const loaded = await loadInlineAsset({
            ...mediaItem,
            kind: "image",
          });
          if (cancelled) {
            return;
          }
          previewDataUrl = isInlineImageSrc(loaded)
            ? loaded
            : resolveInlineImageFallback(serverUrl, mediaItem.path, mediaItem.agent_path);
        }
      } catch {
        if (!cancelled) {
          loadError = mediaItem.kind === "image";
        }
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

  onDestroy(() => {
    unregisterMedia?.();
  });

  async function handleOpenExternal(): Promise<void> {
    if (openingExternal) {
      return;
    }

    openError = null;
    openingExternal = true;

    try {
      if (resolvedUrl) {
        await openExternalUrl(resolvedUrl);
      }
    } catch (error) {
      openError = formatInvokeError(error, get(i18n)("chatAttachments.openFailed"));
    } finally {
      openingExternal = false;
    }
  }

  function handleOpenEmbedded(): void {
    const target = embedUrl || resolvedUrl;
    if (!target) {
      return;
    }
    if (onOpenEmbedded) {
      onOpenEmbedded(target, displayTitle);
      return;
    }
    void openExternalUrl(target);
  }

  function handlePlayAudio(): void {
    const path = item.path ?? item.url;
    if (!path) {
      return;
    }
    enqueueChatMediaAudio(serverUrl, item.conversation_id, item.request_id, path, item.mime_type);
  }

  function trackMediaElement(element: HTMLMediaElement): { destroy: () => void } {
    unregisterMedia?.();
    unregisterMedia = registerActiveChatMediaElement(element);
    return {
      destroy() {
        unregisterMedia?.();
      },
    };
  }
</script>

<article class="chat-media-block glass-panel-subtle" data-kind={item.kind}>
  {#if displayTitle}
    <h4 class="media-title">{displayTitle}</h4>
  {/if}

  {#if item.caption}
    <div class="media-caption">
      <ChatMessageBody text={item.caption} tone="assistant" />
    </div>
  {/if}

  {#if item.kind === "image"}
    {#if assetDataUrl}
      <img class="media-image" src={assetDataUrl} alt={displayTitle} />
    {:else if loadError}
      <p class="media-fallback">{$i18n("chatMedia.image.unavailable")}</p>
    {:else}
      <p class="media-loading">{$i18n("chatMedia.loading")}</p>
    {/if}
  {:else if item.kind === "audio"}
    <div class="media-audio">
      {#if item.path || item.url}
        <audio controls preload="none" src={resolvedPath || resolvedUrl} use:trackMediaElement
        ></audio>
      {/if}
      <button type="button" class="ui-btn ui-btn-secondary ui-btn-sm" onclick={handlePlayAudio}>
        {$i18n("chatMedia.audio.playQueue")}
      </button>
    </div>
  {:else if item.kind === "document"}
    {#if previewDataUrl && previewDataUrl.startsWith("data:image/")}
      <img class="media-image" src={previewDataUrl} alt={displayTitle} />
    {:else if previewDataUrl}
      <iframe class="media-doc-preview" title={displayTitle} src={previewDataUrl}></iframe>
    {/if}
  {:else if item.kind === "video" || item.kind === "live_stream"}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      class="media-video"
      controls
      preload="metadata"
      src={resolvedPath || resolvedUrl}
      use:trackMediaElement
    ></video>
  {:else if item.kind === "youtube_video"}
    {#if embedUrl && !youtubeEmbedBlocked}
      <iframe
        class="media-youtube"
        title={displayTitle}
        src={embedUrl}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        onerror={() => {
          youtubeEmbedBlocked = true;
        }}
      ></iframe>
    {:else}
      <button type="button" class="ui-btn ui-btn-secondary" onclick={handleOpenExternal}>
        {$i18n("chatMedia.youtube.openExternal")}
      </button>
    {/if}
  {:else if item.kind === "stl"}
    <p class="media-fallback">{$i18n("chatMedia.stl.noViewer")}</p>
  {:else if item.kind === "link"}
    <button type="button" class="ui-btn ui-btn-secondary link-btn" onclick={handleOpenEmbedded}>
      {resolvedUrl || displayTitle}
    </button>
  {/if}

  {#if item.description}
    <div class="media-description">
      <ChatMessageBody text={item.description} tone="assistant" />
    </div>
  {/if}

  {#if resolvedUrl && item.kind !== "link"}
    <div class="media-actions">
      <button
        type="button"
        class="ui-btn ui-btn-secondary ui-btn-sm"
        disabled={openingExternal}
        onclick={() => void handleOpenExternal()}
      >
        {$i18n("chatMedia.openExternal")}
      </button>
      {#if openError}
        <p class="media-open-error" role="alert">{openError}</p>
      {/if}
      {#if onOpenEmbedded && (item.kind === "link" || item.kind === "document")}
        <button
          type="button"
          class="ui-btn ui-btn-secondary ui-btn-sm"
          onclick={handleOpenEmbedded}
        >
          {$i18n("chatMedia.openEmbedded")}
        </button>
      {/if}
    </div>
  {/if}
</article>

<style>
  .chat-media-block {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    margin-top: var(--space-2);
  }

  .media-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .media-image,
  .media-video,
  .media-youtube,
  .media-doc-preview {
    width: 100%;
    max-width: 100%;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--glass-surface) 80%, transparent);
  }

  .media-youtube,
  .media-doc-preview {
    min-height: 12rem;
    aspect-ratio: 16 / 9;
  }

  .media-audio {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .media-audio audio {
    width: min(100%, 20rem);
  }

  .media-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .media-fallback,
  .media-loading,
  .media-open-error {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-muted);
  }

  .media-open-error {
    color: var(--color-danger, #c0392b);
    flex-basis: 100%;
  }

  .link-btn {
    justify-content: flex-start;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
