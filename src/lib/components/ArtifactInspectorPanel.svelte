<script lang="ts">
  import { i18n } from "../i18n";
  import type { ArtifactAction, ChatMediaItem } from "../types/protocol";
  import { openExternalUrl } from "../services/open-external-url";
  import { formatInvokeError } from "../services/errors";
  import type { ArtifactInspectorTab } from "../stores/artifact-inspector";

  interface Props {
    visible?: boolean;
    item?: ChatMediaItem | null;
    activeTab?: ArtifactInspectorTab;
    serverUrl?: string;
    onClose?: () => void;
    onTabChange?: (tab: ArtifactInspectorTab) => void;
  }

  let {
    visible = false,
    item = null,
    activeTab = "preview",
    serverUrl = "",
    onClose,
    onTabChange,
  }: Props = $props();

  let actionError = $state<string | null>(null);
  let actionBusy = $state(false);

  const displayTitle = $derived(item?.title || item?.filename || item?.kind || "");
  const previewText = $derived(
    item?.preview?.trim() || item?.description?.trim() || item?.caption?.trim() || "",
  );
  const diffText = $derived.by(() => {
    if (!item) {
      return "";
    }
    if (item.kind === "diff" && item.content?.trim()) {
      return item.content.trim();
    }
    if (item.content?.trim()) {
      return item.content.trim();
    }
    if (item.preview?.trim()) {
      return item.preview.trim();
    }
    return item.description?.trim() ?? "";
  });
  const hasDiff = $derived(diffText.length > 0);
  const openTarget = $derived(
    item?.path || item?.agent_path || item?.url || item?.content_ref || "",
  );
  const folderTarget = $derived.by(() => {
    if (!item) {
      return "";
    }
    if (item.kind === "directory") {
      return item.path || item.agent_path || item.content_ref || "";
    }
    const path = item.path || item.agent_path;
    if (!path) {
      return "";
    }
    const normalized = path.replace(/\\/g, "/");
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash <= 0) {
      return "";
    }
    return path.slice(0, lastSlash);
  });

  const resolvedActions = $derived.by((): ArtifactAction[] => {
    if (!item) {
      return [];
    }
    if (item.actions && item.actions.length > 0) {
      return item.actions;
    }
    const defaults: ArtifactAction[] = [];
    if (openTarget) {
      defaults.push({ kind: "open", target: openTarget });
    }
    if (folderTarget) {
      defaults.push({ kind: "open_folder", target: folderTarget });
    }
    if (previewText || diffText || item.content) {
      defaults.push({ kind: "copy" });
    }
    if (diffText || item.content) {
      defaults.push({ kind: "save" });
    }
    return defaults;
  });

  function actionLabel(action: ArtifactAction): string {
    if (action.label?.trim()) {
      return action.label.trim();
    }
    switch (action.kind) {
      case "open":
        return $i18n("artifactInspector.action.open");
      case "open_folder":
        return $i18n("artifactInspector.action.openFolder");
      case "copy":
        return $i18n("artifactInspector.action.copy");
      case "save":
        return $i18n("artifactInspector.action.save");
      default:
        return action.kind;
    }
  }

  async function handleAction(action: ArtifactAction): Promise<void> {
    if (!item || actionBusy) {
      return;
    }

    actionError = null;
    actionBusy = true;

    try {
      switch (action.kind) {
        case "open": {
          const target = action.target || openTarget;
          if (target) {
            await openExternalUrl(target);
          }
          break;
        }
        case "open_folder": {
          const target = action.target || folderTarget;
          if (target) {
            await openExternalUrl(target);
          }
          break;
        }
        case "copy": {
          const text = action.target || diffText || previewText || item.content || openTarget;
          if (text) {
            await navigator.clipboard.writeText(text);
          }
          break;
        }
        case "save": {
          const text = action.target || diffText || item.content || previewText;
          if (!text) {
            break;
          }
          const filename =
            item.filename?.trim() ||
            `${item.artifact_id || item.id || "artifact"}.${item.kind === "diff" ? "diff" : "txt"}`;
          const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = filename;
          anchor.click();
          URL.revokeObjectURL(url);
          break;
        }
      }
    } catch (error) {
      actionError = formatInvokeError(error, $i18n("artifactInspector.action.copy"));
    } finally {
      actionBusy = false;
    }
  }

  function selectTab(tab: ArtifactInspectorTab): void {
    onTabChange?.(tab);
  }
</script>

{#if visible && item}
  <aside
    class="artifact-panel banner-glass"
    data-tone="info"
    aria-live="polite"
    aria-label={$i18n("artifactInspector.title")}
  >
    <header class="artifact-header">
      <div class="artifact-title-block">
        <strong>{$i18n("artifactInspector.title")}</strong>
        {#if displayTitle}
          <span class="artifact-subtitle">{displayTitle}</span>
        {/if}
        <span class="artifact-kind">{item.kind}</span>
      </div>
      <button
        type="button"
        class="ui-btn ui-btn-ghost artifact-close"
        aria-label={$i18n("artifactInspector.close")}
        title={$i18n("artifactInspector.close")}
        onclick={() => onClose?.()}
      >
        ×
      </button>
    </header>

    <div class="artifact-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="artifact-tab"
        class:is-active={activeTab === "preview"}
        aria-selected={activeTab === "preview"}
        onclick={() => selectTab("preview")}
      >
        {$i18n("artifactInspector.tab.preview")}
      </button>
      <button
        type="button"
        role="tab"
        class="artifact-tab"
        class:is-active={activeTab === "diff"}
        aria-selected={activeTab === "diff"}
        disabled={!hasDiff}
        onclick={() => selectTab("diff")}
      >
        {$i18n("artifactInspector.tab.diff")}
      </button>
      <button
        type="button"
        role="tab"
        class="artifact-tab"
        class:is-active={activeTab === "source"}
        aria-selected={activeTab === "source"}
        onclick={() => selectTab("source")}
      >
        {$i18n("artifactInspector.tab.source")}
      </button>
    </div>

    <div class="artifact-body">
      {#if activeTab === "preview"}
        {#if previewText}
          <pre class="artifact-content">{previewText}</pre>
        {:else}
          <p class="artifact-empty">{$i18n("artifactInspector.empty")}</p>
        {/if}
      {:else if activeTab === "diff"}
        {#if diffText}
          <pre class="artifact-content artifact-diff">{diffText}</pre>
        {:else}
          <p class="artifact-empty">{$i18n("artifactInspector.empty")}</p>
        {/if}
      {:else if activeTab === "source"}
        <dl class="artifact-meta">
          {#if item.artifact_id}
            <div>
              <dt>artifact_id</dt>
              <dd>{item.artifact_id}</dd>
            </div>
          {/if}
          {#if item.source_activity_id}
            <div>
              <dt>source_activity_id</dt>
              <dd>{item.source_activity_id}</dd>
            </div>
          {/if}
          {#if item.content_ref}
            <div>
              <dt>content_ref</dt>
              <dd>{item.content_ref}</dd>
            </div>
          {/if}
          {#if item.path}
            <div>
              <dt>path</dt>
              <dd>{item.path}</dd>
            </div>
          {/if}
          {#if item.url}
            <div>
              <dt>url</dt>
              <dd>{item.url}</dd>
            </div>
          {/if}
          {#if serverUrl && item.request_id}
            <div>
              <dt>request_id</dt>
              <dd>{item.request_id}</dd>
            </div>
          {/if}
        </dl>
        {#if !item.artifact_id && !item.source_activity_id && !item.content_ref && !item.path && !item.url}
          <p class="artifact-empty">{$i18n("artifactInspector.empty")}</p>
        {/if}
      {/if}
    </div>

    {#if resolvedActions.length > 0}
      <div class="artifact-actions">
        {#each resolvedActions as action, index (`${action.kind}-${index}`)}
          <button
            type="button"
            class="ui-btn ui-btn-secondary ui-btn-sm"
            disabled={actionBusy}
            onclick={() => void handleAction(action)}
          >
            {actionLabel(action)}
          </button>
        {/each}
      </div>
    {/if}

    {#if actionError}
      <p class="artifact-error" role="alert">{actionError}</p>
    {/if}
  </aside>
{/if}

<style>
  .artifact-panel {
    position: absolute;
    top: 3.25rem;
    right: 0.75rem;
    z-index: 25;
    width: min(24rem, calc(100% - 1.5rem));
    max-height: min(70vh, 36rem);
    overflow: auto;
    padding: 0.65rem 0.75rem;
    border-radius: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .artifact-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .artifact-title-block {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .artifact-subtitle {
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.3;
    word-break: break-word;
  }

  .artifact-kind {
    font-size: 0.72rem;
    opacity: 0.75;
    text-transform: lowercase;
  }

  .artifact-tabs {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .artifact-tab {
    border: 1px solid color-mix(in srgb, var(--ui-border, #444) 55%, transparent);
    background: transparent;
    color: inherit;
    border-radius: 999px;
    padding: 0.2rem 0.55rem;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .artifact-tab.is-active {
    background: color-mix(in srgb, var(--ui-accent, #6af) 18%, transparent);
    border-color: color-mix(in srgb, var(--ui-accent, #6af) 45%, transparent);
  }

  .artifact-tab:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .artifact-body {
    min-height: 6rem;
  }

  .artifact-content {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.75rem;
    line-height: 1.45;
    max-height: 18rem;
    overflow: auto;
    padding: 0.45rem 0.5rem;
    border-radius: 0.45rem;
    border: 1px solid color-mix(in srgb, var(--ui-border, #444) 45%, transparent);
    background: color-mix(in srgb, var(--glass-surface, #111) 70%, transparent);
  }

  .artifact-diff {
    tab-size: 2;
  }

  .artifact-meta {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    font-size: 0.75rem;
  }

  .artifact-meta dt {
    opacity: 0.7;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .artifact-meta dd {
    margin: 0.1rem 0 0;
    word-break: break-all;
    font-family: var(--font-mono, ui-monospace, monospace);
  }

  .artifact-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .artifact-empty,
  .artifact-error {
    margin: 0;
    font-size: 0.78rem;
    opacity: 0.8;
  }

  .artifact-error {
    color: var(--ui-danger, #f66);
  }
</style>
