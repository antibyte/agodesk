<script lang="ts">
  interface Props {
    visible?: boolean;
    operation?: string;
    onApprove?: () => void;
    onDeny?: () => void;
    onStop?: () => void;
  }

  let {
    visible = false,
    operation = "",
    onApprove,
    onDeny,
    onStop,
  }: Props = $props();
</script>

{#if visible}
  <div class="remote-banner" aria-live="assertive" role="dialog" aria-labelledby="remote-title">
    <div>
      <strong id="remote-title">Remote Control — Freigabe erforderlich</strong>
      <p>
        Ein Agent moechte auf deinen Desktop zugreifen
        {#if operation}
          (<code>{operation}</code>).
        {/if}
        Screenshots und Eingaben sind erst nach deiner Freigabe moeglich.
      </p>
    </div>
    <div class="actions">
      <button type="button" onclick={() => onApprove?.()}>Freigeben</button>
      <button type="button" class="secondary" onclick={() => onDeny?.()}>Ablehnen</button>
      {#if operation === "desktop_input" || operation === "desktop_screenshot"}
        <button type="button" class="danger" onclick={() => onStop?.()}>Stoppen</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .remote-banner {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 1.25rem;
    border-bottom: 2px solid #f59e0b;
    background: color-mix(in srgb, #f59e0b 22%, var(--color-surface));
    box-shadow: 0 2px 8px color-mix(in srgb, #f59e0b 25%, transparent);
    z-index: 20;
  }

  code {
    font-size: 0.8125rem;
  }

  p {
    margin: 0.35rem 0 0;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  button {
    border: none;
    border-radius: 0.5rem;
    padding: 0.55rem 0.9rem;
    background: var(--color-accent);
    color: white;
    cursor: pointer;
  }

  .secondary,
  .danger {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text);
  }

  .danger {
    border-color: #ef4444;
    color: #ef4444;
  }
</style>
