import type {
  ConfigProvider,
  ConfigProviderCatalogEntry,
  ConfigProviderCatalogModel,
} from "../types/protocol";

const NON_SELECTABLE_CATALOG_AVAILABILITY = new Set(["catalog_only"]);

const KNOWN_PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  xai: "https://api.x.ai/v1",
  cerebras: "https://api.cerebras.ai/v1",
};

export interface ProviderStatusChip {
  tone: "idle" | "connected" | "accepted" | "warning" | "error";
  label: string;
}

const MISSING_FIELD_SATISFIED: Record<string, (provider: ConfigProvider) => boolean> = {
  auth_type: (provider) => Boolean(provider.auth_type),
  api_key: (provider) => Boolean(provider.secrets?.api_key?.present),
  oauth_client_id: (provider) => Boolean(provider.oauth_client_id),
  oauth_client_secret: (provider) => Boolean(provider.secrets?.oauth_client_secret?.present),
  oauth_auth_url: (provider) => Boolean(provider.oauth_auth_url),
  oauth_token_url: (provider) => Boolean(provider.oauth_token_url),
  oauth_scopes: (provider) => Boolean(provider.oauth_scopes),
  base_url: (provider) => Boolean(provider.base_url),
  model: (provider) => Boolean(provider.model),
  account_id: (provider) => Boolean(provider.account_id),
};

export function providerEffectiveMissingFields(provider: ConfigProvider): string[] {
  const raw = provider.oauth?.missing_fields ?? [];
  if (raw.length === 0) {
    return [];
  }
  return raw.filter((field) => {
    const isSatisfied = MISSING_FIELD_SATISFIED[field];
    return isSatisfied ? !isSatisfied(provider) : true;
  });
}

export function providerIsOauthProvider(provider: ConfigProvider): boolean {
  return provider.auth_type === "oauth";
}

export function providerListHasWarnings(provider: ConfigProvider): boolean {
  if (providerEffectiveMissingFields(provider).length > 0) {
    return true;
  }
  if (providerIsOauthProvider(provider)) {
    const oauth = provider.oauth;
    if (oauth?.expired) {
      return true;
    }
    if (oauth && oauth.configured === false) {
      return true;
    }
    if (oauth && oauth.authorized === false) {
      return true;
    }
  }
  return false;
}

export function providerReferenceRoleLabel(role: string): string {
  return role;
}

export function providerOauthStatusChips(
  provider: ConfigProvider,
  labels: {
    authorized: string;
    notAuthorized: string;
    configured: string;
    notConfigured: string;
    expired: string;
    hasRefresh: string;
  },
): ProviderStatusChip[] {
  if (!providerIsOauthProvider(provider)) {
    return [];
  }

  const chips: ProviderStatusChip[] = [];
  const oauth = provider.oauth;

  if (oauth?.configured) {
    chips.push({ tone: "connected", label: labels.configured });
  } else if (oauth && oauth.configured === false) {
    chips.push({ tone: "warning", label: labels.notConfigured });
  }

  if (oauth?.authorized) {
    chips.push({ tone: "accepted", label: labels.authorized });
  } else if (oauth && oauth.authorized === false) {
    chips.push({ tone: "warning", label: labels.notAuthorized });
  }

  if (oauth?.expired) {
    chips.push({ tone: "error", label: labels.expired });
  }

  if (oauth?.has_refresh_token) {
    chips.push({ tone: "idle", label: labels.hasRefresh });
  }

  return chips;
}

export function providerCapabilityChips(provider: ConfigProvider): string[] {
  const caps = provider.effective_capabilities ?? provider.capabilities;
  if (!caps) {
    return [];
  }
  const chips: string[] = [];
  if (caps.tool_calling) chips.push("tool_calling");
  if (caps.structured_outputs) chips.push("structured_outputs");
  if (caps.multimodal) chips.push("multimodal");
  if (caps.auto) chips.push("auto");
  return chips;
}

export function catalogModelOptions(models: ConfigProviderCatalogModel[]): { id: string; label: string }[] {
  return models.map((model) => ({
    id: model.id,
    label: model.name && model.name !== model.id ? `${model.name} (${model.id})` : model.id,
  }));
}

function catalogProviderKeys(entry: ConfigProviderCatalogEntry): string[] {
  return [entry.id, entry.aura_provider_type]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLowerCase());
}

export function resolveCatalogBaseUrl(entry: ConfigProviderCatalogEntry | null | undefined): string {
  if (!entry) {
    return "";
  }
  if (entry.base_url?.trim()) {
    return entry.base_url.trim();
  }
  for (const key of catalogProviderKeys(entry)) {
    const known = KNOWN_PROVIDER_BASE_URLS[key];
    if (known) {
      return known;
    }
  }
  return "";
}

export function mergeCatalogEntries(
  base: ConfigProviderCatalogEntry,
  override?: ConfigProviderCatalogEntry | null,
): ConfigProviderCatalogEntry {
  if (!override) {
    return base;
  }
  return {
    ...base,
    ...override,
    base_url: override.base_url ?? base.base_url,
    default_model: override.default_model ?? base.default_model,
    auth_type: override.auth_type ?? base.auth_type,
    oauth_provider: override.oauth_provider ?? base.oauth_provider,
    oauth_setup: override.oauth_setup ?? base.oauth_setup,
    missing_credentials: override.missing_credentials ?? base.missing_credentials,
    models_count: override.models_count ?? base.models_count,
  };
}

export function filterCatalogModelsForProvider(
  models: ConfigProviderCatalogModel[],
  entry: ConfigProviderCatalogEntry | null | undefined,
): ConfigProviderCatalogModel[] {
  if (!entry || models.length === 0) {
    return models;
  }
  const providerKeys = new Set(catalogProviderKeys(entry));
  const filtered = models.filter((model) => {
    if (!model.provider_id?.trim()) {
      return false;
    }
    return providerKeys.has(model.provider_id.trim().toLowerCase());
  });
  return filtered.length > 0 ? filtered : models;
}

export function isCatalogEntrySelectable(entry: ConfigProviderCatalogEntry): boolean {
  const availability = entry.availability?.trim().toLowerCase();
  if (availability && NON_SELECTABLE_CATALOG_AVAILABILITY.has(availability)) {
    return false;
  }
  // OAuth providers often stay `available: false` until credentials exist
  // (`availability: "missing_credentials"`). Those must remain addable.
  return true;
}

export function filterSelectableCatalogEntries(
  entries: ConfigProviderCatalogEntry[],
): ConfigProviderCatalogEntry[] {
  return entries.filter(isCatalogEntrySelectable);
}

/**
 * True when a catalog entry carries a *reliable* OAuth signal that guarantees
 * AuraGo can complete an OAuth flow for this provider type: either an explicit
 * `auth_type: "oauth"`, or `oauth_setup` metadata that includes BOTH the
 * authorization and token endpoints. AuraGo pairs `oauth_provider` with a full
 * `oauth_setup` (auth_url + token_url) for every genuinely OAuth-capable provider
 * in its bundled catalog, so a stray `oauth_provider` label, a lone `flow`, or
 * `scopes` alone are NOT treated as OAuth support — offering OAuth on those leads
 * to AuraGo rejecting oauth.start with "OAuth2 configuration incomplete: auth_type".
 */
function catalogEntryHasOauthSignal(entry: ConfigProviderCatalogEntry | null | undefined): boolean {
  if (!entry) {
    return false;
  }
  if (entry.auth_type === "oauth") {
    return true;
  }
  const setup = entry.oauth_setup;
  if (!setup) {
    return false;
  }
  return Boolean(setup.auth_url?.trim() && setup.token_url?.trim());
}

export function catalogEntryUsesOauth(entry: ConfigProviderCatalogEntry | null | undefined): boolean {
  if (!entry) {
    return false;
  }
  return catalogEntryHasOauthSignal(entry);
}

export function catalogEntrySupportsApiKey(
  entry: ConfigProviderCatalogEntry | null | undefined,
): boolean {
  if (!entry) {
    return true;
  }
  // A pure OAuth provider (auth_type=oauth, no dual api_key path) does not support
  // API keys. Anything else — including dual-auth providers that expose both an API
  // key and OAuth setup — keeps API key support.
  if (entry.auth_type === "oauth" && !catalogEntrySupportsApiKeyAlongsideDualAuth(entry)) {
    return false;
  }
  return true;
}

function catalogEntrySupportsApiKeyAlongsideDualAuth(
  entry: ConfigProviderCatalogEntry,
): boolean {
  // Dual-auth providers (e.g. OpenAI: auth_type=api_key + oauth_setup) explicitly
  // support API keys even though OAuth is also available.
  return entry.auth_type === "api_key" || Boolean(entry.oauth_provider) || Boolean(entry.oauth_setup);
}

export function resolveCatalogAuthType(
  entry: ConfigProviderCatalogEntry | null | undefined,
): "api_key" | "oauth" {
  if (!entry) {
    return "api_key";
  }
  if (catalogEntryHasOauthSignal(entry)) {
    return "oauth";
  }
  if (entry.auth_type === "api_key") {
    return "api_key";
  }
  return "api_key";
}

export function findCatalogEntryForProvider(
  catalog: ConfigProviderCatalogEntry[],
  provider: Pick<ConfigProvider, "id" | "type"> | null | undefined,
): ConfigProviderCatalogEntry | undefined {
  if (!provider) {
    return undefined;
  }
  const keys = new Set(
    [provider.id, provider.type]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => value.trim().toLowerCase()),
  );
  return catalog.find((entry) => {
    const entryKeys = catalogProviderKeys(entry);
    return entryKeys.some((key) => keys.has(key));
  });
}

export function providerSupportsOauth(provider: ConfigProvider | null | undefined): boolean {
  if (!provider) {
    return false;
  }
  if (provider.auth_type === "oauth") {
    return true;
  }
  // Dual-auth providers may be persisted with auth_type=api_key while still carrying
  // explicit OAuth endpoints. Requiring both auth + token URLs avoids false positives:
  // AuraGo attaches an `oauth` status block (with missing_fields) to EVERY configured
  // provider — including API-key-only ones like xai — so the mere presence of an
  // `oauth` object must NOT be treated as OAuth capability.
  if (provider.oauth_auth_url?.trim() && provider.oauth_token_url?.trim()) {
    return true;
  }
  return false;
}
