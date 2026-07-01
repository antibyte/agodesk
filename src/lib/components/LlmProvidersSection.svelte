<script lang="ts">
  import { onDestroy } from "svelte";
  import type { UnlistenFn } from "@tauri-apps/api/event";
  import { i18n } from "../i18n";
  import { providersState } from "../stores/providers";
  import { openExternalUrl } from "../services/open-external-url";
  import {
    listenForOAuthCallback,
    startOAuthLoopbackListener,
    stopOAuthLoopbackListener,
  } from "../services/oauth-loopback";
  import {
    completeConfigProviderOauth,
    deleteConfigProvider,
    fetchConfigProviderCatalogDetail,
    fetchConfigProviderCatalogList,
    fetchConfigProviderDetail,
    fetchConfigProvidersList,
    revokeConfigProviderOauth,
    startConfigProviderOauth,
    testConfigProvider,
    upsertConfigProvider,
  } from "../services/providers-flow";
  import type {
    ConfigProvider,
    ConfigProviderCatalogEntry,
    ConfigProviderUpsertPayload,
    WsMessage,
  } from "../types/protocol";
  import {
    hasAdvertisedConfigProvidersOauth,
    hasAdvertisedConfigProvidersRead,
    hasAdvertisedConfigProvidersWrite,
  } from "../types/protocol";
  import OAuthProgressModal from "./OAuthProgressModal.svelte";
  import ProviderCatalogModal from "./ProviderCatalogModal.svelte";
  import ProviderEditorPanel from "./ProviderEditorPanel.svelte";

  interface Props {
    sessionId?: string;
    advertisedCapabilities?: string[];
    wsSend?: (message: WsMessage) => Promise<void>;
  }

  let { sessionId = "", advertisedCapabilities = [], wsSend }: Props = $props();

  const canRead = $derived(hasAdvertisedConfigProvidersRead(advertisedCapabilities));
  const canWrite = $derived(hasAdvertisedConfigProvidersWrite(advertisedCapabilities));
  const canOauth = $derived(hasAdvertisedConfigProvidersOauth(advertisedCapabilities));

  let editorOpen = $state(false);
  let editorMode = $state<"create" | "edit">("create");
  let editingProvider = $state<ConfigProvider | null>(null);
  let selectedCatalogEntry = $state<ConfigProviderCatalogEntry | null>(null);
  let catalogOpen = $state(false);
  let busy = $state(false);
  let feedback = $state("");
  let feedbackTone = $state<"success" | "error" | "">("");

  let oauthOpen = $state(false);
  let oauthBusy = $state(false);
  let oauthError = $state("");
  let oauthProviderId = $state("");
  let oauthProviderName = $state("");
  let oauthManualEnabled = $state(false);
  let oauthManualUrl = $state("");
  let oauthUnlisten: UnlistenFn | null = null;

  $effect(() => {
    if (sessionId && canRead && wsSend) {
      void fetchConfigProvidersList(wsSend, sessionId).catch((error) => {
        providersState.setError(error instanceof Error ? error.message : String(error));
        providersState.setLoading(false);
      });
    }
  });

  onDestroy(() => {
    void cleanupOauth();
  });

  function setFeedback(message: string, tone: "success" | "error" | ""): void {
    feedback = message;
    feedbackTone = tone;
  }

  async function refreshList(): Promise<void> {
    if (!wsSend || !sessionId || !canRead) {
      return;
    }
    await fetchConfigProvidersList(wsSend, sessionId);
  }

  async function openCreateEditor(): Promise<void> {
    editorMode = "create";
    editingProvider = null;
    selectedCatalogEntry = null;
    editorOpen = true;
  }

  async function openEditEditor(provider: ConfigProvider): Promise<void> {
    if (!wsSend || !sessionId) {
      return;
    }
    editorMode = "edit";
    editorOpen = true;
    busy = true;
    try {
      editingProvider = await fetchConfigProviderDetail(wsSend, sessionId, provider.id);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error), "error");
      editorOpen = false;
    } finally {
      busy = false;
    }
  }

  async function openCatalog(): Promise<void> {
    if (!wsSend || !sessionId || !canWrite) {
      return;
    }
    catalogOpen = true;
    busy = true;
    try {
      await fetchConfigProviderCatalogList(wsSend, sessionId);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error), "error");
      catalogOpen = false;
    } finally {
      busy = false;
    }
  }

  async function handleCatalogSelect(entry: ConfigProviderCatalogEntry): Promise<void> {
    if (!wsSend || !sessionId) {
      return;
    }
    catalogOpen = false;
    editorMode = "create";
    editorOpen = true;
    busy = true;
    try {
      const detail = await fetchConfigProviderCatalogDetail(wsSend, sessionId, entry.id);
      selectedCatalogEntry = detail.providers[0] ?? entry;
      editingProvider = null;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error), "error");
      editorOpen = false;
    } finally {
      busy = false;
    }
  }

  async function handleSave(payload: ConfigProviderUpsertPayload): Promise<void> {
    if (!wsSend || !sessionId || !canWrite) {
      return;
    }
    busy = true;
    try {
      const saved = await upsertConfigProvider(wsSend, {
        ...payload,
        session_id: sessionId,
      });
      editingProvider = saved;
      editorMode = "edit";
      setFeedback($i18n("settings.llmProviders.feedback.saved"), "success");
      await refreshList();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error), "error");
    } finally {
      busy = false;
    }
  }

  async function handleDelete(provider: ConfigProvider): Promise<void> {
    if (!wsSend || !sessionId || !canWrite) {
      return;
    }
    if (!confirm($i18n("settings.llmProviders.confirmDelete", { name: provider.name }))) {
      return;
    }
    busy = true;
    try {
      await deleteConfigProvider(wsSend, sessionId, provider.id);
      if (editingProvider?.id === provider.id) {
        editorOpen = false;
        editingProvider = null;
      }
      setFeedback($i18n("settings.llmProviders.feedback.deleted"), "success");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error), "error");
    } finally {
      busy = false;
    }
  }

  async function handleTest(provider: ConfigProvider): Promise<void> {
    if (!wsSend || !sessionId) {
      return;
    }
    busy = true;
    try {
      const result = await testConfigProvider(wsSend, sessionId, provider.id);
      if (result.ok) {
        setFeedback(result.message || $i18n("settings.llmProviders.feedback.testOk"), "success");
      } else {
        setFeedback(result.message || $i18n("settings.llmProviders.feedback.testFailed"), "error");
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error), "error");
    } finally {
      busy = false;
    }
  }

  async function cleanupOauth(): Promise<void> {
    if (oauthUnlisten) {
      await oauthUnlisten();
      oauthUnlisten = null;
    }
    await stopOAuthLoopbackListener();
    oauthOpen = false;
    oauthBusy = false;
    oauthError = "";
    oauthManualUrl = "";
  }

  async function handleStartOauth(providerId: string): Promise<void> {
    if (!wsSend || !sessionId || !canOauth) {
      return;
    }

    const provider =
      editingProvider?.id === providerId
        ? editingProvider
        : $providersState.providers.find((entry) => entry.id === providerId);
    oauthProviderId = providerId;
    oauthProviderName = provider?.name ?? providerId;
    oauthManualEnabled = false;
    oauthError = "";
    oauthOpen = true;
    oauthBusy = true;

    try {
      if (oauthUnlisten) {
        await oauthUnlisten();
        oauthUnlisten = null;
      }
      await stopOAuthLoopbackListener();

      const callbackPath = selectedCatalogEntry?.oauth_setup?.callback_path ?? "/oauth/callback";
      const callbackPort = selectedCatalogEntry?.oauth_setup?.callback_port;
      const listener = await startOAuthLoopbackListener({
        port: callbackPort,
        path: callbackPath.startsWith("/") ? callbackPath : `/${callbackPath}`,
        providerId,
      });

      oauthUnlisten = await listenForOAuthCallback(async (event) => {
        if (event.provider_id && event.provider_id !== providerId) {
          return;
        }
        await finishOauth(providerId, event.redirect_url);
      });

      const started = await startConfigProviderOauth(
        wsSend,
        sessionId,
        providerId,
        listener.redirect_uri,
      );
      oauthManualEnabled = started.fallback_modes?.includes("manual_paste") ?? false;
      await openExternalUrl(started.auth_url);
      oauthBusy = false;
    } catch (error) {
      oauthError = error instanceof Error ? error.message : String(error);
      oauthBusy = false;
    }
  }

  async function finishOauth(providerId: string, redirectUrl: string): Promise<void> {
    if (!wsSend || !sessionId) {
      return;
    }
    oauthBusy = true;
    try {
      await completeConfigProviderOauth(wsSend, sessionId, providerId, redirectUrl);
      editingProvider = await fetchConfigProviderDetail(wsSend, sessionId, providerId);
      setFeedback($i18n("settings.llmProviders.oauth.success"), "success");
      await refreshList();
      await cleanupOauth();
    } catch (error) {
      oauthError = error instanceof Error ? error.message : String(error);
      oauthBusy = false;
    }
  }

  async function handleRevokeOauth(providerId: string): Promise<void> {
    if (!wsSend || !sessionId || !canOauth) {
      return;
    }
    busy = true;
    try {
      await revokeConfigProviderOauth(wsSend, sessionId, providerId);
      editingProvider = await fetchConfigProviderDetail(wsSend, sessionId, providerId);
      setFeedback($i18n("settings.llmProviders.oauth.revoked"), "success");
      await refreshList();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error), "error");
    } finally {
      busy = false;
    }
  }
</script>

<section class="llm-providers">
  <div class="card-header">
    <h2>{$i18n("settings.llmProviders.title")}</h2>
    <p>{$i18n("settings.llmProviders.description")}</p>
  </div>

  {#if !canRead}
    <p class="readonly-note">{$i18n("settings.llmProviders.readNotSupported")}</p>
  {:else}
    <div class="toolbar">
      <button type="button" class="ui-btn ghost" disabled={busy} onclick={() => void refreshList()}>
        {$i18n("settings.llmProviders.refresh")}
      </button>
      {#if canWrite}
        <button
          type="button"
          class="ui-btn"
          disabled={busy}
          onclick={() => void openCreateEditor()}
        >
          {$i18n("settings.llmProviders.addCustom")}
        </button>
        <button
          type="button"
          class="ui-btn primary"
          disabled={busy}
          onclick={() => void openCatalog()}
        >
          {$i18n("settings.llmProviders.addFromCatalog")}
        </button>
      {/if}
    </div>

    {#if $providersState.loading}
      <p>{$i18n("settings.llmProviders.loading")}</p>
    {:else if $providersState.error}
      <p class="feedback error" role="alert">{$providersState.error}</p>
    {/if}

    {#if feedback}
      <p class="feedback" data-tone={feedbackTone} role="status">{feedback}</p>
    {/if}

    {#if $providersState.providers.length === 0}
      <p class="empty">{$i18n("settings.llmProviders.empty")}</p>
    {:else}
      <ul class="provider-list">
        {#each $providersState.providers as provider (provider.id)}
          <li class="provider-card ui-card">
            <div class="provider-head">
              <div>
                <h3>{provider.name}</h3>
                <p class="provider-meta">
                  {provider.type}{provider.model ? ` · ${provider.model}` : ""}
                </p>
              </div>
              <div class="chip-row">
                {#if provider.auth_type}
                  <span class="ui-chip" data-tone="idle">{provider.auth_type}</span>
                {/if}
                {#if provider.oauth?.authorized}
                  <span class="ui-chip" data-tone="accepted">
                    {$i18n("settings.llmProviders.oauth.authorized")}
                  </span>
                {/if}
              </div>
            </div>

            <dl class="info-grid compact">
              {#if provider.base_url}
                <div>
                  <dt>{$i18n("settings.llmProviders.fields.baseUrl")}</dt>
                  <dd>{provider.base_url}</dd>
                </div>
              {/if}
              {#if provider.oauth?.missing_fields?.length}
                <div class="full">
                  <dt>{$i18n("settings.llmProviders.missingFields")}</dt>
                  <dd>{provider.oauth.missing_fields.join(", ")}</dd>
                </div>
              {/if}
              {#if provider.references?.length}
                <div class="full">
                  <dt>{$i18n("settings.llmProviders.references")}</dt>
                  <dd class="chip-row">
                    {#each provider.references as ref (ref.path + ref.role)}
                      <span class="ui-chip" data-tone="connected">{ref.role}</span>
                    {/each}
                  </dd>
                </div>
              {/if}
            </dl>

            <div class="provider-actions">
              <button
                type="button"
                class="ui-btn ghost compact"
                disabled={busy || $providersState.testLoadingProviderId === provider.id}
                onclick={() => void handleTest(provider)}
              >
                {$i18n("settings.llmProviders.test")}
              </button>
              <button
                type="button"
                class="ui-btn ghost compact"
                disabled={busy}
                onclick={() => void openEditEditor(provider)}
              >
                {$i18n("settings.llmProviders.edit")}
              </button>
              {#if canWrite}
                <button
                  type="button"
                  class="ui-btn ghost compact danger"
                  disabled={busy}
                  onclick={() => void handleDelete(provider)}
                >
                  {$i18n("settings.llmProviders.delete")}
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    <ProviderEditorPanel
      open={editorOpen}
      mode={editorMode}
      provider={editingProvider}
      catalogEntry={selectedCatalogEntry}
      {canWrite}
      {canOauth}
      busy={busy || $providersState.detailLoading}
      onClose={() => {
        editorOpen = false;
        editingProvider = null;
        selectedCatalogEntry = null;
      }}
      onSave={(payload) => void handleSave(payload)}
      onStartOauth={(providerId) => void handleStartOauth(providerId)}
      onRevokeOauth={(providerId) => void handleRevokeOauth(providerId)}
    />
  {/if}
</section>

<ProviderCatalogModal
  open={catalogOpen}
  entries={$providersState.catalog}
  busy={busy || $providersState.catalogLoading}
  onClose={() => {
    catalogOpen = false;
  }}
  onSelect={(entry) => void handleCatalogSelect(entry)}
/>

<OAuthProgressModal
  open={oauthOpen}
  providerName={oauthProviderName}
  manualPasteEnabled={oauthManualEnabled}
  bind:manualRedirectUrl={oauthManualUrl}
  busy={oauthBusy}
  errorMessage={oauthError}
  onCancel={() => void cleanupOauth()}
  onManualPaste={(redirectUrl) => void finishOauth(oauthProviderId, redirectUrl)}
/>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .provider-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }

  .provider-card {
    padding: 1rem;
  }

  .provider-head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .provider-head h3 {
    margin: 0;
  }

  .provider-meta {
    margin: 0.2rem 0 0;
    opacity: 0.75;
    font-size: 0.9rem;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .provider-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.75rem;
  }

  .feedback[data-tone="success"] {
    color: var(--success, #4ade80);
  }

  .feedback.error,
  .feedback[data-tone="error"] {
    color: var(--danger, #f87171);
  }

  .readonly-note,
  .empty {
    opacity: 0.85;
  }

  .info-grid.compact .full {
    grid-column: 1 / -1;
  }
</style>
