<script lang="ts">
  import { focusTrap } from "../actions/focusTrap";
  import { dialogModal } from "../actions/dialogModal";
  import { i18n } from "../i18n";
  import type {
    ConfigProvider,
    ConfigProviderCatalogEntry,
    ConfigProviderCatalogModel,
    ConfigProviderUpsertPayload,
  } from "../types/protocol";
  import { buildDefaultProviderSecretsForUpsert } from "../types/protocol";
  import {
    catalogEntrySupportsApiKey,
    catalogEntryUsesOauth,
    catalogModelOptions,
    filterCatalogModelsForProvider,
    providerEffectiveMissingFields,
    providerSupportsOauth,
    resolveCatalogAuthType,
    resolveCatalogBaseUrl,
  } from "../services/provider-display";

  export type ProviderEditorMode = "create" | "edit";

  interface Props {
    open?: boolean;
    mode?: ProviderEditorMode;
    provider?: ConfigProvider | null;
    catalogEntry?: ConfigProviderCatalogEntry | null;
    catalogModels?: ConfigProviderCatalogModel[];
    canWrite?: boolean;
    canOauth?: boolean;
    busy?: boolean;
    loadingDetail?: boolean;
    errorMessage?: string;
    onClose?: () => void;
    onSave?: (payload: ConfigProviderUpsertPayload) => void;
    onSaveAndStartOauth?: (payload: ConfigProviderUpsertPayload) => void;
    onStartOauth?: (providerId: string) => void;
    onRevokeOauth?: (providerId: string) => void;
  }

  let {
    open = false,
    mode = "create",
    provider = null,
    catalogEntry = null,
    catalogModels = [],
    canWrite = false,
    canOauth = false,
    busy = false,
    loadingDetail = false,
    errorMessage = "",
    onClose,
    onSave,
    onSaveAndStartOauth,
    onStartOauth,
    onRevokeOauth,
  }: Props = $props();

  let modalEl = $state<HTMLDialogElement | null>(null);
  let saveBtn = $state<HTMLButtonElement | null>(null);

  let draftId = $state("");
  let draftName = $state("");
  let draftType = $state("");
  let draftBaseUrl = $state("");
  let draftModel = $state("");
  let draftAccountId = $state("");
  let draftAuthType = $state<"api_key" | "oauth">("api_key");
  let draftOauthAuthUrl = $state("");
  let draftOauthTokenUrl = $state("");
  let draftOauthClientId = $state("");
  let draftOauthScopes = $state("");
  let apiKeyInput = $state("");
  let oauthClientSecretInput = $state("");
  let clearApiKey = $state(false);
  let clearOauthSecret = $state(false);
  let localSubmitError = $state("");

  const canSubmit = $derived(
    Boolean(canWrite && draftId.trim() && draftName.trim() && draftType.trim()),
  );

  const displayTypeLabel = $derived(
    provider?.type ?? catalogEntry?.aura_provider_type ?? catalogEntry?.id ?? draftType,
  );

  const displayAuthLabel = $derived(
    draftAuthType === "oauth"
      ? $i18n("settings.llmProviders.auth.oauth")
      : $i18n("settings.llmProviders.auth.apiKey"),
  );

  const modelOptions = $derived(
    catalogModelOptions(filterCatalogModelsForProvider(catalogModels, catalogEntry)),
  );

  const catalogBaseUrlLocked = $derived(
    mode === "create" && Boolean(catalogEntry?.base_url?.trim()),
  );

  const supportsApiKeyAuth = $derived(
    provider?.auth_type === "api_key" ||
      catalogEntrySupportsApiKey(catalogEntry) ||
      (!catalogEntry && !provider),
  );

  const supportsOauthAuth = $derived(
    provider?.auth_type === "oauth" ||
      providerSupportsOauth(provider) ||
      catalogEntryUsesOauth(catalogEntry),
  );

  const showAuthTypeSelector = $derived(canWrite && supportsApiKeyAuth && supportsOauthAuth);

  const usesOauthFlow = $derived(draftAuthType === "oauth" && supportsOauthAuth);

  const canStartOauthNow = $derived(Boolean(provider?.id) && canOauth && usesOauthFlow);

  const catalogOauthPrefilled = $derived(
    mode === "create" &&
      Boolean(
        catalogEntry?.oauth_setup?.auth_url ||
        catalogEntry?.oauth_setup?.token_url ||
        catalogEntry?.oauth_provider,
      ),
  );

  const missingFieldWarnings = $derived.by(() => {
    if (provider) {
      return providerEffectiveMissingFields(provider);
    }
    if (mode === "create" && catalogEntry?.missing_credentials?.length) {
      return catalogEntry.missing_credentials;
    }
    return [];
  });

  $effect(() => {
    if (!open) {
      return;
    }
    const oauthSetup = catalogEntry?.oauth_setup;
    draftId = provider?.id ?? catalogEntry?.id ?? crypto.randomUUID();
    draftName = provider?.name ?? catalogEntry?.name ?? "";
    draftType = provider?.type ?? catalogEntry?.aura_provider_type ?? catalogEntry?.id ?? "";
    draftBaseUrl = provider?.base_url ?? resolveCatalogBaseUrl(catalogEntry);
    draftModel = provider?.model ?? catalogEntry?.default_model ?? "";
    draftAccountId = provider?.account_id ?? "";
    draftAuthType = (
      provider?.auth_type === "oauth" || provider?.auth_type === "api_key"
        ? provider.auth_type
        : resolveCatalogAuthType(catalogEntry)
    ) as "api_key" | "oauth";
    draftOauthAuthUrl = provider?.oauth_auth_url ?? oauthSetup?.auth_url ?? "";
    draftOauthTokenUrl = provider?.oauth_token_url ?? oauthSetup?.token_url ?? "";
    draftOauthClientId = provider?.oauth_client_id ?? "";
    draftOauthScopes =
      provider?.oauth_scopes ?? (oauthSetup?.scopes ? oauthSetup.scopes.join(" ") : "");
    apiKeyInput = "";
    oauthClientSecretInput = "";
    clearApiKey = false;
    clearOauthSecret = false;
  });

  $effect(() => {
    if (open && modalEl) {
      setTimeout(() => {
        (saveBtn || modalEl)?.focus();
      }, 10);
    }
  });

  function buildSavePayload(): ConfigProviderUpsertPayload | null {
    if (!canWrite || !draftId.trim() || !draftName.trim() || !draftType.trim()) {
      return null;
    }

    const secrets = buildDefaultProviderSecretsForUpsert(
      apiKeyInput,
      oauthClientSecretInput,
      provider?.secrets,
    );
    if (clearApiKey) {
      secrets.api_key = { op: "clear" };
    }
    if (clearOauthSecret) {
      secrets.oauth_client_secret = { op: "clear" };
    }

    return {
      session_id: "",
      mode: mode === "create" ? "create" : "update",
      provider: {
        id: draftId.trim(),
        name: draftName.trim(),
        type: draftType.trim(),
        ...(draftBaseUrl.trim() ? { base_url: draftBaseUrl.trim() } : {}),
        ...(draftModel.trim() ? { model: draftModel.trim() } : {}),
        ...(draftAccountId.trim() ? { account_id: draftAccountId.trim() } : {}),
        auth_type: draftAuthType,
        ...(draftAuthType === "oauth"
          ? {
              oauth_provider: provider?.oauth_provider || catalogEntry?.oauth_provider || undefined,
              oauth_auth_url: draftOauthAuthUrl.trim() || undefined,
              oauth_token_url: draftOauthTokenUrl.trim() || undefined,
              oauth_client_id: draftOauthClientId.trim() || undefined,
              oauth_scopes: draftOauthScopes.trim() || undefined,
            }
          : {}),
      },
      secrets,
    };
  }

  function handleSave(): void {
    const payload = buildSavePayload();
    if (!payload) {
      localSubmitError = canSubmit
        ? ""
        : $i18n("settings.llmProviders.editor.requiredFieldsMissing");
      return;
    }
    localSubmitError = "";
    onSave?.(payload);
  }

  function handleSaveAndStartOauth(): void {
    const payload = buildSavePayload();
    if (!payload) {
      localSubmitError = canSubmit
        ? ""
        : $i18n("settings.llmProviders.editor.requiredFieldsMissing");
      return;
    }
    localSubmitError = "";
    onSaveAndStartOauth?.(payload);
  }
</script>

{#if open}
  <dialog
    bind:this={modalEl}
    class="editor-modal ui-card glass-panel"
    use:dialogModal={{ open, onClose }}
    use:focusTrap
    aria-modal="true"
    aria-labelledby="provider-editor-title"
    onclick={(event) => event.stopPropagation()}
  >
    <header class="editor-header">
      <div>
        <h2 id="provider-editor-title">
          {mode === "create"
            ? $i18n("settings.llmProviders.editor.createTitle")
            : $i18n("settings.llmProviders.editor.editTitle")}
        </h2>
        {#if catalogEntry && mode === "create"}
          <p class="editor-subtitle">
            {$i18n("settings.llmProviders.editor.fromCatalog", { name: catalogEntry.name })}
          </p>
        {/if}
      </div>
      <button type="button" class="ui-btn ui-btn-secondary ui-btn-sm" onclick={() => onClose?.()}>
        {$i18n("common.close")}
      </button>
    </header>

    {#if loadingDetail}
      <p class="editor-loading">{$i18n("settings.llmProviders.editor.loading")}</p>
    {:else}
      <dl class="meta-row">
        <div class="meta-id">
          <dt>{$i18n("settings.llmProviders.fields.id")}</dt>
          <dd><code class="provider-id">{draftId}</code></dd>
        </div>
        <div>
          <dt>{$i18n("settings.llmProviders.fields.type")}</dt>
          <dd><span class="ui-chip" data-tone="idle">{displayTypeLabel}</span></dd>
        </div>
        <div>
          <dt>{$i18n("settings.llmProviders.fields.authType")}</dt>
          <dd>
            {#if showAuthTypeSelector}
              <select bind:value={draftAuthType} disabled={busy}>
                <option value="api_key">{$i18n("settings.llmProviders.auth.apiKey")}</option>
                <option value="oauth">{$i18n("settings.llmProviders.auth.oauth")}</option>
              </select>
            {:else}
              <span class="ui-chip" data-tone="connected">{displayAuthLabel}</span>
            {/if}
          </dd>
        </div>
      </dl>

      <div class="editor-grid">
        <label class="full">
          <span>{$i18n("settings.llmProviders.fields.name")}</span>
          <input bind:value={draftName} disabled={!canWrite || busy} />
        </label>
        <label class="full">
          <span>{$i18n("settings.llmProviders.fields.baseUrl")}</span>
          <input bind:value={draftBaseUrl} disabled={!canWrite || busy || catalogBaseUrlLocked} />
        </label>
        <label class="full">
          <span>{$i18n("settings.llmProviders.fields.model")}</span>
          {#if modelOptions.length > 0}
            <select bind:value={draftModel} disabled={!canWrite || busy}>
              <option value="">{$i18n("settings.llmProviders.fields.modelSelect")}</option>
              {#each modelOptions as option (option.id)}
                <option value={option.id}>{option.label}</option>
              {/each}
            </select>
          {:else}
            <input bind:value={draftModel} disabled={!canWrite || busy} />
          {/if}
        </label>
        <label class="full">
          <span>{$i18n("settings.llmProviders.fields.accountId")}</span>
          <input bind:value={draftAccountId} disabled={!canWrite || busy} />
        </label>

        {#if missingFieldWarnings.length > 0}
          <div class="missing-fields full">
            <span class="missing-label">{$i18n("settings.llmProviders.missingFields")}:</span>
            {#each missingFieldWarnings as field (field)}
              <span class="ui-chip compact" data-tone="error">{field}</span>
            {/each}
          </div>
        {/if}

        {#if draftAuthType === "api_key"}
          <label class="full">
            <span>{$i18n("settings.llmProviders.fields.apiKey")}</span>
            <input
              type="password"
              bind:value={apiKeyInput}
              autocomplete="off"
              placeholder={provider?.secrets?.api_key?.present
                ? $i18n("settings.llmProviders.fields.apiKeyStored")
                : $i18n("settings.llmProviders.fields.apiKeyPlaceholder")}
              disabled={!canWrite || busy}
            />
          </label>
          {#if provider?.secrets?.api_key?.present}
            <label class="checkbox full">
              <input type="checkbox" bind:checked={clearApiKey} disabled={!canWrite || busy} />
              <span>{$i18n("settings.llmProviders.fields.clearApiKey")}</span>
            </label>
          {/if}
        {:else}
          {#if mode === "create"}
            <p class="oauth-intro full">{$i18n("settings.llmProviders.oauth.createHint")}</p>
          {/if}
          {#if !canOauth}
            <p class="oauth-unavailable full">{$i18n("settings.llmProviders.oauth.unavailable")}</p>
          {/if}
          <label class="full">
            <span>{$i18n("settings.llmProviders.fields.oauthAuthUrl")}</span>
            <input
              bind:value={draftOauthAuthUrl}
              disabled={!canWrite || busy || catalogOauthPrefilled}
            />
          </label>
          <label class="full">
            <span>{$i18n("settings.llmProviders.fields.oauthTokenUrl")}</span>
            <input
              bind:value={draftOauthTokenUrl}
              disabled={!canWrite || busy || catalogOauthPrefilled}
            />
          </label>
          <label>
            <span>{$i18n("settings.llmProviders.fields.oauthClientId")}</span>
            <input bind:value={draftOauthClientId} disabled={!canWrite || busy} />
          </label>
          <label>
            <span>{$i18n("settings.llmProviders.fields.oauthScopes")}</span>
            <input
              bind:value={draftOauthScopes}
              disabled={!canWrite || busy || catalogOauthPrefilled}
            />
          </label>
          <label class="full">
            <span>{$i18n("settings.llmProviders.fields.oauthClientSecret")}</span>
            <input
              type="password"
              bind:value={oauthClientSecretInput}
              autocomplete="off"
              placeholder={provider?.secrets?.oauth_client_secret?.present
                ? $i18n("settings.llmProviders.fields.oauthClientSecretStored")
                : $i18n("settings.llmProviders.fields.oauthClientSecretPlaceholder")}
              disabled={!canWrite || busy}
            />
          </label>
          {#if provider?.secrets?.oauth_client_secret?.present}
            <label class="checkbox full">
              <input type="checkbox" bind:checked={clearOauthSecret} disabled={!canWrite || busy} />
              <span>{$i18n("settings.llmProviders.fields.clearOauthSecret")}</span>
            </label>
          {/if}

          {#if canStartOauthNow}
            <div class="oauth-actions full">
              {#if provider?.oauth?.authorized}
                <span class="ui-chip" data-tone="accepted">
                  {$i18n("settings.llmProviders.oauth.authorized")}
                </span>
                <button
                  type="button"
                  class="ui-btn ui-btn-secondary"
                  disabled={busy}
                  onclick={() => onRevokeOauth?.(provider!.id)}
                >
                  {$i18n("settings.llmProviders.oauth.revoke")}
                </button>
              {:else}
                <button
                  type="button"
                  class="ui-btn ui-btn-primary"
                  disabled={busy}
                  onclick={() => onStartOauth?.(provider!.id)}
                >
                  {$i18n("settings.llmProviders.oauth.start")}
                </button>
              {/if}
            </div>
          {/if}
        {/if}
      </div>

      <div class="editor-footer">
        {#if errorMessage}
          <p class="editor-error full" role="alert">{errorMessage}</p>
        {/if}
        {#if localSubmitError}
          <p class="editor-local-error" role="alert">{localSubmitError}</p>
        {/if}
        <button type="button" class="ui-btn ghost" onclick={() => onClose?.()} disabled={busy}>
          {$i18n("certModal.cancel")}
        </button>
        {#if canWrite}
          {#if usesOauthFlow && onSaveAndStartOauth}
            <button
              type="button"
              class="ui-btn ui-btn-secondary"
              onclick={handleSave}
              disabled={busy || loadingDetail}
            >
              {$i18n("settings.llmProviders.editor.save")}
            </button>
            {#if canOauth}
              <button
                bind:this={saveBtn}
                type="button"
                class="ui-btn ui-btn-primary"
                onclick={handleSaveAndStartOauth}
                disabled={busy || loadingDetail}
              >
                {$i18n("settings.llmProviders.editor.saveAndAuthorize")}
              </button>
            {:else}
              <span class="oauth-footer-hint">
                {$i18n("settings.llmProviders.oauth.unavailable")}
              </span>
            {/if}
          {:else}
            <button
              bind:this={saveBtn}
              type="button"
              class="ui-btn ui-btn-primary"
              onclick={handleSave}
              disabled={busy || loadingDetail}
            >
              {$i18n("settings.llmProviders.editor.save")}
            </button>
          {/if}
        {/if}
      </div>
    {/if}
  </dialog>
{/if}

<style>
  .editor-modal {
    width: min(640px, calc(100vw - 2rem));
    max-height: min(88vh, 900px);
    padding: 1.25rem;
    overflow-x: hidden;
  }

  .editor-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .editor-header h2 {
    margin: 0;
    font-size: 1.15rem;
  }

  .editor-subtitle {
    margin: 0.25rem 0 0;
    opacity: 0.75;
    font-size: 0.9rem;
  }

  .editor-loading {
    margin: 1rem 0;
    opacity: 0.85;
  }

  .meta-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    margin: 0 0 1rem;
  }

  .meta-row dt {
    font-size: 0.8rem;
    opacity: 0.7;
    margin-bottom: 0.25rem;
  }

  .meta-row dd {
    margin: 0;
  }

  .meta-id {
    grid-column: 1 / -1;
  }

  .provider-id {
    display: inline-block;
    max-width: 100%;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.82rem;
    word-break: break-all;
    user-select: all;
    opacity: 0.9;
  }

  .meta-row select {
    width: 100%;
    min-width: 0;
  }

  .editor-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .editor-grid label {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  .editor-grid label.full {
    grid-column: 1 / -1;
  }

  .editor-grid input,
  .editor-grid select {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .editor-grid select {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .editor-grid label.checkbox {
    grid-template-columns: auto 1fr;
    align-items: center;
  }

  .oauth-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .missing-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
  }

  .missing-label {
    font-size: 0.82rem;
    opacity: 0.75;
  }

  .oauth-intro,
  .oauth-unavailable {
    margin: 0;
    font-size: 0.84rem;
    line-height: 1.45;
    color: var(--color-muted);
  }

  .oauth-unavailable {
    color: var(--color-warning);
  }

  .editor-footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  }

  .oauth-footer-hint {
    align-self: center;
    font-size: 0.84rem;
    line-height: 1.4;
    color: var(--color-warning);
    max-width: 60%;
  }

  .editor-local-error {
    margin-right: auto;
    align-self: center;
    font-size: 0.84rem;
    line-height: 1.4;
    color: var(--color-error, #d33);
    max-width: 55%;
  }

  .editor-error {
    margin: 0 0 0.5rem;
    padding: 0.6rem 0.85rem;
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--color-error, #d33) 12%, transparent);
    color: var(--color-error, #d33);
    font-size: 0.88rem;
    line-height: 1.4;
    border: 1px solid color-mix(in srgb, var(--color-error, #d33) 25%, transparent);
  }

  .editor-error.full {
    flex: 0 0 100%;
  }

  @media (max-width: 720px) {
    .editor-grid,
    .meta-row {
      grid-template-columns: 1fr;
    }
  }
</style>
