<script lang="ts">
  import { toastService, toastState } from "../services/toast";
  import { i18n } from "../i18n";
  import Icon from "./Icon.svelte";

  const toneForType = {
    info: "info",
    success: "success",
    warning: "warning",
    error: "danger",
  } as const;
</script>

<div class="toast-stack" aria-live="polite">
  {#each $toastState.active as toast (toast.id)}
    <div
      class="toast-item banner-glass"
      data-tone={toneForType[toast.type]}
      role={toast.type === "error" ? "alert" : "status"}
    >
      <p>{toast.message}</p>
      {#if toast.dismissible}
        <button
          type="button"
          class="ui-btn ui-btn-icon toast-dismiss"
          aria-label={$i18n("toast.dismiss")}
          onclick={() => toastService.dismiss(toast.id)}
        >
          <Icon name="close" size={14} />
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toast-stack {
    position: fixed;
    right: var(--space-5);
    bottom: var(--space-5);
    z-index: var(--z-toast);
    display: grid;
    gap: var(--space-2);
    max-width: min(22rem, calc(100vw - 2rem));
    pointer-events: none;
  }

  .toast-item {
    margin: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    pointer-events: auto;
    animation: toast-in var(--transition-base) ease-out;
  }

  .toast-item p {
    margin: 0;
    font-size: var(--font-size-sm);
    line-height: var(--line-height-normal);
  }

  .toast-dismiss {
    width: 1.75rem;
    height: 1.75rem;
    min-width: 1.75rem;
    flex-shrink: 0;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast-item {
      animation: none;
    }
  }
</style>
