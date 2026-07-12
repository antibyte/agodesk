<script lang="ts">
  import { i18n } from "../i18n";
  import type { AgentActivityPayload, AgentActivityPhase } from "../types/protocol";
  import { buildActivityTree, listActiveActivities } from "../stores/activity-timeline";

  interface Props {
    visible?: boolean;
    activities?: AgentActivityPayload[];
    compact?: boolean;
    onDismiss?: () => void;
    onStopShell?: (activity: AgentActivityPayload) => void;
  }

  let {
    visible = false,
    activities = [],
    compact = false,
    onDismiss,
    onStopShell,
  }: Props = $props();

  let collapsed = $state(false);

  const active = $derived(listActiveActivities(activities));
  const tree = $derived(buildActivityTree(activities));

  function phaseIcon(phase: AgentActivityPhase): string {
    switch (phase) {
      case "completed":
        return "✓";
      case "failed":
        return "✗";
      case "cancelled":
        return "○";
      case "waiting_approval":
        return "⏸";
      case "progress":
      case "started":
        return "◉";
      default:
        return "●";
    }
  }

  function phaseLabel(phase: AgentActivityPhase): string {
    switch (phase) {
      case "queued":
        return $i18n("activityTimeline.phase.queued");
      case "started":
        return $i18n("activityTimeline.phase.started");
      case "progress":
        return $i18n("activityTimeline.phase.progress");
      case "waiting_approval":
        return $i18n("activityTimeline.phase.waitingApproval");
      case "completed":
        return $i18n("activityTimeline.phase.completed");
      case "failed":
        return $i18n("activityTimeline.phase.failed");
      case "cancelled":
        return $i18n("activityTimeline.phase.cancelled");
      default:
        return phase;
    }
  }

  function formatProgress(activity: AgentActivityPayload): string {
    const progress = activity.progress;
    if (!progress) {
      return "";
    }
    if (progress.current !== undefined && progress.total !== undefined) {
      const unit = progress.unit ? ` ${progress.unit}` : "";
      return `${progress.current} / ${progress.total}${unit}`;
    }
    if (progress.current !== undefined) {
      return String(progress.current);
    }
    return "";
  }
</script>

{#if visible && activities.length > 0}
  <aside
    class="activity-panel banner-glass"
    class:is-collapsed={collapsed}
    class:is-compact={compact}
    data-tone="info"
    aria-live="polite"
    aria-label={$i18n("activityTimeline.title")}
  >
    <header class="activity-header">
      <div class="activity-title-block">
        <strong>{$i18n("activityTimeline.title")}</strong>
        {#if active.length > 0}
          <span class="activity-count">
            {$i18n("activityTimeline.activeCount", { count: active.length })}
          </span>
        {/if}
      </div>
      <div class="activity-header-actions">
        <button
          type="button"
          class="ui-btn ui-btn-ghost activity-toggle"
          onclick={() => (collapsed = !collapsed)}
          aria-expanded={!collapsed}
        >
          {collapsed ? $i18n("activityTimeline.expand") : $i18n("activityTimeline.collapse")}
        </button>
        <button
          type="button"
          class="ui-btn ui-btn-ghost activity-dismiss"
          aria-label={$i18n("activityTimeline.dismiss.ariaLabel")}
          title={$i18n("activityTimeline.dismiss")}
          onclick={() => onDismiss?.()}
        >
          ×
        </button>
      </div>
    </header>

    {#if !collapsed}
      <ul class="activity-list">
        {#each tree as node (node.activity_id)}
          <li class="activity-item" data-phase={node.phase}>
            <div class="activity-row">
              <span class="activity-icon" aria-hidden="true">{phaseIcon(node.phase)}</span>
              <div class="activity-body">
                <div class="activity-title">{node.title}</div>
                {#if node.summary}
                  <div class="activity-summary">{node.summary}</div>
                {/if}
                <div class="activity-meta">
                  <span>{phaseLabel(node.phase)}</span>
                  {#if formatProgress(node)}
                    <span>{formatProgress(node)}</span>
                  {/if}
                  {#if node.duration_ms !== undefined}
                    <span>{(node.duration_ms / 1000).toFixed(1)} s</span>
                  {/if}
                </div>
              </div>
              {#if node.kind === "shell" && (node.phase === "started" || node.phase === "progress") && onStopShell}
                <button
                  type="button"
                  class="ui-btn ui-btn-ghost activity-stop"
                  onclick={() => onStopShell(node)}
                >
                  {$i18n("activityTimeline.stop")}
                </button>
              {/if}
            </div>
            {#if node.children.length > 0}
              <ul class="activity-children">
                {#each node.children as child (child.activity_id)}
                  <li class="activity-item nested" data-phase={child.phase}>
                    <div class="activity-row">
                      <span class="activity-icon" aria-hidden="true">{phaseIcon(child.phase)}</span>
                      <div class="activity-body">
                        <div class="activity-title">{child.title}</div>
                        {#if child.summary}
                          <div class="activity-summary">{child.summary}</div>
                        {/if}
                      </div>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    {:else if active[0]}
      <div class="activity-compact-line">
        <span class="activity-icon" aria-hidden="true">{phaseIcon(active[0].phase)}</span>
        <span>{active[0].title}</span>
      </div>
    {/if}
  </aside>
{/if}

<style>
  .activity-panel {
    position: absolute;
    top: 3.25rem;
    right: 0.75rem;
    z-index: 24;
    width: min(22rem, calc(100% - 1.5rem));
    max-height: min(50vh, 28rem);
    overflow: auto;
    padding: 0.65rem 0.75rem;
    border-radius: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .activity-panel.is-collapsed {
    max-height: none;
  }

  .activity-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .activity-title-block {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .activity-count {
    font-size: 0.75rem;
    opacity: 0.75;
  }

  .activity-header-actions {
    display: flex;
    gap: 0.15rem;
    flex-shrink: 0;
  }

  .activity-list,
  .activity-children {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .activity-children {
    margin-left: 1.1rem;
    margin-top: 0.35rem;
    padding-left: 0.55rem;
    border-left: 1px solid color-mix(in srgb, var(--ui-border, #444) 55%, transparent);
  }

  .activity-row {
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
  }

  .activity-icon {
    width: 1rem;
    text-align: center;
    flex-shrink: 0;
    line-height: 1.35;
  }

  .activity-body {
    min-width: 0;
    flex: 1;
  }

  .activity-title {
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .activity-summary,
  .activity-meta {
    font-size: 0.75rem;
    opacity: 0.8;
    line-height: 1.35;
  }

  .activity-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.1rem;
  }

  .activity-stop {
    font-size: 0.7rem;
    padding: 0.15rem 0.4rem;
  }

  .activity-compact-line {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
  }

  .activity-item[data-phase="failed"] .activity-title {
    color: var(--ui-danger, #f66);
  }

  .activity-item[data-phase="completed"] .activity-icon {
    color: var(--ui-success, #4c4);
  }
</style>
