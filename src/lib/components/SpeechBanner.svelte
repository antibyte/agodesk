<script lang="ts">
  import { fade } from "svelte/transition";
  import { i18n } from "../i18n";
  import type { SpeechProvider } from "../types/protocol";
  import Icon from "./Icon.svelte";

  interface Props {
    partialTranscript?: string;
    errorMessage?: string;
    autoSendToAuraGo?: boolean;
    agentMode?: boolean;
    speechActive?: boolean;
    vadLoading?: boolean;
    vadError?: string;
    speechProvider?: SpeechProvider;
    compact?: boolean;
  }

  let {
    partialTranscript = "",
    errorMessage = "",
    autoSendToAuraGo = false,
    agentMode = false,
    speechActive = false,
    vadLoading = false,
    vadError = "",
    speechProvider = "gemini_live",
    compact = false,
  }: Props = $props();

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const bannerTransition = reducedMotion ? { duration: 180 } : { y: 8, duration: 220 };
  const bannerOutTransition = reducedMotion ? { duration: 140 } : { y: -4, duration: 220 };
</script>

{#if vadLoading}
  <section
    class="speech-banner banner-glass"
    class:compact
    data-tone="info"
    role="status"
    in:fade={bannerTransition}
    out:fade={bannerOutTransition}
  >
    <span class="pulse-dot" aria-hidden="true"></span>
    <span>{$i18n("speechBanner.vad.loading")}</span>
  </section>
{:else if vadError}
  <section
    class="speech-banner banner-glass"
    class:compact
    data-tone="warning"
    role="alert"
    in:fade={bannerTransition}
    out:fade={bannerOutTransition}
  >
    <Icon name="warning" size={16} class="banner-icon" />
    <span>{vadError}</span>
  </section>
{:else if errorMessage}
  <section
    class="speech-banner banner-glass"
    class:compact
    data-tone="danger"
    role="alert"
    in:fade={bannerTransition}
    out:fade={bannerOutTransition}
  >
    <Icon name="error" size={16} class="banner-icon" />
    <span>{errorMessage}</span>
  </section>
{:else if partialTranscript}
  <section
    class="speech-banner banner-glass listening"
    class:compact
    data-tone="accent"
    role="status"
    aria-live="polite"
    in:fade={bannerTransition}
    out:fade={bannerOutTransition}
  >
    <div class="content">
      <span class="pulse-dot" aria-hidden="true"></span>
      <span class="label">{$i18n("speechBanner.recognizing.label")}</span>
      <span class="transcript">{partialTranscript}</span>
      {#if !compact}
        {#if agentMode}
          <span class="mode-chip ui-chip" data-tone="connected"
            >{$i18n("speechBanner.mode.agent")}</span
          >
        {:else if autoSendToAuraGo}
          <span class="mode-chip ui-chip" data-tone="connected"
            >{$i18n("speechBanner.mode.autoSend")}</span
          >
        {/if}
        <span class="mode-chip ui-chip provider-chip" data-tone="info">
          {$i18n(`speechBanner.provider.${speechProvider}`)}
        </span>
      {/if}
    </div>
  </section>
{:else if speechActive}
  <section
    class="speech-banner banner-glass mode"
    class:compact
    data-tone="accent"
    role="status"
    in:fade={bannerTransition}
    out:fade={bannerOutTransition}
  >
    <div class="content">
      <span class="pulse-dot" aria-hidden="true"></span>
      {#if agentMode}
        <span>{$i18n("speechBanner.active.agent")}</span>
      {:else if autoSendToAuraGo}
        <span>{$i18n("speechBanner.active.autoSend")}</span>
      {:else}
        <span>{$i18n("speechBanner.active.default")}</span>
      {/if}
      {#if !compact}
        <span class="mode-chip ui-chip provider-chip" data-tone="info">
          {$i18n(`speechBanner.provider.${speechProvider}`)}
        </span>
      {/if}
    </div>
  </section>
{/if}

<style>
  .speech-banner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .content {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
  }

  .speech-banner.mode {
    font-size: var(--font-size-xs);
  }

  .mode-chip {
    margin-left: auto;
    flex-shrink: 0;
  }

  .pulse-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: var(--radius-full);
    background: var(--color-danger);
    flex-shrink: 0;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .label {
    color: var(--color-muted);
    flex-shrink: 0;
  }

  .transcript {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.banner-icon) {
    flex-shrink: 0;
    color: currentColor;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.55;
      transform: scale(0.85);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse-dot {
      animation: none;
    }
  }
</style>
