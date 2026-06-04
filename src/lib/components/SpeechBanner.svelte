<script lang="ts">
  import { fly } from "svelte/transition";
  import { i18n } from "../i18n";

  interface Props {
    partialTranscript?: string;
    errorMessage?: string;
    autoSendToAuraGo?: boolean;
    agentMode?: boolean;
    speechActive?: boolean;
  }

  let {
    partialTranscript = "",
    errorMessage = "",
    autoSendToAuraGo = false,
    agentMode = false,
    speechActive = false,
  }: Props = $props();

  const bannerTransition = { y: 8, duration: 220 };
</script>

{#if errorMessage}
  <section
    class="speech-banner banner-glass"
    data-tone="danger"
    role="alert"
    in:fly={bannerTransition}
    out:fly={{ ...bannerTransition, y: -4 }}
  >
    <span class="icon" aria-hidden="true">!</span>
    <span>{errorMessage}</span>
  </section>
{:else if partialTranscript}
  <section
    class="speech-banner banner-glass listening"
    data-tone="accent"
    role="status"
    aria-live="polite"
    in:fly={bannerTransition}
    out:fly={{ ...bannerTransition, y: -4 }}
  >
    <div class="content">
      <span class="pulse-dot" aria-hidden="true"></span>
      <span class="label">{$i18n("speechBanner.recognizing.label")}</span>
      <span class="transcript">{partialTranscript}</span>
      {#if agentMode}
        <span class="mode-chip ui-chip" data-tone="connected">{$i18n("speechBanner.mode.agent")}</span>
      {:else if autoSendToAuraGo}
        <span class="mode-chip ui-chip" data-tone="connected">{$i18n("speechBanner.mode.autoSend")}</span>
      {/if}
    </div>
  </section>
{:else if speechActive}
  <section
    class="speech-banner banner-glass mode"
    data-tone="accent"
    role="status"
    in:fly={bannerTransition}
    out:fly={{ ...bannerTransition, y: -4 }}
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
    font-size: 0.75rem;
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

  .icon {
    display: grid;
    place-items: center;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--color-danger) 20%, transparent);
    font-weight: 800;
    font-size: 0.7rem;
    flex-shrink: 0;
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
</style>
