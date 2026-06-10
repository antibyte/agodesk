<script lang="ts">
  import { i18n } from "../i18n";
  import {
    DEFAULT_SHOW_WINDOW_HOTKEY,
    analyzeShowWindowHotkey,
    formatHotkeyLabel,
    keyboardEventToHotkey,
  } from "../services/show-window-hotkey";

  interface Props {
    value: string;
    disabled?: boolean;
    onchange?: (value: string) => void;
  }

  let { value = "", disabled = false, onchange }: Props = $props();

  let recording = $state(false);
  let captureError = $state<string | null>(null);

  const analysis = $derived(analyzeShowWindowHotkey(value));
  const displayLabel = $derived(
    value.trim() ? formatHotkeyLabel(analysis.normalized || value) : "",
  );

  function emit(next: string): void {
    onchange?.(next);
  }

  function startRecording(): void {
    if (disabled) {
      return;
    }
    captureError = null;
    recording = true;
  }

  function stopRecording(): void {
    recording = false;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!recording) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      stopRecording();
      return;
    }

    const hotkey = keyboardEventToHotkey(event);
    if (!hotkey) {
      captureError = $i18n("settings.appearance.showWindowHotkey.captureInvalid");
      return;
    }

    const nextAnalysis = analyzeShowWindowHotkey(hotkey);
    if (!nextAnalysis.valid) {
      captureError = $i18n("settings.appearance.showWindowHotkey.captureInvalid");
      return;
    }

    captureError = null;
    emit(nextAnalysis.normalized);
    stopRecording();
  }

  function handleDisable(): void {
    captureError = null;
    emit("");
  }

  function handleResetDefault(): void {
    captureError = null;
    emit(DEFAULT_SHOW_WINDOW_HOTKEY);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="hotkey-field" class:recording class:disabled>
  <div class="hotkey-display" aria-live="polite">
    {#if displayLabel}
      {displayLabel}
    {:else}
      {$i18n("settings.appearance.showWindowHotkey.disabled")}
    {/if}
  </div>

  <div class="hotkey-actions">
    <button
      type="button"
      class="ui-btn ui-btn-secondary"
      disabled={disabled}
      onclick={recording ? stopRecording : startRecording}
    >
      {recording
        ? $i18n("settings.appearance.showWindowHotkey.recording")
        : $i18n("settings.appearance.showWindowHotkey.record")}
    </button>
    <button
      type="button"
      class="ui-btn ui-btn-secondary"
      disabled={disabled || !value.trim()}
      onclick={handleDisable}
    >
      {$i18n("settings.appearance.showWindowHotkey.disable")}
    </button>
    <button
      type="button"
      class="ui-btn ui-btn-secondary"
      disabled={disabled}
      onclick={handleResetDefault}
    >
      {$i18n("settings.appearance.showWindowHotkey.reset")}
    </button>
  </div>

  {#if recording}
    <p class="help recording-hint">{$i18n("settings.appearance.showWindowHotkey.recordingHelp")}</p>
  {/if}

  {#if captureError}
    <p class="help warning">{captureError}</p>
  {:else if analysis.warning === "reserved"}
    <p class="help warning">{$i18n("settings.appearance.showWindowHotkey.reservedWarning")}</p>
  {:else if !analysis.valid && value.trim()}
    <p class="help warning">{$i18n("settings.appearance.showWindowHotkey.invalidWarning")}</p>
  {/if}
</div>

<style>
  .hotkey-field {
    display: grid;
    gap: 0.65rem;
  }

  .hotkey-field.recording .hotkey-display {
    outline: 2px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
    outline-offset: 2px;
  }

  .hotkey-display {
    font-family: var(--font-mono);
    font-size: 0.9375rem;
    padding: 0.55rem 0.75rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-bg) 70%, var(--color-surface));
    min-height: 2.5rem;
    display: flex;
    align-items: center;
  }

  .hotkey-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .recording-hint {
    color: var(--color-accent);
  }

  .warning {
    color: color-mix(in srgb, var(--color-danger, #c0392b) 88%, var(--color-text));
  }

  .disabled {
    opacity: 0.65;
  }
</style>
