<script lang="ts">
  import { i18n } from "../i18n";
  import SpeechControl from "./SpeechControl.svelte";
  import type { SpeechStatus } from "../types/speech";

  interface Props {
    disabled?: boolean;
    hint?: string;
    draft?: string;
    speechStatus?: SpeechStatus;
    speechEnabled?: boolean;
    stopVisible?: boolean;
    onSubmit?: (text: string) => void;
    onSpeechToggle?: () => void;
    onStop?: () => void;
  }

  let {
    disabled = false,
    hint = "",
    draft = $bindable(""),
    speechStatus = "idle",
    speechEnabled = false,
    stopVisible = false,
    onSubmit,
    onSpeechToggle,
    onStop,
  }: Props = $props();

  let textareaEl = $state<HTMLTextAreaElement>();

  function resizeTextarea(): void {
    if (!textareaEl) {
      return;
    }
    textareaEl.style.height = "auto";
    const maxHeight = 160;
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, maxHeight)}px`;
  }

  $effect(() => {
    void draft;
    resizeTextarea();
  });

  function submit(): void {
    const trimmed = draft.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSubmit?.(trimmed);
    draft = "";
    resizeTextarea();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }
</script>

<form class="input-box glass-panel" onsubmit={(event) => { event.preventDefault(); submit(); }}>
  {#if hint}
    <p class="hint">{hint}</p>
  {/if}
  <div class="composer glass-panel-subtle">
    <div class="row">
      {#if speechEnabled}
        <SpeechControl
          status={speechStatus}
          disabled={disabled}
          onToggle={() => onSpeechToggle?.()}
        />
      {/if}
      <textarea
        bind:this={textareaEl}
        bind:value={draft}
        placeholder={disabled
          ? $i18n("inputBox.placeholder.disabled")
          : $i18n("inputBox.placeholder.default")}
        rows="1"
        {disabled}
        aria-label={$i18n("inputBox.message.ariaLabel")}
        onkeydown={handleKeydown}
        oninput={resizeTextarea}
      ></textarea>
      {#if stopVisible}
        <button
          type="button"
          class="stop-btn ui-btn ui-btn-icon"
          aria-label={$i18n("chatView.stop.ariaLabel")}
          title={$i18n("chatView.stop.title")}
          onclick={() => onStop?.()}
        >
          <span class="stop-icon" aria-hidden="true"></span>
        </button>
      {/if}
      <button
        type="submit"
        class="ui-btn ui-btn-primary send-btn"
        disabled={disabled || !draft.trim()}
        aria-label={disabled
          ? $i18n("inputBox.send.disabled.ariaLabel")
          : $i18n("inputBox.send.ariaLabel")}
        title={$i18n("inputBox.send.title")}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="12" y1="19" x2="12" y2="5"></line>
          <polyline points="5 12 12 5 19 12"></polyline>
        </svg>
      </button>
    </div>
  </div>
  <p class="footnote">{$i18n("inputBox.footnote")}</p>
</form>

<style>
  .input-box {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-5);
    border-top: 1px solid var(--color-border-subtle);
    border-radius: 0 0 var(--radius-window) var(--radius-window);
    flex-shrink: 0;
    z-index: 2;
    overflow: hidden;
  }

  .hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-muted);
    padding-left: var(--space-1);
  }

  .composer {
    border-radius: var(--radius-xl);
    padding: 0.35rem;
    border: 1px solid var(--color-border);
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  textarea {
    flex: 1;
    resize: none;
    border: none;
    border-radius: var(--radius-lg);
    padding: var(--space-3) var(--space-4);
    font: inherit;
    line-height: 1.5;
    background: transparent;
    color: var(--color-text);
    min-height: 2.75rem;
    max-height: 10rem;
    overflow-y: auto;
  }

  textarea:focus {
    outline: none;
  }

  textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .composer:focus-within {
    border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-border));
    box-shadow: var(--focus-ring);
  }

  .stop-btn {
    width: 2.625rem;
    height: 2.625rem;
    min-width: 2.625rem;
    padding: 0;
    border-radius: var(--radius-sm);
    border-color: color-mix(in srgb, var(--color-danger) 45%, var(--color-border));
    background: color-mix(in srgb, var(--color-danger) 12%, transparent);
    flex-shrink: 0;
  }

  .stop-btn:not(:disabled):hover {
    background: color-mix(in srgb, var(--color-danger) 22%, transparent);
    border-color: var(--color-danger);
  }

  .stop-icon {
    display: block;
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 2px;
    background: var(--color-danger);
  }

  .send-btn {
    width: 2.625rem;
    height: 2.625rem;
    min-width: 2.625rem;
    padding: 0;
    border-radius: var(--radius-full);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition:
      transform var(--transition-fast),
      background var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .send-btn:not(:disabled):hover {
    transform: scale(1.06) translateY(-1px);
  }

  .send-btn:not(:disabled):active {
    transform: scale(0.96) translateY(0);
  }

  .footnote {
    margin: 0;
    font-size: 0.6875rem;
    color: var(--color-muted);
    padding-left: var(--space-1);
    opacity: 0.75;
  }
</style>
