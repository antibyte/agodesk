<script lang="ts">
  import { i18n } from "../i18n";
  import type { SpeechStatus } from "../types/speech";

  interface Props {
    status?: SpeechStatus;
    disabled?: boolean;
    onToggle?: () => void;
  }

  let { status = "idle", disabled = false, onToggle }: Props = $props();

  const isActive = $derived(
    status === "connecting" || status === "listening" || status === "processing",
  );

  const label = $derived.by(() => {
    switch (status) {
      case "connecting":
        return $i18n("speechControl.connecting");
      case "listening":
        return $i18n("speechControl.listening");
      case "processing":
        return $i18n("speechControl.processing");
      case "error":
        return $i18n("speechControl.error");
      default:
        return $i18n("speechControl.idle");
    }
  });
</script>

<button
  type="button"
  class="speech-toggle ui-btn ui-btn-icon"
  class:active={isActive}
  class:listening={status === "listening"}
  {disabled}
  aria-pressed={isActive}
  aria-label={label}
  title={label}
  onclick={() => onToggle?.()}
>
  {#if status === "connecting" || status === "processing"}
    <span class="spinner" aria-hidden="true"></span>
  {:else}
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {#if isActive}
        <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
      {:else}
        <path
          d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
          fill="currentColor"
        />
      {/if}
    </svg>
  {/if}
</button>

<style>
  .speech-toggle {
    width: 2.625rem;
    height: 2.625rem;
    min-width: 2.625rem;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .speech-toggle.active {
    border-color: color-mix(in srgb, var(--color-danger) 60%, var(--glass-border));
    background: color-mix(in srgb, var(--color-danger) 12%, var(--glass-surface));
    color: var(--color-danger);
  }

  .speech-toggle.listening {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-danger) 20%, transparent);
    animation: pulse 1.6s ease-in-out infinite;
  }

  .speech-toggle:disabled {
    opacity: 0.35;
    animation: none;
    box-shadow: none;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid color-mix(in srgb, currentColor 25%, transparent);
    border-top-color: currentColor;
    border-radius: var(--radius-full);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-danger) 18%, transparent);
    }
    50% {
      box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-danger) 8%, transparent);
    }
  }
</style>
