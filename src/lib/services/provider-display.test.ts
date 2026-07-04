import test from "node:test";
import assert from "node:assert/strict";
import type { ConfigProvider, ConfigProviderCatalogEntry } from "../types/protocol.ts";
import {
  catalogEntryUsesOauth,
  catalogEntrySupportsApiKey,
  filterSelectableCatalogEntries,
  filterCatalogModelsForProvider,
  findCatalogEntryForProvider,
  isCatalogEntrySelectable,
  mergeCatalogEntries,
  providerEffectiveMissingFields,
  providerListHasWarnings,
  providerOauthStatusChips,
  providerSupportsOauth,
  resolveCatalogAuthType,
  resolveCatalogBaseUrl,
} from "./provider-display.ts";

const labels = {
  authorized: "authorized",
  notAuthorized: "not authorized",
  configured: "configured",
  notConfigured: "not configured",
  expired: "expired",
  hasRefresh: "refresh",
};

function baseProvider(overrides: Partial<ConfigProvider> = {}): ConfigProvider {
  return {
    id: "main",
    name: "Main LLM",
    type: "openrouter",
    ...overrides,
  };
}

test("providerEffectiveMissingFields filters auth_type when already set", () => {
  const fields = providerEffectiveMissingFields(
    baseProvider({
      auth_type: "api_key",
      oauth: { missing_fields: ["auth_type", "api_key"] },
      secrets: { api_key: { present: true } },
    }),
  );
  assert.deepEqual(fields, []);
});

test("providerEffectiveMissingFields keeps unresolved fields", () => {
  const fields = providerEffectiveMissingFields(
    baseProvider({
      auth_type: "oauth",
      oauth: { missing_fields: ["oauth_client_id", "oauth_client_secret"] },
    }),
  );
  assert.deepEqual(fields, ["oauth_client_id", "oauth_client_secret"]);
});

test("providerOauthStatusChips returns empty for api_key providers", () => {
  const chips = providerOauthStatusChips(
    baseProvider({
      auth_type: "api_key",
      oauth: { configured: false, authorized: false, missing_fields: ["auth_type"] },
    }),
    labels,
  );
  assert.deepEqual(chips, []);
});

test("providerListHasWarnings is false for healthy api_key provider", () => {
  assert.equal(
    providerListHasWarnings(
      baseProvider({
        auth_type: "api_key",
        secrets: { api_key: { present: true } },
        oauth: { missing_fields: ["auth_type"] },
      }),
    ),
    false,
  );
});

test("isCatalogEntrySelectable hides catalog_only but keeps missing_credentials providers", () => {
  assert.equal(
    isCatalogEntrySelectable({
      id: "anthropic",
      name: "Anthropic",
      available: true,
      availability: "available",
    }),
    true,
  );
  assert.equal(
    isCatalogEntrySelectable({
      id: "google",
      name: "Google",
      available: false,
      availability: "missing_credentials",
    }),
    true,
  );
  assert.equal(
    isCatalogEntrySelectable({
      id: "bedrock",
      name: "Amazon Bedrock",
      available: false,
      availability: "catalog_only",
    }),
    false,
  );
  assert.equal(
    isCatalogEntrySelectable({
      id: "azure",
      name: "Azure",
      availability: "catalog_only",
    }),
    false,
  );
});

test("filterSelectableCatalogEntries keeps addable providers including oauth setup targets", () => {
  const entries: ConfigProviderCatalogEntry[] = [
    { id: "anthropic", name: "Anthropic", available: true, availability: "available" },
    { id: "google", name: "Google", available: false, availability: "missing_credentials" },
    { id: "bedrock", name: "Amazon Bedrock", available: false, availability: "catalog_only" },
    { id: "azure", name: "Azure", availability: "catalog_only" },
  ];
  assert.deepEqual(
    filterSelectableCatalogEntries(entries).map((entry) => entry.id),
    ["anthropic", "google"],
  );
});

test("catalogEntryUsesOauth respects auth_type and oauth_setup metadata", () => {
  assert.equal(
    catalogEntryUsesOauth({ id: "openai", name: "Openai", auth_type: "api_key" }),
    false,
  );
  assert.equal(
    catalogEntryUsesOauth({
      id: "openai",
      name: "Openai",
      auth_type: "api_key",
      oauth_setup: { auth_url: "https://auth.openai.com/oauth/authorize" },
    }),
    true,
  );
  assert.equal(
    catalogEntryUsesOauth({ id: "google", name: "Google", auth_type: "oauth" }),
    true,
  );
  assert.equal(
    catalogEntryUsesOauth({
      id: "openai",
      name: "Openai",
      oauth_provider: "openai",
    }),
    true,
  );
  assert.equal(
    catalogEntryUsesOauth({
      id: "google",
      name: "Google",
      oauth_setup: { auth_url: "https://example.com/auth" },
    }),
    true,
  );
  assert.equal(
    catalogEntryUsesOauth({
      id: "google",
      name: "Google",
      oauth_setup: { callback_path: "/oauth/callback", flow: "authorization_code_pkce" },
    }),
    true,
  );
  assert.equal(
    catalogEntryUsesOauth({
      id: "google",
      name: "Google",
      oauth_setup: { scopes: ["openid", "email"] },
    }),
    true,
  );
});

test("catalogEntryUsesOauth is false for pure api_key providers without oauth signals", () => {
  assert.equal(
    catalogEntryUsesOauth({ id: "anthropic", name: "Anthropic", auth_type: "api_key" }),
    false,
  );
  assert.equal(
    catalogEntryUsesOauth({ id: "groq", name: "Groq" }),
    false,
  );
});

test("catalogEntrySupportsApiKey allows dual-auth catalog providers", () => {
  assert.equal(
    catalogEntrySupportsApiKey({
      id: "openai",
      name: "Openai",
      auth_type: "api_key",
      oauth_setup: { auth_url: "https://auth.openai.com/oauth/authorize" },
    }),
    true,
  );
  assert.equal(
    catalogEntrySupportsApiKey({ id: "google", name: "Google", auth_type: "oauth" }),
    false,
  );
  assert.equal(
    catalogEntrySupportsApiKey({ id: "anthropic", name: "Anthropic", auth_type: "api_key" }),
    true,
  );
});

test("resolveCatalogAuthType prefers oauth when oauth_setup is present", () => {
  assert.equal(resolveCatalogAuthType({ id: "openai", name: "Openai", auth_type: "api_key" }), "api_key");
  assert.equal(
    resolveCatalogAuthType({
      id: "openai",
      name: "Openai",
      auth_type: "api_key",
      oauth_setup: { auth_url: "https://auth.openai.com/oauth/authorize" },
    }),
    "oauth",
  );
  assert.equal(resolveCatalogAuthType({ id: "google", name: "Google", auth_type: "oauth" }), "oauth");
  assert.equal(
    resolveCatalogAuthType({
      id: "google",
      name: "Google",
      oauth_setup: { auth_url: "https://example.com/auth" },
    }),
    "oauth",
  );
  assert.equal(
    resolveCatalogAuthType({ id: "google", name: "Google", oauth_provider: "google" }),
    "oauth",
  );
  assert.equal(
    resolveCatalogAuthType({ id: "anthropic", name: "Anthropic", auth_type: "api_key" }),
    "api_key",
  );
});

test("findCatalogEntryForProvider matches configured provider type", () => {
  const entry = findCatalogEntryForProvider(
    [
      { id: "openai", name: "Openai", aura_provider_type: "openai" },
      { id: "google", name: "Google" },
    ],
    { id: "main-openai", type: "openai" },
  );
  assert.equal(entry?.id, "openai");
});

test("providerSupportsOauth follows configured auth metadata", () => {
  assert.equal(
    providerSupportsOauth({ id: "openai", name: "Openai", type: "openai", auth_type: "api_key" }),
    false,
  );
  assert.equal(
    providerSupportsOauth({ id: "google", name: "Google", type: "google", auth_type: "oauth" }),
    true,
  );
  assert.equal(
    providerSupportsOauth({
      id: "google",
      name: "Google",
      type: "google",
      oauth_auth_url: "https://example.com/auth",
    }),
    true,
  );
});

test("providerSupportsOauth recognizes dual-auth providers saved with api_key", () => {
  // A dual-auth provider (e.g. OpenAI) may be persisted with auth_type=api_key while
  // still carrying OAuth endpoints. OAuth must remain available so the user can start
  // it after saving.
  assert.equal(
    providerSupportsOauth({
      id: "openai",
      name: "Openai",
      type: "openai",
      auth_type: "api_key",
      oauth_auth_url: "https://auth.openai.com/oauth/authorize",
      oauth_token_url: "https://auth.openai.com/oauth/token",
    }),
    true,
  );
  assert.equal(
    providerSupportsOauth({
      id: "openai",
      name: "Openai",
      type: "openai",
      auth_type: "api_key",
      oauth: { configured: false, authorized: false },
    }),
    true,
  );
});

test("resolveCatalogBaseUrl uses explicit url then known provider defaults", () => {
  assert.equal(
    resolveCatalogBaseUrl({
      id: "openai",
      name: "Openai",
      base_url: "https://example.com/v1",
    }),
    "https://example.com/v1",
  );
  assert.equal(
    resolveCatalogBaseUrl({
      id: "openai",
      name: "Openai",
      aura_provider_type: "openai",
    }),
    "https://api.openai.com/v1",
  );
});

test("mergeCatalogEntries keeps list values when detail omits them", () => {
  const merged = mergeCatalogEntries(
    {
      id: "openai",
      name: "Openai",
      base_url: "https://api.openai.com/v1",
      default_model: "gpt-5.5",
    },
    {
      id: "openai",
      name: "Openai",
      models_count: 42,
    },
  );
  assert.equal(merged.base_url, "https://api.openai.com/v1");
  assert.equal(merged.default_model, "gpt-5.5");
  assert.equal(merged.models_count, 42);
});

test("filterCatalogModelsForProvider keeps models for selected provider", () => {
  const models = filterCatalogModelsForProvider(
    [
      { id: "gpt-5.5", name: "GPT-5.5", provider_id: "openai" },
      { id: "claude-opus-4-8", name: "Claude", provider_id: "anthropic" },
    ],
    { id: "openai", name: "Openai" },
  );
  assert.deepEqual(
    models.map((model) => model.id),
    ["gpt-5.5"],
  );
});

test("providerListHasWarnings is true for expired oauth provider", () => {
  assert.equal(
    providerListHasWarnings(
      baseProvider({
        auth_type: "oauth",
        oauth: { expired: true, configured: true, authorized: true },
      }),
    ),
    true,
  );
});
