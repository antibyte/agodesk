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
  <section class="speech-banner error" role="alert" in:fly={bannerTransition} out:fly={{ ...bannerTransition, y: -4 }}>
    <span class="icon" aria-hidden="true">!</span>
    <span>{errorMessage}</span>
  </section>
{:else if partialTranscript}
  <section class="speech-banner listening" role="status" aria-live="polite" in:fly={bannerTransition} out:fly={{ ...bannerTransition, y: -4 }}>
    <div class="content">
      <span class="pulse-dot" aria-hidden="true"></span>
      <span class="label">{$i18n("speechBanner.recognizing.label")}</span>
      <span class="transcript">{partialTranscript}</span>
      {#if agentMode}
        <span class="mode-chip">{$i18n("speechBanner.mode.agent")}</span>
      {:else if autoSendToAuraGo}
        <span class="mode-chip">{$i18n("speechBanner.mode.autoSend")}</span>
      {/if}
    </div>
  </section>
{:else if speechActive}
  <section class="speech-banner mode" role="status" in:fly={bannerTransition} out:fly={{ ...bannerTransition, y: -4 }}>
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
    margin: 0 var(--space-5) var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    font-size: 0.8125rem;
    line-height: 1.45;
  }

  .content {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
  }

  .speech-banner.listening {
    background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface));
    border: 1px solid color-mix(in srgb, var(--color-danger) 25%, var(--color-border));
    color: var(--color-text);
  }

  .speech-banner.mode {
    background: color-mix(in srgb, var(--color-accent) 8%, var(--color-surface));
    border: 1px solid color-mix(in srgb, var(--color-accent) 25%, var(--color-border));
    color: var(--color-text);
    font-size: 0.75rem;
  }

  .mode-chip {
    margin-left: auto;
    padding: 0.1rem 0.45rem;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--color-accent) 14%, transparent);
    color: var(--color-accent);
    font-size: 0.6875rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .speech-banner.error {
    background: var(--color-danger-soft);
    border: 1px solid color-mix(in srgb, var(--color-danger) 35%, transparent);
    color: var(--color-danger);
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
