<script lang="ts">
  import { i18n } from "../i18n";
  import type { MessageKey } from "../i18n/types";
  import {
    DEFAULT_SHOW_WINDOW_HOTKEY,
    analyzeShowWindowHotkey,
    formatHotkeyLabel,
    keyboardEventToHotkey,
  } from "../services/show-window-hotkey";

  type HotkeyAnalysis = ReturnType<typeof analyzeShowWindowHotkey>;

  interface Props {
    value: string;
    disabled?: boolean;
    defaultHotkey?: string;
    analyze?: (hotkey: string) => HotkeyAnalysis;
    i18nPrefix?: string;
    onchange?: (value: string) => void;
  }

  let {
    value = "",
    disabled = false,
    defaultHotkey = DEFAULT_SHOW_WINDOW_HOTKEY,
    analyze = analyzeShowWindowHotkey,
    i18nPrefix = "settings.appearance.showWindowHotkey",
    onchange,
  }: Props = $props();

  let recording = $state(false);
  let captureError = $state<string | null>(null);
  /** Combo built on keydown; committed on the matching non-modifier keyup. */
  let pendingHotkey = $state<string | null>(null);

  const analysis = $derived(analyze(value));
  const displayLabel = $derived(
    value.trim() ? formatHotkeyLabel(analysis.normalized || value) : "",
  );

  function t(key: string): string {
    return $i18n(`${i18nPrefix}.${key}` as MessageKey);
  }

  function emit(next: string): void {
    onchange?.(next);
  }

  function startRecording(): void {
    if (disabled) {
      return;
    }
    captureError = null;
    pendingHotkey = null;
    recording = true;
  }

  function stopRecording(): void {
    recording = false;
    pendingHotkey = null;
  }

  function acceptHotkey(raw: string): void {
    const nextAnalysis = analyze(raw);
    if (!nextAnalysis.valid || !nextAnalysis.normalized) {
      captureError =
        nextAnalysis.warning === "reserved" ? t("reservedWarning") : t("captureInvalid");
      return;
    }

    captureError = null;
    emit(nextAnalysis.normalized);
    stopRecording();
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
      return;
    }

    pendingHotkey = hotkey;
    captureError = null;
  }

  function handleKeyup(event: KeyboardEvent): void {
    if (!recording || !pendingHotkey) {
      return;
    }

    if (
      event.key === "Alt" ||
      event.key === "Control" ||
      event.key === "Shift" ||
      event.key === "Meta" ||
      event.key === "OS"
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const hotkey = pendingHotkey;
    pendingHotkey = null;
    acceptHotkey(hotkey);
  }

  function handleDisable(): void {
    captureError = null;
    pendingHotkey = null;
    emit("");
  }

  function handleResetDefault(): void {
    if (disabled) {
      return;
    }
    acceptHotkey(defaultHotkey);
  }
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} />

<div class="hotkey-field" class:recording class:disabled>
  <div class="hotkey-display" aria-live={recording ? "assertive" : "polite"}>
    {#if pendingHotkey}
      {formatHotkeyLabel(pendingHotkey)}
    {:else if displayLabel}
      {displayLabel}
    {:else}
      {t("disabled")}
    {/if}
  </div>

  <div class="hotkey-actions">
    <button
      type="button"
      class="ui-btn ui-btn-secondary"
      disabled={disabled}
      onclick={recording ? stopRecording : startRecording}
    >
      {recording ? t("recording") : t("record")}
    </button>
    <button
      type="button"
      class="ui-btn ui-btn-secondary"
      disabled={disabled || !value.trim()}
      onclick={handleDisable}
    >
      {t("disable")}
    </button>
    <button type="button" class="ui-btn ui-btn-secondary" disabled={disabled} onclick={handleResetDefault}>
      {t("reset")}
    </button>
  </div>

  {#if recording}
    <p class="help recording-hint">{t("recordingHelp")}</p>
  {/if}

  {#if captureError}
    <p class="help warning">{captureError}</p>
  {:else if analysis.warning === "reserved"}
    <p class="help warning">{t("reservedWarning")}</p>
  {:else if !analysis.valid && value.trim()}
    <p class="help warning">{t("invalidWarning")}</p>
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
