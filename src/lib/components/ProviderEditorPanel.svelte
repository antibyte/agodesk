<script lang="ts">
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
    onClose,
    onSave,
    onStartOauth,
    onRevokeOauth,
  }: Props = $props();

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

  $effect(() => {
    if (!open) {
      return;
    }
    const oauthSetup = catalogEntry?.oauth_setup;
    draftId = provider?.id ?? crypto.randomUUID();
    draftName = provider?.name ?? catalogEntry?.name ?? "";
    draftType = provider?.type ?? catalogEntry?.aura_provider_type ?? catalogEntry?.id ?? "";
    draftBaseUrl = provider?.base_url ?? "";
    draftModel = provider?.model ?? catalogEntry?.default_model ?? "";
    draftAccountId = provider?.account_id ?? "";
    draftAuthType =
      provider?.auth_type === "oauth" || catalogEntry?.oauth_setup
        ? "oauth"
        : ((provider?.auth_type as "api_key" | "oauth") ?? "api_key");
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
  <section class="provider-editor ui-card">
    <header class="editor-header">
      <h3>
        {mode === "create"
          ? $i18n("settings.llmProviders.editor.createTitle")
          : $i18n("settings.llmProviders.editor.editTitle")}
      </h3>
      <button type="button" class="ui-btn ghost compact" onclick={() => onClose?.()}>
        {$i18n("common.close")}
      </button>
    </header>

    <div class="editor-grid">
      <label>
        <span>{$i18n("settings.llmProviders.fields.name")}</span>
        <input bind:value={draftName} disabled={!canWrite || busy} />
      </label>
      <label>
        <span>{$i18n("settings.llmProviders.fields.type")}</span>
        <input bind:value={draftType} disabled={!canWrite || busy || mode === "edit"} />
      </label>
      <label>
        <span>{$i18n("settings.llmProviders.fields.baseUrl")}</span>
        <input bind:value={draftBaseUrl} disabled={!canWrite || busy} />
      </label>
      <label>
        <span>{$i18n("settings.llmProviders.fields.model")}</span>
        <input bind:value={draftModel} disabled={!canWrite || busy} />
      </label>
      <label>
        <span>{$i18n("settings.llmProviders.fields.accountId")}</span>
        <input bind:value={draftAccountId} disabled={!canWrite || busy} />
      </label>
      <label>
        <span>{$i18n("settings.llmProviders.fields.authType")}</span>
        <select bind:value={draftAuthType} disabled={!canWrite || busy}>
          <option value="api_key">{$i18n("settings.llmProviders.auth.apiKey")}</option>
          <option value="oauth">{$i18n("settings.llmProviders.auth.oauth")}</option>
        </select>
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
        <button type="button" class="ui-btn primary" onclick={handleSave} disabled={busy}>
          {$i18n("settings.llmProviders.editor.save")}
        </button>
      {/if}
    </div>
  </section>
{/if}

<style>
  .provider-editor {
    margin-top: 1rem;
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .editor-header h3 {
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
    margin-top: 1rem;
  }

  @media (max-width: 720px) {
    .editor-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
