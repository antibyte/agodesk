<script lang="ts">
  import { i18n } from "../i18n";
  import { APP_LOCALES, LOCALE_LABELS, type UiLocaleSetting } from "../i18n/locales";
  import { focusTrap } from "../actions/focusTrap";
  import { dialogModal } from "../actions/dialogModal";
  import type { MessageKey } from "../i18n/types";

  interface Props {
    open?: boolean;
    locale?: UiLocaleSetting;
    serverUrl?: string;
    speechEnabled?: boolean;
    pairingToken?: string;
    busy?: boolean;
    onLocaleChange?: (locale: UiLocaleSetting) => void;
    onServerUrlChange?: (url: string) => void;
    onSpeechEnabledChange?: (enabled: boolean) => void;
    onPairingTokenChange?: (token: string) => void;
    onConnect?: () => void;
    onPair?: () => void;
    onComplete?: () => void;
    onSkip?: () => void;
  }

  let {
    open = false,
    locale = "system",
    serverUrl = "",
    speechEnabled = false,
    pairingToken = "",
    busy = false,
    onLocaleChange,
    onServerUrlChange,
    onSpeechEnabledChange,
    onPairingTokenChange,
    onConnect,
    onPair,
    onComplete,
    onSkip,
  }: Props = $props();

  let step = $state(0);

  $effect(() => {
    if (open) {
      step = 0;
    }
  });

  function nextStep(): void {
    if (step < 2) {
      step += 1;
      return;
    }
    onComplete?.();
  }
</script>

{#if open}
  <dialog
    class="onboarding-dialog aurora-edge"
    use:dialogModal={{ open: true }}
    use:focusTrap
    aria-modal="true"
    aria-labelledby="onboarding-title"
  >
    <header class="onboarding-header">
      <p class="onboarding-kicker font-display">agodesk</p>
      <h1 id="onboarding-title" class="font-display">
        {$i18n(`onboarding.step${step + 1}.title` as MessageKey)}
      </h1>
      <p class="onboarding-lead">{$i18n(`onboarding.step${step + 1}.description` as MessageKey)}</p>
    </header>

    {#if step === 0}
      <div class="locale-grid">
        <label class="locale-card" class:selected={locale === "system"}>
          <input
            type="radio"
            checked={locale === "system"}
            onchange={() => onLocaleChange?.("system")}
          />
          <strong>{$i18n("locale.setting.system")}</strong>
        </label>
        {#each APP_LOCALES as appLocale (appLocale)}
          <label class="locale-card" class:selected={locale === appLocale}>
            <input
              type="radio"
              checked={locale === appLocale}
              onchange={() => onLocaleChange?.(appLocale)}
            />
            <strong>{LOCALE_LABELS[appLocale]}</strong>
          </label>
        {/each}
      </div>
    {:else if step === 1}
      <label class="field">
        <span>{$i18n("settings.connection.serverUrl.label")}</span>
        <input
          class="ui-input"
          type="url"
          value={serverUrl}
          placeholder={$i18n("settings.connection.serverUrl.placeholder")}
          oninput={(event) => onServerUrlChange?.((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="field">
        <span>{$i18n("pairing.step2")}</span>
        <input
          class="ui-input"
          type="password"
          value={pairingToken}
          autocomplete="off"
          placeholder={$i18n("pairing.token.placeholder")}
          oninput={(event) =>
            onPairingTokenChange?.((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <div class="action-row">
        <button
          type="button"
          class="ui-btn ui-btn-secondary"
          disabled={busy}
          onclick={() => onConnect?.()}
        >
          {$i18n("onboarding.connect")}
        </button>
        <button
          type="button"
          class="ui-btn ui-btn-primary"
          disabled={busy || !pairingToken.trim()}
          onclick={() => onPair?.()}
        >
          {$i18n("onboarding.pair")}
        </button>
      </div>
    {:else}
      <label class="field checkbox-field">
        <input
          type="checkbox"
          checked={speechEnabled}
          onchange={(event) =>
            onSpeechEnabledChange?.((event.currentTarget as HTMLInputElement).checked)}
        />
        <span>{$i18n("onboarding.speechEnable")}</span>
      </label>
      <p class="help">{$i18n("onboarding.speechHelp")}</p>
    {/if}

    <footer class="onboarding-footer">
      <div class="step-dots" aria-hidden="true">
        {#each [0, 1, 2] as dot (dot)}
          <span class="dot" class:active={dot === step}></span>
        {/each}
      </div>
      <div class="footer-actions">
        <button type="button" class="ui-btn ui-btn-link" onclick={() => onSkip?.()}>
          {$i18n("onboarding.skip")}
        </button>
        <button type="button" class="ui-btn ui-btn-primary" onclick={nextStep}>
          {step === 2 ? $i18n("onboarding.finish") : $i18n("onboarding.next")}
        </button>
      </div>
    </footer>
  </dialog>
{/if}

<style>
  .onboarding-dialog {
    animation: overlay-fade-in 480ms var(--ease-spring) both;
  }

  @keyframes overlay-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .onboarding-header {
    display: grid;
    gap: var(--space-2);
    text-align: center;
  }

  .onboarding-kicker {
    margin: 0;
    font-size: var(--font-size-sm);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-companion);
  }

  .onboarding-header h1 {
    margin: 0;
    font-size: var(--font-size-3xl);
    line-height: var(--line-height-tight);
    color: var(--color-text-strong);
  }

  .onboarding-lead {
    margin: 0;
    color: var(--color-muted);
    line-height: var(--line-height-normal);
  }

  .locale-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
    gap: var(--space-2);
  }

  .locale-card {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--glass-surface) 70%, transparent);
    cursor: pointer;
  }

  .locale-card.selected {
    border-color: color-mix(in srgb, var(--color-companion) 45%, var(--color-border));
    box-shadow: var(--accent-glow);
  }

  .locale-card input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .field {
    display: grid;
    gap: var(--space-2);
  }

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .help {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--font-size-sm);
  }

  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .onboarding-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .step-dots {
    display: inline-flex;
    gap: var(--space-2);
  }

  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: var(--radius-full);
    background: var(--color-border);
  }

  .dot.active {
    background: var(--color-companion);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-companion) 18%, transparent);
  }

  .footer-actions {
    display: inline-flex;
    gap: var(--space-2);
    margin-left: auto;
  }
</style>
