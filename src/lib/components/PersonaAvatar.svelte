<script lang="ts">
  import { i18n } from "../i18n";

  interface Props {
    imageUrl?: string;
    fallbackImageUrl?: string;
    label?: string;
    size?: "sm" | "md" | "lg";
    imageFit?: "cover" | "contain";
    tone?: "assistant" | "system" | "user";
    loading?: boolean;
  }

  let {
    imageUrl = "",
    fallbackImageUrl = "",
    label,
    size = "sm",
    imageFit = "cover",
    tone = "assistant",
    loading = false,
  }: Props = $props();

  let imageFailed = $state(false);
  let useFallback = $state(false);
  let imageLoaded = $state(false);

  const displayLabel = $derived(label ?? $i18n("personaAvatar.defaultLabel"));
  const activeImageUrl = $derived(
    useFallback && fallbackImageUrl.trim()
      ? fallbackImageUrl
      : imageUrl.trim() || fallbackImageUrl.trim(),
  );
  const showImage = $derived(Boolean(activeImageUrl) && !imageFailed);
  const imageKey = $derived(activeImageUrl);

  $effect(() => {
    void imageUrl;
    void fallbackImageUrl;
    imageFailed = false;
    useFallback = false;
    imageLoaded = false;
  });

  function handleImageError(): void {
    const primary = imageUrl.trim();
    const fallback = fallbackImageUrl.trim();
    if (!useFallback && primary && fallback && fallback !== primary) {
      useFallback = true;
      imageLoaded = false;
      return;
    }
    imageFailed = true;
  }

  function handleImageLoad(): void {
    imageLoaded = true;
  }
</script>

<span class="persona-avatar" class:loading data-size={size} data-tone={tone} aria-hidden="true">
  {#if loading}
    <span class="skeleton-fill ui-skeleton"></span>
  {:else if tone === "user"}
    <svg class="user-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" fill="currentColor" stroke="none" />
      <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" fill="currentColor" stroke="none" />
    </svg>
  {:else if showImage}
    {#key imageKey}
      <img
        src={activeImageUrl}
        alt=""
        loading="eager"
        decoding="async"
        class:loaded={imageLoaded}
        style:object-fit={imageFit}
        onload={handleImageLoad}
        onerror={handleImageError}
      />
    {/key}
  {:else}
    {displayLabel}
  {/if}
</span>

<style>
  .persona-avatar {
    --avatar-size-sm: 2.125rem;
    --avatar-size-md: 3rem;
    --avatar-size-lg: 5rem;

    border-radius: var(--radius-full);
    display: grid;
    place-items: center;
    overflow: hidden;
    flex-shrink: 0;
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  .persona-avatar[data-size="sm"] {
    width: var(--avatar-size-sm);
    height: var(--avatar-size-sm);
    font-size: var(--font-size-xs);
  }

  .persona-avatar[data-size="md"] {
    width: var(--avatar-size-md);
    height: var(--avatar-size-md);
    font-size: var(--font-size-sm);
  }

  .persona-avatar[data-size="lg"] {
    width: var(--avatar-size-lg);
    height: var(--avatar-size-lg);
    font-size: var(--font-size-xl);
  }

  .persona-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    opacity: 0;
    transition: opacity 200ms ease;
  }

  .persona-avatar img.loaded {
    opacity: 1;
  }

  .persona-avatar[data-tone="assistant"] {
    background: var(--color-accent-soft);
    color: var(--color-accent);
    border: 1px solid color-mix(in srgb, var(--color-accent) 22%, transparent);
  }

  .persona-avatar[data-size="lg"][data-tone="assistant"],
  .persona-avatar[data-size="md"][data-tone="assistant"] {
    box-shadow:
      0 0 0 2px var(--color-companion-ring),
      0 8px 24px color-mix(in srgb, var(--color-accent) 22%, transparent);
  }

  .persona-avatar[data-size="lg"][data-tone="assistant"] {
    border-width: 3px;
  }

  .persona-avatar[data-tone="system"] {
    background: var(--color-warning-soft);
    color: var(--color-warning);
  }

  .persona-avatar[data-tone="user"] {
    background: color-mix(in srgb, var(--color-accent) 14%, var(--glass-surface));
    color: var(--color-accent);
    border: 1px solid color-mix(in srgb, var(--color-accent) 22%, var(--glass-border));
    box-shadow: var(--shadow-1);
  }

  .user-icon {
    position: relative;
    z-index: 1;
    width: 58%;
    height: 58%;
    display: block;
  }

  .persona-avatar.loading {
    background: var(--color-input-bg);
    border: 1px solid var(--color-border-subtle);
    overflow: hidden;
  }

  .skeleton-fill {
    width: 100%;
    height: 100%;
    border-radius: inherit;
  }

  @media (prefers-reduced-motion: reduce) {
    .persona-avatar img {
      transition: none;
      opacity: 1;
    }
  }
</style>
