<script lang="ts">
  import { i18n } from "../i18n";

  interface Props {
    imageUrl?: string;
    label?: string;
    size?: "sm" | "md" | "lg";
    tone?: "assistant" | "system" | "user";
    loading?: boolean;
  }

  let { imageUrl = "", label, size = "sm", tone = "assistant", loading = false }: Props = $props();

  let imageFailed = $state(false);

  const displayLabel = $derived(label ?? $i18n("personaAvatar.defaultLabel"));
  const showImage = $derived(Boolean(imageUrl) && !imageFailed);

  $effect(() => {
    void imageUrl;
    imageFailed = false;
  });
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
    <img
      src={imageUrl}
      alt=""
      loading="eager"
      decoding="async"
      onerror={() => (imageFailed = true)}
    />
  {:else}
    {displayLabel}
  {/if}
</span>

<style>
  .persona-avatar {
    border-radius: var(--radius-full);
    display: grid;
    place-items: center;
    overflow: hidden;
    flex-shrink: 0;
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  .persona-avatar[data-size="sm"] {
    width: 2.125rem;
    height: 2.125rem;
    font-size: 0.625rem;
  }

  .persona-avatar[data-size="md"] {
    width: 3rem;
    height: 3rem;
    font-size: 0.75rem;
  }

  .persona-avatar[data-size="lg"] {
    width: 5rem;
    height: 5rem;
    font-size: 1.125rem;
  }

  .persona-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .persona-avatar[data-tone="assistant"] {
    background: var(--color-accent-soft);
    color: var(--color-accent);
    border: 1px solid color-mix(in srgb, var(--color-accent) 22%, transparent);
  }

  .persona-avatar[data-size="lg"][data-tone="assistant"] {
    border-width: 3px;
    box-shadow: 0 8px 24px color-mix(in srgb, var(--color-accent) 25%, transparent);
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
</style>
