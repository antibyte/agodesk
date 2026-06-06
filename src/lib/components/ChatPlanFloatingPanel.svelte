<script lang="ts">
  import { i18n } from "../i18n";
  import type { AgoDeskPlan, AgoDeskPlanTask } from "../types/protocol";

  interface Props {
    visible?: boolean;
    plan?: AgoDeskPlan | null;
    requestId?: string;
  }

  let { visible = false, plan = null, requestId = undefined }: Props = $props();

  let collapsed = $state(false);

  const progressPct = $derived.by(() => {
    if (!plan) {
      return 0;
    }
    const raw = plan.progress_pct;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return Math.min(100, Math.max(0, raw));
    }
    return 0;
  });

  const taskCounts = $derived.by(() => {
    const counts = plan?.task_counts;
    if (!counts || typeof counts !== "object") {
      return null;
    }
    const record = counts as Record<string, unknown>;
    return {
      total: typeof record.total === "number" ? record.total : undefined,
      pending: typeof record.pending === "number" ? record.pending : undefined,
      inProgress:
        typeof record.in_progress === "number" ? record.in_progress : undefined,
      completed:
        typeof record.completed === "number" ? record.completed : undefined,
    };
  });

  const currentTaskTitle = $derived.by(() => {
    const current = plan?.current_task;
    if (!current || typeof current !== "object") {
      return "";
    }
    const title = (current as Record<string, unknown>).title;
    return typeof title === "string" ? title.trim() : "";
  });

  const tasks = $derived.by((): AgoDeskPlanTask[] => {
    if (!Array.isArray(plan?.tasks)) {
      return [];
    }
    return plan.tasks.filter((task) => task && typeof task === "object");
  });

  function taskStatusLabel(status: unknown): string {
    const normalized = typeof status === "string" ? status.toLowerCase() : "";
    switch (normalized) {
      case "pending":
        return $i18n("chatPlan.status.pending");
      case "in_progress":
        return $i18n("chatPlan.status.inProgress");
      case "completed":
        return $i18n("chatPlan.status.completed");
      default:
        return normalized || $i18n("chatPlan.status.pending");
    }
  }

  function taskStatusTone(status: unknown): string {
    const normalized = typeof status === "string" ? status.toLowerCase() : "";
    switch (normalized) {
      case "in_progress":
        return "accent";
      case "completed":
        return "success";
      default:
        return "info";
    }
  }
</script>

{#if visible && plan}
  <aside
    class="plan-panel banner-glass"
    data-tone="info"
    class:is-collapsed={collapsed}
    aria-live="polite"
    aria-label={$i18n("chatPlan.title")}
  >
    <header class="plan-header">
      <div class="plan-title-block">
        <strong>{plan.title?.trim() || $i18n("chatPlan.title")}</strong>
        {#if progressPct > 0}
          <span class="plan-progress-label">
            {$i18n("chatPlan.progress", { percent: Math.round(progressPct) })}
          </span>
        {/if}
      </div>
      <button
        type="button"
        class="ui-btn ui-btn-ghost plan-toggle"
        onclick={() => (collapsed = !collapsed)}
        aria-expanded={!collapsed}
      >
        {collapsed ? $i18n("chatPlan.expand") : $i18n("chatPlan.collapse")}
      </button>
    </header>

    {#if progressPct > 0}
      <div class="plan-progress" role="progressbar" aria-valuenow={progressPct} aria-valuemin="0" aria-valuemax="100">
        <div class="plan-progress-fill" style:width="{progressPct}%"></div>
      </div>
    {/if}

    {#if !collapsed}
      {#if taskCounts}
        <ul class="plan-counts">
          {#if taskCounts.total !== undefined}
            <li>{$i18n("chatPlan.tasks.total", { count: taskCounts.total })}</li>
          {/if}
          {#if taskCounts.pending !== undefined}
            <li>{$i18n("chatPlan.tasks.pending", { count: taskCounts.pending })}</li>
          {/if}
          {#if taskCounts.inProgress !== undefined}
            <li>{$i18n("chatPlan.tasks.inProgress", { count: taskCounts.inProgress })}</li>
          {/if}
          {#if taskCounts.completed !== undefined}
            <li>{$i18n("chatPlan.tasks.completed", { count: taskCounts.completed })}</li>
          {/if}
        </ul>
      {/if}

      {#if currentTaskTitle}
        <p class="plan-current">
          <span class="plan-current-label">{$i18n("chatPlan.currentTask")}</span>
          {currentTaskTitle}
        </p>
      {/if}

      {#if tasks.length > 0}
        <ul class="plan-tasks">
          {#each tasks as task (task.id ?? task.title)}
            <li data-status={typeof task.status === "string" ? task.status.toLowerCase() : "pending"}>
              <span class="task-status" data-tone={taskStatusTone(task.status)}>
                {taskStatusLabel(task.status)}
              </span>
              <span class="task-title">{task.title?.trim() || "—"}</span>
            </li>
          {/each}
        </ul>
      {/if}

      {#if requestId}
        <span class="plan-request-id" aria-hidden="true">{requestId}</span>
      {/if}
    {/if}
  </aside>
{/if}

<style>
  .plan-panel {
    position: fixed;
    right: var(--space-4);
    bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
    width: min(22rem, calc(100vw - var(--space-8)));
    z-index: 25;
    border-radius: var(--radius-lg);
    padding: var(--space-3) var(--space-4);
    box-shadow: var(--shadow-md);
  }

  .plan-panel.is-collapsed {
    padding-bottom: var(--space-3);
  }

  .plan-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .plan-title-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .plan-progress-label {
    font-size: 0.75rem;
    color: var(--color-muted);
  }

  .plan-toggle {
    flex-shrink: 0;
    font-size: 0.75rem;
    padding: var(--space-1) var(--space-2);
  }

  .plan-progress {
    margin-top: var(--space-2);
    height: 0.375rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-border) 60%, transparent);
    overflow: hidden;
  }

  .plan-progress-fill {
    height: 100%;
    border-radius: inherit;
    background: var(--color-accent);
    transition: width 0.25s ease;
  }

  .plan-counts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
    margin: var(--space-3) 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.75rem;
    color: var(--color-muted);
  }

  .plan-current {
    margin: var(--space-3) 0 0;
    font-size: 0.8125rem;
    line-height: 1.45;
  }

  .plan-current-label {
    display: block;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted);
    margin-bottom: var(--space-1);
  }

  .plan-tasks {
    margin: var(--space-3) 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: 12rem;
    overflow-y: auto;
  }

  .plan-tasks li {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .plan-tasks li[data-status="in_progress"] .task-title {
    font-weight: 600;
  }

  .task-status {
    flex-shrink: 0;
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--color-border) 50%, transparent);
  }

  .task-status[data-tone="accent"] {
    color: var(--color-accent);
  }

  .task-status[data-tone="success"] {
    color: var(--color-success);
  }

  .task-title {
    min-width: 0;
    word-break: break-word;
  }

  .plan-request-id {
    display: none;
  }
</style>
