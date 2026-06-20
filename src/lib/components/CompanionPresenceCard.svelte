<script lang="ts">
  import { i18n } from "../i18n";
  import PersonaAvatar from "./PersonaAvatar.svelte";
  import type { CompanionPresenceState } from "../services/companion-presence";

  interface CompanionFact {
    label: string;
    value: string;
    tone?: "ready" | "listening" | "thinking" | "blocked" | "error" | "neutral";
  }

  interface Props {
    state: CompanionPresenceState;
    imageUrl?: string;
    fallbackImageUrl?: string;
    label?: string;
    loading?: boolean;
    compact?: boolean;
    primaryActionLabel?: string;
    onPrimaryAction?: () => void;
    facts?: CompanionFact[];
  }

  let {
    state,
    imageUrl = "",
    fallbackImageUrl = "",
    label,
    loading = false,
    compact = false,
    primaryActionLabel,
    onPrimaryAction,
    facts = [],
  }: Props = $props();
</script>

<section class="companion-card" data-tone={state.tone} class:compact>
  <div class="companion-visual">
    <div class="avatar-wrap">
      <PersonaAvatar {imageUrl} {fallbackImageUrl} {label} size={compact ? "md" : "lg"} {loading} />
      <span class="ui-status-orb companion-orb" data-tone={state.tone} aria-hidden="true"></span>
    </div>
  </div>

  <div class="companion-copy">
    <p class="companion-label">{$i18n(state.labelKey)}</p>
    <p class="companion-description">{$i18n(state.descriptionKey)}</p>

    {#if primaryActionLabel && onPrimaryAction}
      <button
        type="button"
        class="ui-btn ui-btn-primary companion-action"
        onclick={() => onPrimaryAction()}
      >
        {primaryActionLabel}
      </button>
    {/if}

    {#if facts.length > 0}
      <dl class="companion-facts">
        {#each facts as fact (fact.label + fact.value)}
          <div class="companion-fact" data-tone={fact.tone ?? "neutral"}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        {/each}
      </dl>
    {/if}
  </div>
</section>

<style>
  .companion-card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-5);
    width: 100%;
    max-width: 28rem;
    margin: 0 auto;
    padding: var(--space-6);
    border-radius: var(--radius-2xl);
    background: var(--color-companion-surface);
    box-shadow: var(--shadow-companion);
    border: 1px solid var(--color-border-subtle);
    transition:
      box-shadow var(--motion-companion),
      transform var(--motion-companion);
  }

  .companion-card.compact {
    padding: var(--space-4);
    gap: var(--space-4);
  }

  .companion-visual {
    display: flex;
    justify-content: center;
  }

  .avatar-wrap {
    position: relative;
    display: inline-flex;
  }

  .companion-orb {
    position: absolute;
    right: 0.15rem;
    bottom: 0.15rem;
  }

  .companion-copy {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    text-align: center;
  }

  .companion-label {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 650;
    color: var(--color-text-strong);
    letter-spacing: -0.02em;
  }

  .companion-description {
    margin: 0;
    font-size: var(--font-size-md);
    line-height: var(--line-height-normal);
    color: var(--color-muted);
  }

  .companion-action {
    align-self: center;
    margin-top: var(--space-1);
  }

  .companion-facts {
    margin: var(--space-2) 0 0;
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--glass-surface) 70%, transparent);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    text-align: left;
  }

  .companion-fact {
    display: grid;
    gap: 0.15rem;
  }

  .companion-fact dt {
    margin: 0;
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }

  .companion-fact dd {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text);
  }

  @media (prefers-reduced-motion: no-preference) {
    .companion-card[data-tone="listening"]::before,
    .companion-card[data-tone="thinking"]::before {
      content: "";
      position: absolute;
      inset: -2px;
      border-radius: inherit;
      pointer-events: none;
      z-index: -1;
      opacity: 0.55;
      background: radial-gradient(
        ellipse 80% 60% at 50% 0%,
        color-mix(in srgb, var(--color-accent) 22%, transparent),
        transparent 70%
      );
      animation: companion-aura 2.8s ease-in-out infinite;
    }

    .companion-card {
      position: relative;
    }
  }

  @keyframes companion-aura {
    0%,
    100% {
      opacity: 0.35;
      transform: scale(1);
    }

    50% {
      opacity: 0.7;
      transform: scale(1.02);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .companion-card[data-tone="listening"]::before,
    .companion-card[data-tone="thinking"]::before {
      animation: none;
    }
  }
</style>
