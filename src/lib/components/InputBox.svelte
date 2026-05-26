<script lang="ts">
  interface Props {
    disabled?: boolean;
    hint?: string;
    onSubmit?: (text: string) => void;
  }

  let { disabled = false, hint = "", onSubmit }: Props = $props();

  let text = $state("");

  function submit(): void {
    const trimmed = text.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSubmit?.(trimmed);
    text = "";
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
  <textarea
    bind:value={text}
    placeholder="Nachricht eingeben… (Enter senden, Shift+Enter für Zeilenumbruch)"
    rows="3"
    {disabled}
    onkeydown={handleKeydown}
  ></textarea>
  <button type="submit" disabled={disabled || !text.trim()}>
    {disabled ? "Gesperrt" : "Senden"}
  </button>
  </div>
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
  }

  textarea:focus {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  button {
    align-self: flex-end;
    min-width: 6rem;
    border: none;
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    font: inherit;
    font-weight: 600;
    background: var(--color-accent);
    color: white;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
