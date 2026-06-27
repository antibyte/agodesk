<script lang="ts">
  import { i18n } from "../i18n";

  import SpeechControl from "./SpeechControl.svelte";
  import Icon from "./Icon.svelte";

  import type { SpeechStatus } from "../types/speech";

  import type { ChatAttachmentLimits } from "../types/protocol";

  import { DEFAULT_CHAT_ATTACHMENT_LIMITS } from "../types/protocol";

  interface Props {
    disabled?: boolean;

    hint?: string;

    draft?: string;

    speechStatus?: SpeechStatus;

    speechEnabled?: boolean;

    stopVisible?: boolean;

    showFootnote?: boolean;

    attachmentsEnabled?: boolean;

    attachmentLimits?: ChatAttachmentLimits;

    onSubmit?: (text: string, files?: File[]) => void;

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

    showFootnote = true,

    attachmentsEnabled = false,

    attachmentLimits = DEFAULT_CHAT_ATTACHMENT_LIMITS,

    onSubmit,

    onSpeechToggle,

    onStop,
  }: Props = $props();

  let textareaEl = $state<HTMLTextAreaElement>();

  let fileInputEl = $state<HTMLInputElement>();

  let pendingFiles = $state<File[]>([]);

  let attachmentError = $state("");

  let dragActive = $state(false);

  let dragDepth = $state(0);

  let focusedPillIndex = $state<number | null>(null);

  const canSend = $derived(!disabled && (draft.trim().length > 0 || pendingFiles.length > 0));

  const attachmentHint = $derived.by(() => {
    if (!attachmentsEnabled || pendingFiles.length === 0) {
      return "";
    }
    return $i18n("inputBox.attachments.countHint", {
      count: String(pendingFiles.length),
      max: String(attachmentLimits.max_files_per_message),
    });
  });

  const composerHint = $derived(hint || attachmentHint);

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

  function isMimeAllowed(mimeType: string): boolean {
    const mime = mimeType.trim().toLowerCase();
    if (!mime || mime === "application/octet-stream") {
      return true;
    }
    return attachmentLimits.allowed_mime_prefixes.some((prefix) => mime.startsWith(prefix));
  }

  function validateFiles(files: File[]): string | null {
    if (files.length > attachmentLimits.max_files_per_message) {
      return $i18n("inputBox.attachments.error.tooMany", {
        count: String(attachmentLimits.max_files_per_message),
      });
    }

    let totalBytes = 0;

    for (const file of files) {
      if (file.size > attachmentLimits.max_file_bytes) {
        return $i18n("inputBox.attachments.error.fileTooLarge");
      }

      totalBytes += file.size;

      const mime = file.type || "application/octet-stream";

      if (!isMimeAllowed(mime)) {
        return $i18n("inputBox.attachments.error.mimeNotAllowed", { mime });
      }
    }

    if (totalBytes > attachmentLimits.max_total_bytes_per_message) {
      return $i18n("inputBox.attachments.error.totalTooLarge");
    }

    return null;
  }

  function addFiles(fileList: FileList | File[] | null | undefined): void {
    if (!attachmentsEnabled || disabled || !fileList) {
      return;
    }

    const incoming = [...fileList];

    if (incoming.length === 0) {
      return;
    }

    const merged = [...pendingFiles];

    for (const file of incoming) {
      if (!merged.some((existing) => existing.name === file.name && existing.size === file.size)) {
        merged.push(file);
      }
    }

    const error = validateFiles(merged);

    if (error) {
      attachmentError = error;

      return;
    }

    attachmentError = "";

    pendingFiles = merged;
  }

  function removePendingFile(index: number): void {
    pendingFiles = pendingFiles.filter((_, fileIndex) => fileIndex !== index);

    attachmentError = "";
  }

  function submit(): void {
    if (!canSend) {
      return;
    }

    onSubmit?.(draft.trim(), pendingFiles.length > 0 ? [...pendingFiles] : undefined);

    draft = "";

    pendingFiles = [];

    attachmentError = "";

    resizeTextarea();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      submit();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      submit();
      return;
    }

    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      pendingFiles.length > 0 &&
      draft.trim().length === 0
    ) {
      const index = focusedPillIndex ?? (event.key === "Backspace" ? pendingFiles.length - 1 : 0);
      if (index >= 0 && index < pendingFiles.length) {
        event.preventDefault();
        removePendingFile(index);
        focusedPillIndex =
          pendingFiles.length > 0 ? Math.min(index, pendingFiles.length - 1) : null;
      }
    }
  }

  function handlePillKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      removePendingFile(index);
      return;
    }
    focusedPillIndex = index;
  }

  function openFilePicker(): void {
    fileInputEl?.click();
  }

  function handleDragOver(event: DragEvent): void {
    if (!attachmentsEnabled || disabled) {
      return;
    }

    event.preventDefault();
  }

  function handleDragEnter(event: DragEvent): void {
    if (!attachmentsEnabled || disabled) {
      return;
    }

    event.preventDefault();
    dragDepth += 1;
    dragActive = dragDepth > 0;
  }

  function handleDragLeave(event: DragEvent): void {
    if (!attachmentsEnabled || disabled) {
      return;
    }

    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    dragActive = dragDepth > 0;
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();

    dragDepth = 0;
    dragActive = false;

    addFiles(event.dataTransfer?.files);
  }
</script>

<form
  class="input-box glass-panel"
  class:drag-active={dragActive}
  onsubmit={(event) => {
    event.preventDefault();
    submit();
  }}
  ondragover={handleDragOver}
  ondragenter={handleDragEnter}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  {#if dragActive}
    <div class="drop-overlay" role="status" aria-live="polite">
      <strong>{$i18n("inputBox.attachments.dropHere.title")}</strong>
      <span>{$i18n("inputBox.attachments.dropHere.description")}</span>
    </div>
  {/if}

  {#if composerHint}
    <p class="hint">{composerHint}</p>
  {/if}

  {#if pendingFiles.length > 0}
    <ul class="pending-list" aria-label={$i18n("inputBox.attachments.pending.ariaLabel")}>
      {#each pendingFiles as file, index (file.name + file.size)}
        <li class="pending-chip" class:focused={focusedPillIndex === index}>
          <span class="pending-name">{file.name}</span>

          <button
            type="button"
            class="remove-btn ui-btn ui-btn-icon"
            aria-label={$i18n("inputBox.attachments.remove.ariaLabel", { name: file.name })}
            onfocus={() => (focusedPillIndex = index)}
            onkeydown={(event) => handlePillKeydown(event, index)}
            onclick={() => removePendingFile(index)}
          >
            <Icon name="close" size={12} />
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if attachmentError}
    <p class="attachment-error" role="alert">{attachmentError}</p>
  {/if}

  <div class="composer">
    <div class="row">
      {#if attachmentsEnabled}
        <input
          bind:this={fileInputEl}
          type="file"
          multiple
          hidden
          aria-hidden="true"
          tabindex="-1"
          onchange={(event) => {
            const target = event.currentTarget as HTMLInputElement;

            addFiles(target.files);

            target.value = "";
          }}
        />

        <button
          type="button"
          class="attach-btn ui-btn ui-btn-icon"
          {disabled}
          aria-label={$i18n("inputBox.attachments.add.ariaLabel")}
          title={$i18n("inputBox.attachments.add.title")}
          onclick={openFilePicker}
        >
          <Icon name="attach" size={16} />
        </button>
      {/if}

      {#if speechEnabled}
        <SpeechControl status={speechStatus} {disabled} onToggle={() => onSpeechToggle?.()} />
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
          <Icon name="stop" size={14} />
        </button>
      {/if}

      <button
        type="submit"
        class="ui-btn ui-btn-primary send-btn"
        disabled={!canSend}
        aria-label={disabled
          ? $i18n("inputBox.send.disabled.ariaLabel")
          : $i18n("inputBox.send.ariaLabel")}
        title={$i18n("inputBox.send.title")}
      >
        <Icon name="send" size={14} />
      </button>
    </div>
  </div>

  {#if showFootnote}
    <p class="footnote" aria-label={$i18n("inputBox.shortcuts.ariaLabel")}>
      <span class="footnote-item">
        <span class="ui-kbd">Enter</span>
        <span>{$i18n("inputBox.shortcut.send")}</span>
      </span>
      <span class="footnote-sep" aria-hidden="true">·</span>
      <span class="footnote-item">
        <span class="shortcut-keys">
          <span class="ui-kbd">Shift</span><span class="shortcut-plus">+</span><span class="ui-kbd"
            >Enter</span
          >
        </span>
        <span>{$i18n("inputBox.shortcut.newline")}</span>
      </span>
      {#if attachmentsEnabled}
        <span class="footnote-sep" aria-hidden="true">·</span>
        <span class="footnote-item">{$i18n("inputBox.shortcut.attachments")}</span>
      {/if}
    </p>
  {/if}
</form>

<style>
  .input-box {
    position: relative;
    display: flex;

    flex-direction: column;

    gap: var(--space-2);

    padding: var(--space-3) var(--space-5);

    border-top: 1px solid var(--color-border-subtle);

    border-radius: 0 0 var(--radius-window) var(--radius-window);

    flex-shrink: 0;

    margin-top: auto;

    z-index: var(--z-status);

    overflow: hidden;
  }

  .input-box.drag-active {
    outline: 2px dashed color-mix(in srgb, var(--color-accent) 55%, transparent);

    outline-offset: -4px;
  }

  .hint {
    margin: 0;

    font-size: 0.8125rem;

    color: var(--color-muted);

    padding-left: var(--space-1);
  }

  .pending-list {
    list-style: none;

    margin: 0;

    padding: 0;

    display: flex;

    flex-wrap: wrap;

    gap: var(--space-2);
  }

  .pending-chip {
    display: inline-flex;

    align-items: center;

    gap: var(--space-1);

    padding: 0.2rem 0.45rem 0.2rem 0.65rem;

    border-radius: var(--radius-full);

    background: color-mix(in srgb, var(--color-accent) 12%, transparent);

    border: 1px solid color-mix(in srgb, var(--color-accent) 25%, var(--color-border));

    font-size: 0.75rem;

    max-width: 100%;
  }

  .pending-name {
    overflow: hidden;

    text-overflow: ellipsis;

    white-space: nowrap;

    max-width: 14rem;
  }

  .pending-chip.focused {
    outline: 2px solid color-mix(in srgb, var(--color-accent) 45%, transparent);
    outline-offset: 1px;
  }

  .remove-btn {
    width: 1.5rem;

    height: 1.5rem;

    min-width: 1.5rem;

    padding: 0;

    line-height: 1;

    font-size: 1rem;
  }

  .attachment-error {
    margin: 0;

    font-size: 0.8125rem;

    color: var(--color-danger);

    padding-left: var(--space-1);
  }

  .composer {
    border-radius: var(--radius-2xl);
    padding: 5px;
    background: color-mix(in srgb, var(--glass-surface) 35%, transparent);
    border: 1px solid var(--color-border-subtle);
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }
  .composer > :global(.row) {
    border-radius: calc(var(--radius-2xl) - 5px);
    background: var(--glass-surface);
    box-shadow: inset 0 1px 0 var(--glass-highlight);
  }

  .row {
    display: flex;

    gap: var(--space-2);

    align-items: center;
  }

  .attach-btn {
    width: 2.625rem;

    height: 2.625rem;

    min-width: 2.625rem;

    padding: 0;

    border-radius: var(--radius-sm);

    flex-shrink: 0;
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

    color: var(--color-danger);

    flex-shrink: 0;
  }

  .stop-btn:not(:disabled):hover {
    background: color-mix(in srgb, var(--color-danger) 22%, transparent);

    border-color: var(--color-danger);
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
    transform: scale(1.04) translateY(-1px);
  }

  .send-btn:not(:disabled):active {
    transform: scale(0.96) translateY(0);
  }

  .drop-overlay {
    position: absolute;
    inset: var(--space-2);
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    border-radius: var(--radius-xl);
    background: color-mix(in srgb, var(--color-companion-surface) 92%, transparent);
    border: 1px dashed color-mix(in srgb, var(--color-accent) 45%, var(--color-border));
    color: var(--color-text);
    text-align: center;
    pointer-events: none;
  }

  .drop-overlay strong {
    font-size: var(--font-size-md);
  }

  .drop-overlay span {
    font-size: var(--font-size-sm);
    color: var(--color-muted);
  }

  .footnote {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.45rem;
    margin: 0;
    padding: 0 0 0 var(--space-1);
    font-size: 0.625rem;
    line-height: 1.2;
    color: var(--color-muted);
    opacity: 0.8;
  }

  .footnote-item {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    white-space: nowrap;
  }

  .footnote-sep {
    opacity: 0.45;
    user-select: none;
  }

  .shortcut-keys {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
  }

  .shortcut-plus {
    font-size: var(--font-size-xs);
    color: var(--color-muted);
  }
</style>
