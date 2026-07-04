import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOAuthCallbackEvent,
  normalizeOAuthListenerStartResult,
} from "./oauth-loopback.ts";

test("normalizeOAuthListenerStartResult accepts camelCase redirectUri from Tauri", () => {
  assert.deepEqual(
    normalizeOAuthListenerStartResult({
      redirectUri: "http://127.0.0.1:8765/oauth/callback",
      port: 8765,
      path: "/oauth/callback",
    }),
    {
      redirect_uri: "http://127.0.0.1:8765/oauth/callback",
      port: 8765,
      path: "/oauth/callback",
    },
  );
});

test("normalizeOAuthCallbackEvent accepts camelCase redirectUrl from Tauri", () => {
  assert.deepEqual(
    normalizeOAuthCallbackEvent({
      redirectUrl: "http://127.0.0.1:8765/oauth/callback?code=abc",
      providerId: "google",
    }),
    {
      redirect_url: "http://127.0.0.1:8765/oauth/callback?code=abc",
      provider_id: "google",
    },
  );
});
