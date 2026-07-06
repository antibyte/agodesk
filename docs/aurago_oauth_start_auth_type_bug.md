# Bug Report for AuraGo Backend: `config.provider.oauth.start` rejects with "OAuth2 configuration incomplete: auth_type" even though the provider is stored with `auth_type: "oauth"`

## Summary

When an AgoDesk desktop client creates an OAuth provider (concretely: **xAI / `xai`**) and immediately starts desktop-assisted OAuth, AuraGo:

1. **accepts** the `config.provider.upsert` and returns a `config.provider` whose projection clearly contains `auth_type: "oauth"`, **but**
2. in the very same response reports `oauth.missing_fields: ["auth_type"]` and `oauth.configured: false`, and
3. **rejects** the subsequent `config.provider.oauth.start` with the error message **`OAuth2 configuration incomplete: auth_type`**.

The provider stays persisted in a broken state and must be deleted before another attempt.

The core contradiction: **the provider IS stored with `auth_type: "oauth"` (per AuraGo's own upsert response), yet AuraGo's OAuth-completeness check still treats `auth_type` as missing/incomplete.** This strongly suggests the completeness check and/or the `oauth.start` precondition reads `auth_type` from a different place than where `config.provider.upsert` writes it (or computes `missing_fields` independently of the persisted value).

## Affected commands

- `config.provider.upsert` (mode `create`)
- `config.provider.oauth.start`
- The `oauth.missing_fields` computation used in `config.provider` / `config.providers` / `config.provider.oauth.status`

## Exact reproduction (real client-side protocol trace)

The client is up to date with the protocol doc (`docs/aurago_backend_protocol.md`): it advertises `config.providers.read/write/oauth`, uses `secret op` semantics, and starts a loopback listener.

### Step 1 — `config.provider.upsert` (create), payload sent by the client

```jsonc
{
  "type": "config.provider.upsert",
  "payload": {
    "session_id": "<accepted session id>",
    "mode": "create",
    "provider": {
      "id": "xai",
      "name": "xAI",
      "type": "xai",
      "base_url": "https://api.x.ai/v1",
      "model": "<selected model>",
      "auth_type": "oauth",
      "oauth_provider": "xai",
      "oauth_auth_url": "https://auth.x.ai/oauth/authorize?plan=generic&referrer=oh-my-pi",
      "oauth_token_url": "https://auth.x.ai/oauth/token",
      "oauth_scopes": "<scopes from catalog oauth_setup, if any>"
      // NOTE: oauth_client_id was NOT sent (client had none; the catalog oauth_setup
      // did not expose a client_id, so the client assumed AuraGo bundles it).
    },
    "secrets": {
      "api_key": { "op": "keep" },
      "oauth_client_secret": { "op": "keep" }
    }
  }
}
```

Client-side diagnostic log for the request:

```
[agodesk:provider.upsert] request
{"mode":"create","startOauthAfterSave":true,"id":"xai","type":"xai",
 "auth_type":"oauth","has_oauth_auth_url":true,"has_oauth_token_url":true,
 "has_oauth_client_id":false}
```

### Step 2 — AuraGo's `config.provider` response (as parsed by the client)

```
[agodesk:provider.upsert] saved
{"id":"xai","type":"xai","auth_type":"oauth","oauth_configured":false,
 "oauth_missing_fields":["auth_type"]}
```

So AuraGo **persisted and echoed** `auth_type: "oauth"`, but still reports `oauth.missing_fields: ["auth_type"]` and `oauth.configured: false`.

### Step 3 — Catalog data the client used (from `config.provider.catalog.detail` for `xai`)

```
[agodesk:oauth.start] pre-flight
{"provider_id":"xai","provider_type":"xai","provider_auth_type":"oauth",
 "provider_oauth_provider":"xai",
 "catalog_has_oauth_setup":true,
 "catalog_auth_url":"https://auth.x.ai/oauth/authorize?plan=generic&referrer=oh-my-pi",
 "catalog_token_url":"https://auth.x.ai/oauth/token"}
```

xAI is genuinely advertised as OAuth-capable by AuraGo's own catalog (`oauth_setup` with real auth + token endpoints).

### Step 4 — `config.provider.oauth.start` sent by the client

```jsonc
{
  "type": "config.provider.oauth.start",
  "payload": {
    "session_id": "<accepted session id>",
    "provider_id": "xai",
    "redirect_uri": "http://127.0.0.1:<port>/oauth/callback"
  }
}
```

### Step 5 — AuraGo rejects

```
[agodesk:oauth.start] failed
{"provider_id":"xai","provider_auth_type":"oauth",
 "error":"OAuth2 configuration incomplete: auth_type"}
```

## The key contradiction (please focus here)

- In the protocol doc's own "Safe provider shape" example (`docs/aurago_backend_protocol.md`, around line 662), an **`auth_type: "api_key"`** provider reports `oauth.missing_fields: ["auth_type"]`.
- In this live trace, an **`auth_type: "oauth"`** provider ALSO reports `oauth.missing_fields: ["auth_type"]`.

`missing_fields` is `["auth_type"]` in **both** cases, i.e. **independent of the actually persisted `auth_type` value.** That is almost certainly the root bug: the completeness check does not read the `auth_type` that `config.provider.upsert` just wrote.

## Concrete hypotheses (ranked)

1. **`oauth.start` / `missing_fields` reads `auth_type` from the wrong source.**
   The upsert writes `auth_type` onto the provider record and the `config.provider` projection reflects it, but the OAuth-completeness / `oauth.start` precondition reads `auth_type` from a *different* structure (e.g. the active `llm.provider` config slot, a normalized/legacy provider config, a cached snapshot, or a per-provider "oauth config" sub-object that upsert does not populate). Result: it always sees `auth_type` unset → `missing_fields: ["auth_type"]` → "incomplete: auth_type".

2. **Create-vs-read transaction / cache staleness.**
   The upsert response is built from the in-memory input projection, but the persisted record used by `oauth.start` is written asynchronously or read from a stale cache, so `oauth.start` (called immediately after) does not yet see `auth_type = oauth`.

3. **Misleading error label: the real missing field is the OAuth client credential.**
   xAI may require an `oauth_client_id` (and/or `oauth_client_secret`) that AuraGo does not bundle. If completeness actually fails on the missing client id/secret, the error/`missing_fields` still reports the generic label `auth_type` instead of the real field (`oauth_client_id` / `oauth_client_secret`). If this is the case, please (a) name the real missing field, and (b) document whether the client must collect and send `oauth_client_id` for xAI.

4. **`type` vs `oauth_provider` mapping.**
   AuraGo may key its bundled OAuth config off `type` or `oauth_provider`. If the value it expects differs from `"xai"` (e.g. a different canonical id), the bundled OAuth config (and thus `auth_type` completeness) is never resolved.

## Requested backend investigation

Please check, for the `config.provider.oauth.start` handler and the provider `missing_fields` computation:

1. Where is `auth_type` read when computing `oauth.missing_fields` and when validating `oauth.start`? Is it the same record/field that `config.provider.upsert` writes (`provider.auth_type`)?
2. Why does `missing_fields` contain `"auth_type"` for a provider that was just stored with `auth_type: "oauth"`? Print/trace the persisted value at `oauth.start` time.
3. Is `oauth_client_id` (and/or `oauth_client_secret`) required for xAI, and if so, is AuraGo supposed to supply it from bundled config keyed by `type`/`oauth_provider`, or must the client send it?
4. Is there a create→start ordering/cache issue where `oauth.start` reads a stale provider snapshot?

## Suggested fixes (backend)

1. Make the `oauth.start` precondition and `missing_fields` computation read `auth_type` from the same persisted provider record that `config.provider.upsert` writes and `config.provider` projects.
2. If OAuth completeness genuinely fails on a different field (e.g. `oauth_client_id`), report that field in both `missing_fields` and the error message instead of the generic `"auth_type"`. A precise error (`OAuth2 configuration incomplete: oauth_client_id`) would let the client prompt for the right value.
3. If AuraGo bundles xAI OAuth client credentials, ensure they are resolved (by `type`/`oauth_provider`) during `oauth.start` so `auth_type: "oauth"` is sufficient — matching the desktop-assisted OAuth happy path in the protocol doc, which does not ask the client for a client id/secret.
4. Consider making `config.provider.oauth.start` idempotent enough to auto-heal `auth_type` when the provider record already resolves to an OAuth-capable catalog entry, so a freshly-created OAuth provider can start OAuth without a second round-trip.

## Client-side context (for completeness)

- The client sends `auth_type: "oauth"` plus `oauth_auth_url` and `oauth_token_url` from the catalog `oauth_setup`, but does **not** send `oauth_client_id`/`oauth_client_secret` (the catalog `oauth_setup` did not expose a client id, and the protocol doc's desktop-assisted OAuth happy path does not request one).
- The client can add UI to collect `oauth_client_id` / `oauth_client_secret` if AuraGo confirms xAI requires client-provided credentials — please confirm in the answer.
- No secrets/tokens are included in this report; all values above are non-secret configuration/metadata.

## One-line repro summary

Create provider `xai` (`type=xai`, `auth_type=oauth`, catalog `oauth_setup` present) → `config.provider.oauth.start` → `OAuth2 configuration incomplete: auth_type`, while `config.provider` for the same provider reports `auth_type: "oauth"` with `oauth.missing_fields: ["auth_type"]`.
