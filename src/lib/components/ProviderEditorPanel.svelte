<script lang="ts">
  import { focusTrap } from "../actions/focusTrap";
  import { i18n } from "../i18n";
  import type {
    ConfigProvider,
    ConfigProviderCatalogEntry,
    ConfigProviderUpsertPayload,
  } from "../types/protocol";
  import { buildDefaultProviderSecretsForUpsert } from "../types/protocol";

  export type ProviderEditorMode = "create" | "edit";

  interface Props {
    open?: boolean;
    mode?: ProviderEditorMode;
    provider?: ConfigProvider | null;
    catalogEntry?: ConfigProviderCatalogEntry | null;
    canWrite?: boolean;
    canOauth?: boolean;
    busy?: boolean;
    loadingDetail?: boolean;
    onClose?: () => void;
    onSave?: (payload: ConfigProviderUpsertPayload) => void;
    onStartOauth?: (providerId: string) => void;
    onRevokeOauth?: (providerId: string) => void;
  }

  let {
    open = false,
    mode = "create",
    provider = null,
    catalogEntry = null,
    canWrite = false,
    canOauth = false,
    busy = false,
    loadingDetail = false,
    onClose,
    onSave,
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

  const displayTypeLabel = $derived(
    provider?.type ?? catalogEntry?.aura_provider_type ?? catalogEntry?.id ?? draftType,
  );

  const displayAuthLabel = $derived(
    draftAuthType === "oauth"
      ? $i18n("settings.llmProviders.auth.oauth")
      : $i18n("settings.llmProviders.auth.apiKey"),
  );

  $effect(() => {
    if (!open) {
      return;
    }
    const oauthSetup = catalogEntry?.oauth_setup;
    draftId = provider?.id ?? catalogEntry?.id ?? crypto.randomUUID();
    draftName = provider?.name ?? catalogEntry?.name ?? "";
    draftType = provider?.type ?? catalogEntry?.aura_provider_type ?? catalogEntry?.id ?? "";
    draftBaseUrl = provider?.base_url ?? "";
    draftModel = provider?.model ?? catalogEntry?.default_model ?? "";
    draftAccountId = provider?.account_id ?? "";
    draftAuthType =
      provider?.auth_type === "oauth" || catalogEntry?.oauth_setup
        ? "oauth"
        : provider?.auth_type === "api_key"
          ? "api_key"
          : catalogEntry?.oauth_provider
            ? "oauth"
            : "api_key";
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

  function handleSave(): void {
    if (!canWrite || !draftId.trim() || !draftName.trim() || !draftType.trim()) {
      return;
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

    const payload: ConfigProviderUpsertPayload = {
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
              oauth_auth_url: draftOauthAuthUrl.trim() || undefined,
              oauth_token_url: draftOauthTokenUrl.trim() || undefined,
              oauth_client_id: draftOauthClientId.trim() || undefined,
              oauth_scopes: draftOauthScopes.trim() || undefined,
            }
          : {}),
      },
      secrets,
    };
    onSave?.(payload);
  }
</script>

{#if open}
  <div class="editor-backdrop" role="presentation" onclick={() => onClose?.()}></div>
  <dialog
    bind:this={modalEl}
    class="editor-modal ui-card glass-panel"
    open
    aria-modal="true"
    aria-labelledby="provider-editor-title"
    use:focusTrap
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
      <button type="button" class="ui-btn ghost compact" onclick={() => onClose?.()}>
        {$i18n("common.close")}
      </button>
    </header>

    {#if loadingDetail}
      <p class="editor-loading">{$i18n("settings.llmProviders.editor.loading")}</p>
    {:else}
      <dl class="meta-row">
        <div>
          <dt>{$i18n("settings.llmProviders.fields.type")}</dt>
          <dd><span class="ui-chip" data-tone="idle">{displayTypeLabel}</span></dd>
        </div>
        <div>
          <dt>{$i18n("settings.llmProviders.fields.authType")}</dt>
          <dd><span class="ui-chip" data-tone="connected">{displayAuthLabel}</span></dd>
        </div>
      </dl>

      <div class="editor-grid">
        <label class="full">
          <span>{$i18n("settings.llmProviders.fields.name")}</span>
          <input bind:value={draftName} disabled={!canWrite || busy} />
        </label>
        <label>
          <span>{$i18n("settings.llmProviders.fields.baseUrl")}</span>
          <input bind:value={draftBaseUrl} disabled={!canWrite || busy} />
        </label>
        <label>
          <span>{$i18n("settings.llmProviders.fields.model")}</span>
          <input bind:value={draftModel} disabled={!canWrite || busy} />
        </label>
        <label class="full">
          <span>{$i18n("settings.llmProviders.fields.accountId")}</span>
          <input bind:value={draftAccountId} disabled={!canWrite || busy} />
        </label>

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
          <label>
            <span>{$i18n("settings.llmProviders.fields.oauthAuthUrl")}</span>
            <input bind:value={draftOauthAuthUrl} disabled={!canWrite || busy} />
          </label>
          <label>
            <span>{$i18n("settings.llmProviders.fields.oauthTokenUrl")}</span>
            <input bind:value={draftOauthTokenUrl} disabled={!canWrite || busy} />
          </label>
          <label>
            <span>{$i18n("settings.llmProviders.fields.oauthClientId")}</span>
            <input bind:value={draftOauthClientId} disabled={!canWrite || busy} />
          </label>
          <label class="full">
            <span>{$i18n("settings.llmProviders.fields.oauthScopes")}</span>
            <input bind:value={draftOauthScopes} disabled={!canWrite || busy} />
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

          {#if provider && canOauth}
            <div class="oauth-actions full">
              {#if provider.oauth?.authorized}
                <span class="ui-chip" data-tone="accepted">
                  {$i18n("settings.llmProviders.oauth.authorized")}
                </span>
                <button
                  type="button"
                  class="ui-btn ghost"
                  disabled={busy}
                  onclick={() => onRevokeOauth?.(provider.id)}
                >
                  {$i18n("settings.llmProviders.oauth.revoke")}
                </button>
              {:else}
                <button
                  type="button"
                  class="ui-btn"
                  disabled={busy}
                  onclick={() => onStartOauth?.(provider.id)}
                >
                  {$i18n("settings.llmProviders.oauth.start")}
                </button>
              {/if}
            </div>
          {/if}
        {/if}
      </div>

      <div class="editor-footer">
        <button type="button" class="ui-btn ghost" onclick={() => onClose?.()} disabled={busy}>
          {$i18n("certModal.cancel")}
        </button>
        {#if canWrite}
          <button
            bind:this={saveBtn}
            type="button"
            class="ui-btn primary"
            onclick={handleSave}
            disabled={busy || loadingDetail}
          >
            {$i18n("settings.llmProviders.editor.save")}
          </button>
        {/if}
      </div>
    {/if}
  </dialog>
{/if}

<style>
  .editor-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1180;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
  }

  .editor-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 1190;
    transform: translate(-50%, -50%);
    width: min(640px, calc(100vw - 2rem));
    max-height: min(88vh, 900px);
    margin: 0;
    border: none;
    padding: 1.25rem;
    overflow: auto;
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

  .editor-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .editor-grid label {
    display: grid;
    gap: 0.35rem;
  }

  .editor-grid label.full {
    grid-column: 1 / -1;
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

  .editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  }

  @media (max-width: 720px) {
    .editor-grid,
    .meta-row {
      grid-template-columns: 1fr;
    }
  }
</style>
