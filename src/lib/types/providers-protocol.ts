export type ConfigProviderAuthType = "api_key" | "oauth" | string;

export type ConfigProviderSecretOp = "keep" | "set" | "clear";

export interface ConfigProviderSecretState {
  present: boolean;
}

export interface ConfigProviderSecretsState {
  api_key?: ConfigProviderSecretState;
  oauth_client_secret?: ConfigProviderSecretState;
}

export interface ConfigProviderOauthState {
  provider_id?: string;
  configured?: boolean;
  authorized?: boolean;
  has_refresh_token?: boolean;
  missing_fields?: string[];
  expired?: boolean;
  expiry?: string;
  redirect_uri?: string;
  mode?: string;
  message?: string;
}

export interface ConfigProviderCapabilities {
  auto?: boolean;
  tool_calling?: boolean;
  structured_outputs?: boolean;
  multimodal?: boolean;
  source?: string;
  [key: string]: unknown;
}

export interface ConfigProviderReference {
  path: string;
  role: string;
}

export interface ConfigProvider {
  id: string;
  name: string;
  type: string;
  base_url?: string;
  model?: string;
  account_id?: string;
  auth_type?: ConfigProviderAuthType;
  oauth_auth_url?: string;
  oauth_token_url?: string;
  oauth_client_id?: string;
  oauth_scopes?: string;
  capabilities?: ConfigProviderCapabilities;
  effective_capabilities?: ConfigProviderCapabilities;
  secrets?: ConfigProviderSecretsState;
  oauth?: ConfigProviderOauthState;
  references?: ConfigProviderReference[];
}

export interface ConfigProvidersPayload {
  session_id: string;
  status?: string;
  providers: ConfigProvider[];
}

export interface ConfigProviderPayload {
  session_id: string;
  status?: string;
  provider: ConfigProvider;
}

export interface ConfigProviderOauthSetup {
  flow?: string;
  auth_url?: string;
  token_url?: string;
  scopes?: string[];
  callback_port?: number;
  callback_path?: string;
  [key: string]: unknown;
}

export interface ConfigProviderCatalogEntry {
  id: string;
  aura_provider_type?: string;
  name: string;
  default_model?: string;
  oauth_provider?: string;
  oauth_setup?: ConfigProviderOauthSetup;
  available?: boolean;
  availability?: string;
  models_count?: number;
  [key: string]: unknown;
}

export interface ConfigProviderCatalogPayload {
  session_id: string;
  status?: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
  providers: ConfigProviderCatalogEntry[];
  models?: unknown[];
}

export interface ConfigProviderTestResultPayload {
  session_id: string;
  provider_id: string;
  status?: string;
  ok: boolean;
  message?: string;
}

export interface ConfigProviderOauthStartedPayload {
  session_id: string;
  provider_id: string;
  auth_url: string;
  mode?: string;
  oauth_state?: string;
  expires_at?: string;
  fallback_modes?: string[];
  redirect_uri?: string;
}

export interface ConfigProviderOauthStatusPayload {
  session_id: string;
  provider_id: string;
  status?: string;
  configured?: boolean;
  authorized?: boolean;
  expired?: boolean;
  expiry?: string;
  has_refresh_token?: boolean;
  missing_fields?: string[];
  redirect_uri?: string;
  mode?: string;
  message?: string;
}

export interface ConfigProviderUpsertSecretInput {
  op: ConfigProviderSecretOp;
  value?: string;
}

export interface ConfigProviderUpsertSecrets {
  api_key?: ConfigProviderUpsertSecretInput;
  oauth_client_secret?: ConfigProviderUpsertSecretInput;
}

export interface ConfigProviderUpsertProviderInput {
  id: string;
  name: string;
  type: string;
  base_url?: string;
  model?: string;
  account_id?: string;
  auth_type?: ConfigProviderAuthType;
  oauth_auth_url?: string;
  oauth_token_url?: string;
  oauth_client_id?: string;
  oauth_scopes?: string;
}

export interface ConfigProviderUpsertPayload {
  session_id: string;
  mode: "create" | "update";
  provider: ConfigProviderUpsertProviderInput;
  secrets?: ConfigProviderUpsertSecrets;
}

export const AGODESK_CONFIG_PROVIDERS_READ_CAPABILITY = "config.providers.read";
export const AGODESK_CONFIG_PROVIDERS_WRITE_CAPABILITY = "config.providers.write";
export const AGODESK_CONFIG_PROVIDERS_OAUTH_CAPABILITY = "config.providers.oauth";

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function readBoolean(record: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function readStringArray(record: Record<string, unknown>, ...keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string");
    }
  }
  return undefined;
}

function normalizeSecretState(raw: unknown): ConfigProviderSecretState | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const present = readBoolean(record, "present");
  if (present === undefined) {
    return undefined;
  }
  return { present };
}

function normalizeSecretsState(raw: unknown): ConfigProviderSecretsState | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const apiKey = normalizeSecretState(record.api_key ?? record.apiKey);
  const oauthClientSecret = normalizeSecretState(
    record.oauth_client_secret ?? record.oauthClientSecret,
  );
  if (!apiKey && !oauthClientSecret) {
    return undefined;
  }
  return {
    ...(apiKey ? { api_key: apiKey } : {}),
    ...(oauthClientSecret ? { oauth_client_secret: oauthClientSecret } : {}),
  };
}

function normalizeOauthState(raw: unknown): ConfigProviderOauthState | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const missingFields = readStringArray(record, "missing_fields", "missingFields");
  return {
    ...(readString(record, "provider_id", "providerId")
      ? { provider_id: readString(record, "provider_id", "providerId") }
      : {}),
    ...(readBoolean(record, "configured") !== undefined
      ? { configured: readBoolean(record, "configured") }
      : {}),
    ...(readBoolean(record, "authorized") !== undefined
      ? { authorized: readBoolean(record, "authorized") }
      : {}),
    ...(readBoolean(record, "has_refresh_token", "hasRefreshToken") !== undefined
      ? { has_refresh_token: readBoolean(record, "has_refresh_token", "hasRefreshToken") }
      : {}),
    ...(missingFields ? { missing_fields: missingFields } : {}),
    ...(readBoolean(record, "expired") !== undefined
      ? { expired: readBoolean(record, "expired") }
      : {}),
    ...(readString(record, "expiry") ? { expiry: readString(record, "expiry") } : {}),
    ...(readString(record, "redirect_uri", "redirectUri")
      ? { redirect_uri: readString(record, "redirect_uri", "redirectUri") }
      : {}),
    ...(readString(record, "mode") ? { mode: readString(record, "mode") } : {}),
    ...(readString(record, "message") ? { message: readString(record, "message") } : {}),
  };
}

function normalizeCapabilities(raw: unknown): ConfigProviderCapabilities | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  return raw as ConfigProviderCapabilities;
}

function normalizeReference(raw: unknown): ConfigProviderReference | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const path = readString(record, "path");
  const role = readString(record, "role");
  if (!path || !role) {
    return null;
  }
  return { path, role };
}

export function normalizeConfigProvider(raw: unknown): ConfigProvider | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const id = readString(record, "id");
  const name = readString(record, "name");
  const type = readString(record, "type");
  if (!id || !name || !type) {
    return null;
  }
  const referencesRaw = record.references;
  const references = Array.isArray(referencesRaw)
    ? referencesRaw
        .map((entry) => normalizeReference(entry))
        .filter((entry): entry is ConfigProviderReference => entry !== null)
    : undefined;

  return {
    id,
    name,
    type,
    ...(readString(record, "base_url", "baseUrl")
      ? { base_url: readString(record, "base_url", "baseUrl") }
      : {}),
    ...(readString(record, "model") ? { model: readString(record, "model") } : {}),
    ...(readString(record, "account_id", "accountId")
      ? { account_id: readString(record, "account_id", "accountId") }
      : {}),
    ...(readString(record, "auth_type", "authType")
      ? { auth_type: readString(record, "auth_type", "authType") }
      : {}),
    ...(readString(record, "oauth_auth_url", "oauthAuthUrl")
      ? { oauth_auth_url: readString(record, "oauth_auth_url", "oauthAuthUrl") }
      : {}),
    ...(readString(record, "oauth_token_url", "oauthTokenUrl")
      ? { oauth_token_url: readString(record, "oauth_token_url", "oauthTokenUrl") }
      : {}),
    ...(readString(record, "oauth_client_id", "oauthClientId")
      ? { oauth_client_id: readString(record, "oauth_client_id", "oauthClientId") }
      : {}),
    ...(readString(record, "oauth_scopes", "oauthScopes")
      ? { oauth_scopes: readString(record, "oauth_scopes", "oauthScopes") }
      : {}),
    ...(normalizeCapabilities(record.capabilities)
      ? { capabilities: normalizeCapabilities(record.capabilities) }
      : {}),
    ...(normalizeCapabilities(record.effective_capabilities ?? record.effectiveCapabilities)
      ? {
          effective_capabilities: normalizeCapabilities(
            record.effective_capabilities ?? record.effectiveCapabilities,
          ),
        }
      : {}),
    ...(normalizeSecretsState(record.secrets)
      ? { secrets: normalizeSecretsState(record.secrets) }
      : {}),
    ...(normalizeOauthState(record.oauth) ? { oauth: normalizeOauthState(record.oauth) } : {}),
    ...(references && references.length > 0 ? { references } : {}),
  };
}

export function normalizeConfigProvidersPayload(payload: unknown): ConfigProvidersPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const sessionId = readString(record, "session_id", "sessionId");
  const rawProviders = record.providers;
  if (!sessionId || !Array.isArray(rawProviders)) {
    return null;
  }
  const providers = rawProviders
    .map((entry) => normalizeConfigProvider(entry))
    .filter((entry): entry is ConfigProvider => entry !== null);
  return {
    session_id: sessionId,
    ...(readString(record, "status") ? { status: readString(record, "status") } : {}),
    providers,
  };
}

export function normalizeConfigProviderPayload(payload: unknown): ConfigProviderPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const sessionId = readString(record, "session_id", "sessionId");
  const provider = normalizeConfigProvider(record.provider);
  if (!sessionId || !provider) {
    return null;
  }
  return {
    session_id: sessionId,
    ...(readString(record, "status") ? { status: readString(record, "status") } : {}),
    provider,
  };
}

function normalizeOauthSetup(raw: unknown): ConfigProviderOauthSetup | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const scopesRaw = record.scopes;
  const scopes = Array.isArray(scopesRaw)
    ? scopesRaw.filter((entry): entry is string => typeof entry === "string")
    : undefined;
  const callbackPort = record.callback_port ?? record.callbackPort;
  return {
    ...(readString(record, "flow") ? { flow: readString(record, "flow") } : {}),
    ...(readString(record, "auth_url", "authUrl")
      ? { auth_url: readString(record, "auth_url", "authUrl") }
      : {}),
    ...(readString(record, "token_url", "tokenUrl")
      ? { token_url: readString(record, "token_url", "tokenUrl") }
      : {}),
    ...(scopes ? { scopes } : {}),
    ...(typeof callbackPort === "number" ? { callback_port: callbackPort } : {}),
    ...(readString(record, "callback_path", "callbackPath")
      ? { callback_path: readString(record, "callback_path", "callbackPath") }
      : {}),
  };
}

function normalizeCatalogEntry(raw: unknown): ConfigProviderCatalogEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const id = readString(record, "id");
  const name = readString(record, "name");
  if (!id || !name) {
    return null;
  }
  const modelsCount = record.models_count ?? record.modelsCount;
  return {
    id,
    name,
    ...(readString(record, "aura_provider_type", "auraProviderType")
      ? { aura_provider_type: readString(record, "aura_provider_type", "auraProviderType") }
      : {}),
    ...(readString(record, "default_model", "defaultModel")
      ? { default_model: readString(record, "default_model", "defaultModel") }
      : {}),
    ...(readString(record, "oauth_provider", "oauthProvider")
      ? { oauth_provider: readString(record, "oauth_provider", "oauthProvider") }
      : {}),
    ...(normalizeOauthSetup(record.oauth_setup ?? record.oauthSetup)
      ? { oauth_setup: normalizeOauthSetup(record.oauth_setup ?? record.oauthSetup) }
      : {}),
    ...(readBoolean(record, "available") !== undefined
      ? { available: readBoolean(record, "available") }
      : {}),
    ...(readString(record, "availability")
      ? { availability: readString(record, "availability") }
      : {}),
    ...(typeof modelsCount === "number" ? { models_count: modelsCount } : {}),
  };
}

export function normalizeConfigProviderCatalogPayload(
  payload: unknown,
): ConfigProviderCatalogPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const sessionId = readString(record, "session_id", "sessionId");
  const rawProviders = record.providers;
  if (!sessionId || !Array.isArray(rawProviders)) {
    return null;
  }
  const providers = rawProviders
    .map((entry) => normalizeCatalogEntry(entry))
    .filter((entry): entry is ConfigProviderCatalogEntry => entry !== null);
  const metadata =
    record.metadata && typeof record.metadata === "object"
      ? (record.metadata as Record<string, unknown>)
      : undefined;
  return {
    session_id: sessionId,
    ...(readString(record, "status") ? { status: readString(record, "status") } : {}),
    ...(readBoolean(record, "enabled") !== undefined
      ? { enabled: readBoolean(record, "enabled") }
      : {}),
    ...(metadata ? { metadata } : {}),
    providers,
    ...(Array.isArray(record.models) ? { models: record.models } : {}),
  };
}

export function normalizeConfigProviderTestResultPayload(
  payload: unknown,
): ConfigProviderTestResultPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const sessionId = readString(record, "session_id", "sessionId");
  const providerId = readString(record, "provider_id", "providerId");
  const okRaw = record.ok;
  if (!sessionId || !providerId || typeof okRaw !== "boolean") {
    return null;
  }
  return {
    session_id: sessionId,
    provider_id: providerId,
    ok: okRaw,
    ...(readString(record, "status") ? { status: readString(record, "status") } : {}),
    ...(readString(record, "message") ? { message: readString(record, "message") } : {}),
  };
}

export function normalizeConfigProviderOauthStartedPayload(
  payload: unknown,
): ConfigProviderOauthStartedPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const sessionId = readString(record, "session_id", "sessionId");
  const providerId = readString(record, "provider_id", "providerId");
  const authUrl = readString(record, "auth_url", "authUrl");
  if (!sessionId || !providerId || !authUrl) {
    return null;
  }
  const fallbackRaw = record.fallback_modes ?? record.fallbackModes;
  const fallbackModes = Array.isArray(fallbackRaw)
    ? fallbackRaw.filter((entry): entry is string => typeof entry === "string")
    : undefined;
  return {
    session_id: sessionId,
    provider_id: providerId,
    auth_url: authUrl,
    ...(readString(record, "mode") ? { mode: readString(record, "mode") } : {}),
    ...(readString(record, "oauth_state", "oauthState")
      ? { oauth_state: readString(record, "oauth_state", "oauthState") }
      : {}),
    ...(readString(record, "expires_at", "expiresAt")
      ? { expires_at: readString(record, "expires_at", "expiresAt") }
      : {}),
    ...(fallbackModes ? { fallback_modes: fallbackModes } : {}),
    ...(readString(record, "redirect_uri", "redirectUri")
      ? { redirect_uri: readString(record, "redirect_uri", "redirectUri") }
      : {}),
  };
}

export function normalizeConfigProviderOauthStatusPayload(
  payload: unknown,
): ConfigProviderOauthStatusPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const sessionId = readString(record, "session_id", "sessionId");
  const providerId = readString(record, "provider_id", "providerId");
  if (!sessionId || !providerId) {
    return null;
  }
  const missingFields = readStringArray(record, "missing_fields", "missingFields");
  return {
    session_id: sessionId,
    provider_id: providerId,
    ...(readString(record, "status") ? { status: readString(record, "status") } : {}),
    ...(readBoolean(record, "configured") !== undefined
      ? { configured: readBoolean(record, "configured") }
      : {}),
    ...(readBoolean(record, "authorized") !== undefined
      ? { authorized: readBoolean(record, "authorized") }
      : {}),
    ...(readBoolean(record, "expired") !== undefined
      ? { expired: readBoolean(record, "expired") }
      : {}),
    ...(readString(record, "expiry") ? { expiry: readString(record, "expiry") } : {}),
    ...(readBoolean(record, "has_refresh_token", "hasRefreshToken") !== undefined
      ? { has_refresh_token: readBoolean(record, "has_refresh_token", "hasRefreshToken") }
      : {}),
    ...(missingFields ? { missing_fields: missingFields } : {}),
    ...(readString(record, "redirect_uri", "redirectUri")
      ? { redirect_uri: readString(record, "redirect_uri", "redirectUri") }
      : {}),
    ...(readString(record, "mode") ? { mode: readString(record, "mode") } : {}),
    ...(readString(record, "message") ? { message: readString(record, "message") } : {}),
  };
}

export function hasAdvertisedConfigProvidersRead(capabilities: readonly string[]): boolean {
  return capabilities.includes(AGODESK_CONFIG_PROVIDERS_READ_CAPABILITY);
}

export function hasAdvertisedConfigProvidersWrite(capabilities: readonly string[]): boolean {
  return capabilities.includes(AGODESK_CONFIG_PROVIDERS_WRITE_CAPABILITY);
}

export function hasAdvertisedConfigProvidersOauth(capabilities: readonly string[]): boolean {
  return capabilities.includes(AGODESK_CONFIG_PROVIDERS_OAUTH_CAPABILITY);
}

export function buildDefaultProviderSecretsForUpsert(
  apiKeyInput: string,
  oauthClientSecretInput: string,
  existing?: ConfigProviderSecretsState,
): ConfigProviderUpsertSecrets {
  const secrets: ConfigProviderUpsertSecrets = {
    api_key: { op: "keep" },
    oauth_client_secret: { op: "keep" },
  };

  const apiKeyTrimmed = apiKeyInput.trim();
  if (apiKeyTrimmed) {
    secrets.api_key = { op: "set", value: apiKeyTrimmed };
  } else if (existing?.api_key?.present === false) {
    secrets.api_key = { op: "keep" };
  }

  const oauthSecretTrimmed = oauthClientSecretInput.trim();
  if (oauthSecretTrimmed) {
    secrets.oauth_client_secret = { op: "set", value: oauthSecretTrimmed };
  }

  return secrets;
}
