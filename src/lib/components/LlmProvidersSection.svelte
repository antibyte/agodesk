<script lang="ts">
  import { onDestroy } from "svelte";
  import { get } from "svelte/store";
  import type { UnlistenFn } from "@tauri-apps/api/event";
  import { i18n } from "../i18n";
  import { toastService } from "../services/toast";
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
  import {
    providerCapabilityChips,
    providerEffectiveMissingFields,
    providerListHasWarnings,
    providerOauthStatusChips,
    findCatalogEntryForProvider,
    mergeCatalogEntries,
    providerReferenceRoleLabel,
    providerSupportsOauth,
  } from "../services/provider-display";
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
  let editorLoadingDetail = $state(false);
  let editingProvider = $state<ConfigProvider | null>(null);
  let selectedCatalogEntry = $state<ConfigProviderCatalogEntry | null>(null);
  let catalogOpen = $state(false);
  let busy = $state(false);
  let sectionFeedback = $state("");
  let sectionFeedbackTone = $state<"success" | "error" | "">("");
  let providerFeedback = $state<Record<string, { message: string; tone: "success" | "error" }>>({});

  let oauthOpen = $state(false);
  let oauthBusy = $state(false);
  let oauthError = $state("");
  let editorError = $state("");
  let oauthProviderId = $state("");
  let oauthProviderName = $state("");
  let oauthManualEnabled = $state(false);
  let oauthManualUrl = $state("");
  let oauthUnlisten: UnlistenFn | null = null;
  let expandedProviderIds = $state<Record<string, boolean>>({});

  function isProviderExpanded(providerId: string): boolean {
    return expandedProviderIds[providerId] === true;
  }

  function toggleProviderExpanded(providerId: string): void {
    expandedProviderIds = {
      ...expandedProviderIds,
      [providerId]: !isProviderExpanded(providerId),
    };
  }

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

  function setFeedback(message: string, tone: "success" | "error" | "", providerId?: string): void {
    if (providerId && tone) {
      providerFeedback = {
        ...providerFeedback,
        [providerId]: { message, tone },
      };
      return;
    }
    sectionFeedback = message;
    sectionFeedbackTone = tone;
  }

  function showActionToast(
    message: string,
    tone: "success" | "error",
    providerName?: string,
  ): void {
    toastService.show({
      type: tone,
      message: providerName ? `${providerName}: ${message}` : message,
    });
  }

  async function refreshList(): Promise<void> {
    if (!wsSend || !sessionId || !canRead) {
      return;
    }
    await fetchConfigProvidersList(wsSend, sessionId);
  }

  async function openEditEditor(provider: ConfigProvider): Promise<void> {
    if (!wsSend || !sessionId) {
      return;
    }
    editorMode = "edit";
    editingProvider = provider;
    selectedCatalogEntry = null;
    editorError = "";
    editorOpen = true;
    editorLoadingDetail = true;
    try {
      editingProvider = await fetchConfigProviderDetail(wsSend, sessionId, provider.id);
      try {
        const catalog = get(providersState).catalog;
        const listEntry = findCatalogEntryForProvider(catalog, editingProvider) ?? {
          id: editingProvider.type || editingProvider.id,
          name: editingProvider.name,
          aura_provider_type: editingProvider.type,
        };
        const catalogId = listEntry.id || editingProvider.type || editingProvider.id;
        const detail = await fetchConfigProviderCatalogDetail(wsSend, sessionId, catalogId);
        selectedCatalogEntry = mergeCatalogEntries(listEntry, detail.providers[0] ?? null);
      } catch {
        // OAuth can still fall back to default loopback callback settings.
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error), "error");
      editorOpen = false;
      editingProvider = null;
    } finally {
      editorLoadingDetail = false;
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
    editorError = "";
    editorOpen = true;
    editorLoadingDetail = true;
    selectedCatalogEntry = entry;
    editingProvider = null;
    try {
      const detail = await fetchConfigProviderCatalogDetail(wsSend, sessionId, entry.id);
      selectedCatalogEntry = mergeCatalogEntries(entry, detail.providers[0] ?? null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error), "error");
      editorOpen = false;
      selectedCatalogEntry = null;
    } finally {
      editorLoadingDetail = false;
    }
  }

  async function handleSave(
    payload: ConfigProviderUpsertPayload,
    options: { startOauthAfterSave?: boolean } = {},
  ): Promise<void> {
    if (!wsSend || !sessionId || !canWrite) {
      editorError = $i18n("settings.llmProviders.oauth.unavailable");
      setFeedback($i18n("settings.llmProviders.oauth.unavailable"), "error");
      return;
    }
    busy = true;
    editorError = "";
    const wasCreate = payload.mode === "create";
    try {
      if (import.meta.env.DEV) {
        console.info(
          "[agodesk:provider.upsert] request " +
            JSON.stringify({
              mode: payload.mode,
              startOauthAfterSave: options.startOauthAfterSave ?? false,
              id: payload.provider?.id,
              type: payload.provider?.type,
              auth_type: payload.provider?.auth_type,
              oauth_provider: payload.provider?.oauth_provider,
              has_oauth_auth_url: Boolean(payload.provider?.oauth_auth_url),
              has_oauth_token_url: Boolean(payload.provider?.oauth_token_url),
              has_oauth_client_id: Boolean(payload.provider?.oauth_client_id),
            }),
        );
      }
      const saved = await upsertConfigProvider(wsSend, {
        ...payload,
        session_id: sessionId,
      });
      if (import.meta.env.DEV) {
        console.info(
          "[agodesk:provider.upsert] saved " +
            JSON.stringify({
              id: saved.id,
              type: saved.type,
              auth_type: saved.auth_type,
              oauth_provider: saved.oauth_provider,
              oauth_configured: saved.oauth?.configured,
              oauth_missing_fields: saved.oauth?.missing_fields,
            }),
        );
      }
      editingProvider = saved;
      editorMode = "edit";
      setFeedback($i18n("settings.llmProviders.feedback.saved"), "success");
      showActionToast($i18n("settings.llmProviders.feedback.saved"), "success", saved.name);
      await refreshList();
      if (options.startOauthAfterSave) {
        if (!canOauth) {
          editorError = $i18n("settings.llmProviders.oauth.unavailable");
          setFeedback($i18n("settings.llmProviders.oauth.unavailable"), "error");
        } else if (!providerSupportsOauth(saved)) {
          editorError = $i18n("settings.llmProviders.oauth.notSupported");
          setFeedback($i18n("settings.llmProviders.oauth.notSupported"), "error");
        } else {
          const launched = await handleStartOauth(saved.id);
          if (!launched && wasCreate) {
            // OAuth start failed before the browser opened on a freshly created
            // provider. Roll back the create so the user can retry without having
            // to manually delete an unusable provider first.
            const failureMessage = oauthError;
            await cleanupOauth();
            try {
              await deleteConfigProvider(wsSend, sessionId, saved.id, { force: true });
              editingProvider = null;
              editorMode = "create";
              await refreshList();
            } catch {
              // keep the provider if rollback fails; user can still delete manually
            }
            editorError = failureMessage || $i18n("settings.llmProviders.oauth.notSupported");
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      editorError = message;
      setFeedback(message, "error");
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
    const hasReferences = (provider.references?.length ?? 0) > 0;
    if (
      hasReferences &&
      !confirm($i18n("settings.llmProviders.confirmForceDelete", { name: provider.name }))
    ) {
      return;
    }
    busy = true;
    try {
      await deleteConfigProvider(wsSend, sessionId, provider.id, { force: hasReferences });
      if (editingProvider?.id === provider.id) {
        editorOpen = false;
        editingProvider = null;
      }
      setFeedback($i18n("settings.llmProviders.feedback.deleted"), "success", provider.id);
      showActionToast($i18n("settings.llmProviders.feedback.deleted"), "success", provider.name);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error), "error");
    } finally {
      busy = false;
    }
  }

  async function handleTest(provider: ConfigProvider): Promise<void> {
    if (!wsSend || !sessionId || !canWrite) {
      return;
    }
    busy = true;
    try {
      const result = await testConfigProvider(wsSend, sessionId, provider.id);
      if (result.ok) {
        const message = result.message || $i18n("settings.llmProviders.feedback.testOk");
        setFeedback(message, "success", provider.id);
        showActionToast(message, "success", provider.name);
      } else {
        const message = result.message || $i18n("settings.llmProviders.feedback.testFailed");
        setFeedback(message, "error", provider.id);
        showActionToast(message, "error", provider.name);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(message, "error", provider.id);
      showActionToast(message, "error", provider.name);
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

  async function handleStartOauth(providerId: string): Promise<boolean> {
    if (!wsSend || !sessionId || !canOauth) {
      return false;
    }

    let provider =
      editingProvider?.id === providerId
        ? editingProvider
        : $providersState.providers.find((entry) => entry.id === providerId);
    if (!providerSupportsOauth(provider)) {
      oauthProviderId = providerId;
      oauthProviderName = provider?.name ?? providerId;
      oauthError = $i18n("settings.llmProviders.oauth.notSupported");
      oauthOpen = true;
      oauthBusy = false;
      return false;
    }
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

      const catalogEntry =
        findCatalogEntryForProvider(get(providersState).catalog, provider) ??
        (selectedCatalogEntry?.id === providerId || selectedCatalogEntry?.id === provider?.type
          ? selectedCatalogEntry
          : null);
      const oauthSetup = catalogEntry?.oauth_setup ?? selectedCatalogEntry?.oauth_setup;

      if (import.meta.env.DEV) {
        console.info(
          "[agodesk:oauth.start] pre-flight " +
            JSON.stringify({
              provider_id: providerId,
              provider_type: provider?.type,
              provider_auth_type: provider?.auth_type,
              provider_oauth_provider: provider?.oauth_provider,
              catalog_oauth_provider: catalogEntry?.oauth_provider,
              catalog_has_oauth_setup: Boolean(oauthSetup),
              catalog_auth_url: oauthSetup?.auth_url,
              catalog_token_url: oauthSetup?.token_url,
            }),
        );
      }

      // AuraGo rejects oauth.start when the stored provider's auth_type isn't "oauth"
      // ("OAuth2 configuration incomplete: auth_type"). For dual-auth providers that
      // were saved with auth_type=api_key, flip to oauth before starting the flow so
      // the user does not have to re-open the editor just to switch the auth type.
      if (provider && provider.auth_type && provider.auth_type !== "oauth") {
        const flipped = await upsertConfigProvider(wsSend, {
          session_id: sessionId,
          mode: "update",
          provider: {
            id: provider.id,
            name: provider.name,
            type: provider.type,
            ...(provider.base_url ? { base_url: provider.base_url } : {}),
            ...(provider.model ? { model: provider.model } : {}),
            ...(provider.account_id ? { account_id: provider.account_id } : {}),
            auth_type: "oauth",
            oauth_provider: provider.oauth_provider || catalogEntry?.oauth_provider || undefined,
            oauth_auth_url: provider.oauth_auth_url || oauthSetup?.auth_url || undefined,
            oauth_token_url: provider.oauth_token_url || oauthSetup?.token_url || undefined,
            oauth_client_id: provider.oauth_client_id || undefined,
            oauth_scopes: provider.oauth_scopes || undefined,
          },
          secrets: {
            api_key: { op: "clear" },
            oauth_client_secret: { op: "keep" },
          },
        });
        editingProvider = flipped;
        provider = flipped;
      }

      const callbackPath = oauthSetup?.callback_path ?? "/oauth/callback";
      const callbackPort = oauthSetup?.callback_port;
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
      return true;
    } catch (error) {
      oauthError = error instanceof Error ? error.message : String(error);
      if (import.meta.env.DEV) {
        console.error(
          "[agodesk:oauth.start] failed " +
            JSON.stringify({
              provider_id: providerId,
              provider_auth_type: provider?.auth_type,
              error: oauthError,
            }),
        );
      }
      oauthBusy = false;
      return false;
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
  function oauthChipLabels() {
    return {
      authorized: $i18n("settings.llmProviders.oauth.authorized"),
      notAuthorized: $i18n("settings.llmProviders.oauth.notAuthorized"),
      configured: $i18n("settings.llmProviders.oauth.configured"),
      notConfigured: $i18n("settings.llmProviders.oauth.notConfigured"),
      expired: $i18n("settings.llmProviders.oauth.expired"),
      hasRefresh: $i18n("settings.llmProviders.oauth.hasRefresh"),
    };
  }
</script>

<section class="llm-providers">
  <div class="llm-providers-header ui-card">
    <div class="card-header">
      <h2>{$i18n("settings.llmProviders.title")}</h2>
      <p>{$i18n("settings.llmProviders.description")}</p>
    </div>

    {#if !canRead}
      <p class="readonly-note">{$i18n("settings.llmProviders.readNotSupported")}</p>
    {:else}
      <div class="toolbar">
        <button
          type="button"
          class="ui-btn ui-btn-secondary"
          disabled={busy}
          onclick={() => void refreshList()}
        >
          {$i18n("settings.llmProviders.refresh")}
        </button>
        {#if canWrite}
          <button
            type="button"
            class="ui-btn ui-btn-primary"
            disabled={busy}
            onclick={() => void openCatalog()}
          >
            {$i18n("settings.llmProviders.addFromCatalog")}
          </button>
        {/if}
      </div>

      {#if $providersState.loading && $providersState.providers.length === 0}
        <p>{$i18n("settings.llmProviders.loading")}</p>
      {:else if $providersState.error}
        <p class="feedback error" role="alert">{$providersState.error}</p>
      {/if}

      {#if $providersState.providers.length === 0 && !$providersState.loading}
        <p class="empty">{$i18n("settings.llmProviders.empty")}</p>
        {#if sectionFeedback}
          <p class="feedback" data-tone={sectionFeedbackTone} role="status">{sectionFeedback}</p>
        {/if}
      {/if}
    {/if}
  </div>

  {#if canRead && $providersState.providers.length > 0}
    <div class="provider-list-panel">
      {#if $providersState.loading}
        <p class="list-refresh-note">{$i18n("settings.llmProviders.loading")}</p>
      {/if}
      <ul class="provider-list">
        {#each $providersState.providers as provider, index (`${provider.id}:${index}`)}
          {@const expanded = isProviderExpanded(provider.id)}
          {@const missingFields = providerEffectiveMissingFields(provider)}
          {@const hasWarnings = providerListHasWarnings(provider)}
          {@const cardFeedback = providerFeedback[provider.id]}
          <li class="provider-card" class:expanded>
            <button
              type="button"
              class="provider-toggle"
              aria-expanded={expanded}
              onclick={() => toggleProviderExpanded(provider.id)}
            >
              <span class="provider-chevron" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
              <span class="provider-toggle-main">
                <span class="provider-toggle-name">{provider.name || provider.id}</span>
                <span class="provider-toggle-meta">
                  <span class="ui-chip compact" data-tone="idle">{provider.type}</span>
                  {#if provider.model}
                    <span class="provider-model-preview" title={provider.model}
                      >{provider.model}</span
                    >
                  {/if}
                  {#if provider.auth_type}
                    <span class="ui-chip compact" data-tone="connected">{provider.auth_type}</span>
                  {/if}
                </span>
              </span>
              {#if hasWarnings}
                <span class="ui-chip compact" data-tone="warning">
                  {$i18n("settings.llmProviders.needsAttention")}
                </span>
              {/if}
            </button>

            {#if expanded}
              <div class="provider-details">
                <div class="provider-summary">
                  {#if provider.base_url}
                    <p class="provider-detail-line">
                      <span class="detail-label"
                        >{$i18n("settings.llmProviders.fields.baseUrl")}</span
                      >
                      <span class="detail-value">{provider.base_url}</span>
                    </p>
                  {/if}
                  {#if provider.model}
                    <p class="provider-detail-line">
                      <span class="detail-label">{$i18n("settings.llmProviders.fields.model")}</span
                      >
                      <span class="detail-value">{provider.model}</span>
                    </p>
                  {/if}
                  <p class="provider-meta">
                    {#each providerOauthStatusChips(provider, oauthChipLabels()) as chip (chip.label)}
                      <span class="ui-chip compact" data-tone={chip.tone}>{chip.label}</span>
                    {/each}
                    {#each providerCapabilityChips(provider) as cap (cap)}
                      <span class="ui-chip compact" data-tone="idle">{cap}</span>
                    {/each}
                  </p>
                  {#if provider.references && provider.references.length > 0}
                    <p class="provider-refs">
                      <span class="refs-label">{$i18n("settings.llmProviders.references")}:</span>
                      {#each provider.references as ref (ref.path + ref.role)}
                        <span class="ui-chip compact" data-tone="warning">
                          {providerReferenceRoleLabel(ref.role)}
                        </span>
                      {/each}
                    </p>
                  {/if}
                  {#if missingFields.length > 0}
                    <p class="provider-missing">
                      <span class="refs-label">{$i18n("settings.llmProviders.missingFields")}:</span
                      >
                      {#each missingFields as field (field)}
                        <span class="ui-chip compact" data-tone="error">{field}</span>
                      {/each}
                    </p>
                  {/if}
                </div>
                <div class="provider-actions">
                  {#if canWrite}
                    <button
                      type="button"
                      class="ui-btn ui-btn-secondary compact"
                      disabled={busy || $providersState.testLoadingProviderId === provider.id}
                      onclick={() => void handleTest(provider)}
                    >
                      {$i18n("settings.llmProviders.test")}
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="ui-btn ui-btn-secondary compact"
                    disabled={busy}
                    onclick={() => void openEditEditor(provider)}
                  >
                    {$i18n("settings.llmProviders.edit")}
                  </button>
                  {#if canWrite}
                    <button
                      type="button"
                      class="ui-btn ui-btn-secondary ui-btn-danger compact"
                      disabled={busy}
                      onclick={() => void handleDelete(provider)}
                    >
                      {$i18n("settings.llmProviders.delete")}
                    </button>
                  {/if}
                </div>
                {#if cardFeedback}
                  <p
                    class="provider-feedback"
                    data-tone={cardFeedback.tone}
                    role={cardFeedback.tone === "error" ? "alert" : "status"}
                  >
                    {cardFeedback.message}
                  </p>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      {#if sectionFeedback}
        <div class="list-feedback" data-tone={sectionFeedbackTone} role="status">
          {sectionFeedback}
        </div>
      {/if}
    </div>
  {/if}
</section>

<ProviderEditorPanel
  open={editorOpen}
  mode={editorMode}
  provider={editingProvider}
  catalogEntry={selectedCatalogEntry}
  catalogModels={$providersState.catalogModels}
  {canWrite}
  {canOauth}
  {busy}
  loadingDetail={editorLoadingDetail}
  errorMessage={editorError}
  onClose={() => {
    editorOpen = false;
    editingProvider = null;
    selectedCatalogEntry = null;
    editorLoadingDetail = false;
  }}
  onSave={(payload) => void handleSave(payload)}
  onSaveAndStartOauth={(payload) => void handleSave(payload, { startOauthAfterSave: true })}
  onStartOauth={(providerId) => void handleStartOauth(providerId)}
  onRevokeOauth={(providerId) => void handleRevokeOauth(providerId)}
/>

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
  .llm-providers {
    display: grid;
    gap: 0.75rem;
  }

  .llm-providers-header.ui-card {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: var(--color-bg-elevated);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0;
  }

  .provider-list-panel {
    max-height: min(60vh, 640px);
    overflow-y: auto;
    padding: 0.15rem 0.15rem 0.15rem 0;
  }

  .list-refresh-note {
    margin: 0 0 0.5rem;
    font-size: 0.82rem;
    color: var(--color-muted);
  }

  .provider-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }

  .provider-card {
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    background: var(--color-bg-elevated);
    box-shadow: var(--shadow-1);
    isolation: isolate;
    contain: layout paint;
  }

  .provider-card.expanded {
    padding-bottom: 0.35rem;
    border-color: color-mix(in srgb, var(--color-accent) 22%, var(--color-border-subtle));
  }

  .provider-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 0.75rem;
    border: none;
    background: transparent;
    /* Explicit fill — WebView2 otherwise paints ButtonText (often black). */
    color: var(--color-text);
    -webkit-text-fill-color: var(--color-text);
    text-align: left;
    cursor: pointer;
  }

  .provider-toggle:hover {
    background: color-mix(in srgb, var(--color-text) 4%, transparent);
  }

  .provider-chevron {
    flex-shrink: 0;
    width: 0.85rem;
    opacity: 0.85;
    font-size: 0.75rem;
    color: var(--color-muted);
    -webkit-text-fill-color: var(--color-muted);
  }

  .provider-toggle-main {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 0.15rem;
  }

  .provider-toggle-name {
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--color-text);
    -webkit-text-fill-color: var(--color-text);
  }

  .provider-toggle-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
    font-size: 0.78rem;
    color: var(--color-muted);
  }

  .provider-toggle-meta :global(.ui-chip) {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .provider-model-preview {
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .provider-details {
    padding: 0 0.75rem 0.35rem 1.85rem;
    display: grid;
    gap: 0.65rem;
  }

  .provider-detail-line {
    margin: 0;
    display: grid;
    gap: 0.1rem;
    font-size: 0.8rem;
  }

  .detail-label {
    opacity: 0.65;
    font-size: 0.72rem;
  }

  .detail-value {
    word-break: break-all;
  }

  .provider-summary {
    min-width: 0;
  }

  .provider-meta {
    margin: 0.35rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
    opacity: 0.85;
    font-size: 0.82rem;
  }

  .provider-refs,
  .provider-missing {
    margin: 0.35rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
    font-size: 0.78rem;
    opacity: 0.9;
  }

  .refs-label {
    opacity: 0.75;
  }

  .provider-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .provider-actions :global(.ui-btn.compact) {
    padding: 0.35rem 0.65rem;
    font-size: 0.78rem;
  }

  .provider-feedback {
    margin: 0;
    padding: 0.45rem 0.6rem;
    border-radius: 0.55rem;
    font-size: 0.82rem;
    line-height: 1.4;
    background: color-mix(in srgb, var(--text) 6%, transparent);
  }

  .provider-feedback[data-tone="success"] {
    color: var(--success, #4ade80);
    border: 1px solid color-mix(in srgb, var(--success, #4ade80) 35%, transparent);
  }

  .provider-feedback[data-tone="error"] {
    color: var(--danger, #f87171);
    border: 1px solid color-mix(in srgb, var(--danger, #f87171) 35%, transparent);
  }

  .list-feedback {
    flex-shrink: 0;
    margin-top: 0.45rem;
    padding: 0.55rem 0.75rem;
    border-radius: 0.65rem;
    font-size: 0.84rem;
    line-height: 1.4;
    background: color-mix(in srgb, var(--text) 6%, transparent);
    border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
  }

  .list-feedback[data-tone="success"] {
    color: var(--success, #4ade80);
  }

  .list-feedback[data-tone="error"] {
    color: var(--danger, #f87171);
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
</style>
