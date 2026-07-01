import test from "node:test";
import assert from "node:assert/strict";
import type { WsMessage } from "../types/protocol.ts";
import {
  fetchConfigProviderDetail,
  handleConfigProviderMessage,
  handleConfigProvidersMessage,
  rejectAnyPendingProviderWaiters,
} from "./providers-flow.ts";

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
