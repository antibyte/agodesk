import test from "node:test";
import assert from "node:assert/strict";
import type { WsMessage } from "../types/protocol.ts";
import {
  buildConfigProviderCatalogDetailMessage,
  buildConfigProviderCatalogListMessage,
  buildConfigProviderDeleteMessage,
  buildConfigProviderOauthCompleteMessage,
  fetchConfigProviderDetail,
  handleConfigProviderTestResultMessage,
  handleConfigProviderMessage,
  handleConfigProvidersMessage,
  rejectAnyPendingProviderWaiters,
  rejectProviderWaiterByRequestId,
  testConfigProvider,
} from "./providers-flow.ts";
import { buildConfigProviderOauthCompletePayload } from "../types/protocol.ts";

test("rejectAnyPendingProviderWaiters returns false when no waiters pending", () => {
  assert.equal(rejectAnyPendingProviderWaiters(new Error("disconnect")), false);
});

test("fetchConfigProviderDetail resolves when config.provider arrives", async () => {
  let outboundId = "";
  const wsSend = async (message: WsMessage) => {
    outboundId = message.id;
    handleConfigProviderMessage(
      {
        id: message.id,
        type: "config.provider",
        timestamp: new Date().toISOString(),
        payload: {
          session_id: "sess-1",
          provider: {
            id: "openrouter",
            name: "OpenRouter",
            type: "openrouter",
            model: "auto",
          },
        },
      },
      {
        session_id: "sess-1",
        provider: {
          id: "openrouter",
          name: "OpenRouter",
          type: "openrouter",
          model: "auto",
        },
      },
    );
  };

  const provider = await fetchConfigProviderDetail(wsSend, "sess-1", "openrouter");
  assert.equal(outboundId.length > 0, true);
  assert.equal(provider.id, "openrouter");
  assert.equal(provider.model, "auto");
});

test("rejectAnyPendingProviderWaiters rejects in-flight detail request", async () => {
  let wsSendCalled = false;
  const wsSend = async () => {
    wsSendCalled = true;
  };
  const pending = fetchConfigProviderDetail(wsSend, "sess-1", "slow-provider");
  await Promise.resolve();
  assert.equal(wsSendCalled, true);
  assert.equal(rejectAnyPendingProviderWaiters(new Error("WebSocket disconnected.")), true);
  await assert.rejects(pending, /WebSocket disconnected/);
});

test("handleConfigProvidersMessage normalizes provider list", () => {
  const result = handleConfigProvidersMessage(
    {
      id: crypto.randomUUID(),
      type: "config.providers",
      timestamp: new Date().toISOString(),
      payload: {},
    },
    {
      session_id: "sess-1",
      providers: [{ id: "gemini", name: "Gemini", type: "gemini", auth_type: "oauth" }],
    },
  );
  assert.ok(result);
  assert.equal(result.providers[0]?.auth_type, "oauth");
});

test("buildConfigProviderCatalogListMessage includes include_models false", () => {
  const message = buildConfigProviderCatalogListMessage("sess-1");
  assert.equal(message.type, "config.provider.catalog.list");
  assert.deepEqual(message.payload, { session_id: "sess-1", include_models: false });
});

test("buildConfigProviderCatalogDetailMessage uses provider_id and include_models", () => {
  const message = buildConfigProviderCatalogDetailMessage("sess-1", "openrouter");
  assert.equal(message.type, "config.provider.catalog.detail");
  assert.deepEqual(message.payload, {
    session_id: "sess-1",
    provider_id: "openrouter",
    include_models: true,
  });
});

test("buildConfigProviderDeleteMessage supports force flag", () => {
  const forced = buildConfigProviderDeleteMessage("sess-1", "p1", true);
  assert.deepEqual(forced.payload, {
    session_id: "sess-1",
    provider_id: "p1",
    force: true,
  });
  const normal = buildConfigProviderDeleteMessage("sess-1", "p1");
  assert.deepEqual(normal.payload, { session_id: "sess-1", provider_id: "p1" });
});

test("buildConfigProviderOauthCompletePayload parses code and state from redirect URL", () => {
  const payload = buildConfigProviderOauthCompletePayload(
    "sess-1",
    "gemini",
    "http://127.0.0.1:8765/oauth/callback?code=abc123&state=xyz",
  );
  assert.equal(payload.session_id, "sess-1");
  assert.equal(payload.provider_id, "gemini");
  assert.equal(payload.code, "abc123");
  assert.equal(payload.state, "xyz");
  assert.equal(payload.redirect_uri, "http://127.0.0.1:8765/oauth/callback");
  assert.equal(payload.redirect_url, undefined);
});

test("buildConfigProviderOauthCompleteMessage falls back to redirect_url", () => {
  const message = buildConfigProviderOauthCompleteMessage("sess-1", "gemini", "not-a-valid-url");
  assert.deepEqual(message.payload, {
    session_id: "sess-1",
    provider_id: "gemini",
    redirect_url: "not-a-valid-url",
  });
});

test("testConfigProvider resolves status-only test_result responses", async () => {
  let outboundId = "";
  const wsSend = async (message: WsMessage) => {
    outboundId = message.id;
    handleConfigProviderTestResultMessage(
      {
        id: message.id,
        type: "config.provider.test_result",
        timestamp: new Date().toISOString(),
        payload: {
          session_id: "sess-1",
          provider_id: "main",
          status: "ok",
          message: "Provider configuration looks usable.",
        },
      },
      {
        session_id: "sess-1",
        provider_id: "main",
        status: "ok",
        message: "Provider configuration looks usable.",
      },
    );
  };

  const result = await testConfigProvider(wsSend, "sess-1", "main");
  assert.equal(outboundId.length > 0, true);
  assert.equal(result.ok, true);
  assert.equal(result.message, "Provider configuration looks usable.");
});

test("rejectProviderWaiterByRequestId rejects pending provider test", async () => {
  let outboundId = "";
  const wsSend = async (message: WsMessage) => {
    outboundId = message.id;
  };
  const pending = testConfigProvider(wsSend, "sess-1", "main");
  await Promise.resolve();
  assert.equal(outboundId.length > 0, true);
  assert.equal(rejectProviderWaiterByRequestId(outboundId, "Provider test denied."), true);
  await assert.rejects(pending, /Provider test denied/);
});
