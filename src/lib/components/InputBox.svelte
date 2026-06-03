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
    onSubmit?: (text: string) => void;
    onSpeechToggle?: () => void;
  }

  let {
    disabled = false,
    hint = "",
    draft = $bindable(""),
    speechStatus = "idle",
    speechEnabled = false,
    onSubmit,
    onSpeechToggle,
  }: Props = $props();

  function submit(): void {
    const trimmed = draft.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSubmit?.(trimmed);
    draft = "";
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }
</script>

<form class="input-box" onsubmit={(event) => { event.preventDefault(); submit(); }}>
  {#if hint}
    <p class="hint">{hint}</p>
  {/if}
  <div class="row">
    {#if speechEnabled}
      <SpeechControl
        status={speechStatus}
        disabled={disabled}
        onToggle={() => onSpeechToggle?.()}
      />
    {/if}
    <textarea
      bind:value={draft}
      placeholder={disabled
        ? $i18n("inputBox.placeholder.disabled")
        : $i18n("inputBox.placeholder.default")}
      rows="3"
      {disabled}
      aria-label={$i18n("inputBox.message.ariaLabel")}
      onkeydown={handleKeydown}
    ></textarea>
    <button
      type="submit"
      disabled={disabled || !draft.trim()}
      aria-label={disabled
        ? $i18n("inputBox.send.disabled.ariaLabel")
        : $i18n("inputBox.send.ariaLabel")}
      title={$i18n("inputBox.send.title")}
    >
      ↑
    </button>
  </div>
  <p class="footnote">{$i18n("inputBox.footnote")}</p>
</form>

<style>
  .input-box {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 1.25rem;
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
    box-shadow: var(--color-panel-shadow);
  }

  .hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-muted);
  }

  .row {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
  }

  textarea {
    flex: 1;
    resize: none;
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    font: inherit;
    background: var(--color-input-bg);
    color: var(--color-text);
    min-height: 4.5rem;
  }

  textarea:focus {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  button[type="submit"] {
    align-self: flex-end;
    width: 2.5rem;
    height: 2.5rem;
    border: none;
    border-radius: var(--radius-full);
    font: inherit;
    font-weight: 700;
    background: var(--color-accent);
    color: white;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .footnote {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-muted);
  }
</style>
