import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import {
  AGODESK_VAULT_SECRET_PROMPT_CAPABILITY,
  agodeskClientCapabilities,
  hasAdvertisedVaultSecretPrompt,
  normalizeVaultSecretAckPayload,
  normalizeVaultSecretPromptPayload,
  VAULT_SECRET_PROMPT_MAX_CHARS,
  type WsMessage,
} from "../types/protocol.ts";
import { sessionState } from "../stores/session.ts";
import { vaultSecretPromptState } from "../stores/vault-secret-prompt.ts";
import {
  cancelVaultSecret,
  handleVaultSecretAckMessage,
  handleVaultSecretPromptMessage,
  resetVaultSecretPrompt,
  submitVaultSecret,
} from "./vault-secret-prompt-flow.ts";

function promptMessage(overrides: Record<string, unknown> = {}): WsMessage {
  return {
    id: "m1",
    type: "vault.secret.prompt",
    timestamp: "2026-07-29T18:00:00.000Z",
    payload: {
      session_id: "sess-1",
      request_id: "req-1",
      prompt: "Enter your OpenAI API key.",
      vault_key: "OPENAI_API_KEY",
      ...overrides,
    },
  };
}

function advertiseVaultCapability(on: boolean): void {
  sessionState.setAdvertisedCapabilities(on ? [AGODESK_VAULT_SECRET_PROMPT_CAPABILITY] : []);
}

function collectSent(): { sent: WsMessage[]; wsSend: (m: WsMessage) => Promise<void> } {
  const sent: WsMessage[] = [];
  return {
    sent,
    wsSend: (m: WsMessage) => {
      sent.push(m);
      return Promise.resolve();
    },
  };
}

test.beforeEach(() => {
  resetVaultSecretPrompt();
  sessionState.reset();
});

test("agodeskClientCapabilities advertises vault.secret.prompt", () => {
  assert.ok(agodeskClientCapabilities().includes(AGODESK_VAULT_SECRET_PROMPT_CAPABILITY));
});

test("hasAdvertisedVaultSecretPrompt detects the capability", () => {
  assert.equal(hasAdvertisedVaultSecretPrompt(["vault.secret.prompt"]), true);
  assert.equal(hasAdvertisedVaultSecretPrompt(["chat.sessions"]), false);
});

test("normalizeVaultSecretPromptPayload accepts valid + camelCase, rejects incomplete", () => {
  const ok = normalizeVaultSecretPromptPayload({
    sessionId: "s",
    requestId: "r",
    prompt: "p",
    vaultKey: "K",
  });
  assert.deepEqual(ok, { session_id: "s", request_id: "r", prompt: "p", vault_key: "K" });

  assert.equal(normalizeVaultSecretPromptPayload({ session_id: "s", request_id: "r" }), null);
  assert.equal(normalizeVaultSecretPromptPayload(null), null);
});

test("normalizeVaultSecretPromptPayload truncates overly long prompts", () => {
  const long = "x".repeat(VAULT_SECRET_PROMPT_MAX_CHARS + 500);
  const result = normalizeVaultSecretPromptPayload({
    session_id: "s",
    request_id: "r",
    prompt: long,
    vault_key: "K",
  });
  assert.equal(result?.prompt.length, VAULT_SECRET_PROMPT_MAX_CHARS);
});

test("normalizeVaultSecretAckPayload validates status", () => {
  assert.equal(
    normalizeVaultSecretAckPayload({ session_id: "s", request_id: "r", status: "stored" })?.status,
    "stored",
  );
  assert.equal(
    normalizeVaultSecretAckPayload({ session_id: "s", request_id: "r", status: "bogus" }),
    null,
  );
});

test("prompt is dropped when capability is not advertised", () => {
  advertiseVaultCapability(false);
  assert.equal(handleVaultSecretPromptMessage(promptMessage()), false);
  assert.equal(get(vaultSecretPromptState).request, null);
});

test("prompt opens the store when capability is advertised", () => {
  advertiseVaultCapability(true);
  assert.equal(handleVaultSecretPromptMessage(promptMessage()), true);
  const state = get(vaultSecretPromptState);
  assert.equal(state.request?.requestId, "req-1");
  assert.equal(state.request?.vaultKey, "OPENAI_API_KEY");
  assert.equal(state.busy, false);
});

test("a newer prompt replaces the previous pending one", () => {
  advertiseVaultCapability(true);
  handleVaultSecretPromptMessage(promptMessage());
  handleVaultSecretPromptMessage(promptMessage({ request_id: "req-2", vault_key: "OTHER_KEY" }));
  assert.equal(get(vaultSecretPromptState).request?.requestId, "req-2");
});

test("submit sends value once and marks the dialog busy", async () => {
  advertiseVaultCapability(true);
  handleVaultSecretPromptMessage(promptMessage());
  const { sent, wsSend } = collectSent();

  await submitVaultSecret(wsSend, "sk-secret-123");

  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "vault.secret.submit");
  const payload = sent[0].payload as Record<string, unknown>;
  assert.equal(payload.request_id, "req-1");
  assert.equal(payload.vault_key, "OPENAI_API_KEY");
  assert.equal(payload.value, "sk-secret-123");
  // Dialog stays open (busy) until the server acks.
  assert.equal(get(vaultSecretPromptState).busy, true);
  assert.notEqual(get(vaultSecretPromptState).request, null);
});

test("ack closes the dialog for the matching request only", async () => {
  advertiseVaultCapability(true);
  handleVaultSecretPromptMessage(promptMessage());
  const { wsSend } = collectSent();
  await submitVaultSecret(wsSend, "sk-secret-123");

  // Stale ack for a different request must not close the dialog.
  handleVaultSecretAckMessage({ session_id: "sess-1", request_id: "other", status: "stored" });
  assert.notEqual(get(vaultSecretPromptState).request, null);

  handleVaultSecretAckMessage({
    session_id: "sess-1",
    request_id: "req-1",
    status: "stored",
    vault_key: "OPENAI_API_KEY",
  });
  assert.equal(get(vaultSecretPromptState).request, null);
});

test("cancel sends vault.secret.cancel and closes the dialog immediately", async () => {
  advertiseVaultCapability(true);
  handleVaultSecretPromptMessage(promptMessage());
  const { sent, wsSend } = collectSent();

  await cancelVaultSecret(wsSend);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "vault.secret.cancel");
  const payload = sent[0].payload as Record<string, unknown>;
  assert.equal(payload.request_id, "req-1");
  assert.equal("value" in payload, false);
  assert.equal(get(vaultSecretPromptState).request, null);
});

test("submit is a no-op without a pending prompt", async () => {
  const { sent, wsSend } = collectSent();
  await submitVaultSecret(wsSend, "sk");
  assert.equal(sent.length, 0);
});
