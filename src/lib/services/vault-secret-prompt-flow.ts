import { get } from "svelte/store";
import { sessionState } from "../stores/session";
import { vaultSecretPromptState } from "../stores/vault-secret-prompt";
import type {
  VaultSecretCancelPayload,
  VaultSecretSubmitPayload,
  WsMessage,
} from "../types/protocol";
import {
  hasAdvertisedVaultSecretPrompt,
  normalizeVaultSecretAckPayload,
  normalizeVaultSecretPromptPayload,
} from "../types/protocol";

type WsSend = (message: WsMessage) => Promise<void>;

function buildVaultSecretSubmitMessage(payload: VaultSecretSubmitPayload): WsMessage {
  return {
    id: crypto.randomUUID(),
    type: "vault.secret.submit",
    timestamp: new Date().toISOString(),
    payload,
  };
}

function buildVaultSecretCancelMessage(payload: VaultSecretCancelPayload): WsMessage {
  return {
    id: crypto.randomUUID(),
    type: "vault.secret.cancel",
    timestamp: new Date().toISOString(),
    payload,
  };
}

/**
 * Handle an incoming `vault.secret.prompt`. Opens the masked input dialog.
 * Silently dropped when the capability was not negotiated (defensive).
 */
export function handleVaultSecretPromptMessage(message: WsMessage): boolean {
  const payload = normalizeVaultSecretPromptPayload(message.payload);
  if (!payload) {
    return false;
  }
  if (!hasAdvertisedVaultSecretPrompt(get(sessionState).advertisedCapabilities)) {
    return false;
  }
  vaultSecretPromptState.open({
    requestId: payload.request_id,
    sessionId: payload.session_id,
    prompt: payload.prompt,
    vaultKey: payload.vault_key,
  });
  return true;
}

/** Handle `vault.secret.ack`: close the dialog for the matching request. */
export function handleVaultSecretAckMessage(payload: unknown): boolean {
  const normalized = normalizeVaultSecretAckPayload(payload);
  if (!normalized) {
    return false;
  }
  vaultSecretPromptState.close(normalized.request_id);
  return true;
}

/**
 * Send the entered secret to the server for vault storage. The value is only
 * ever passed here and never persisted or logged on the client. The dialog
 * stays open (busy) until the server replies with `vault.secret.ack`.
 */
export async function submitVaultSecret(wsSend: WsSend, value: string): Promise<void> {
  const { request } = get(vaultSecretPromptState);
  if (!request) {
    return;
  }
  vaultSecretPromptState.setBusy(true);
  try {
    await wsSend(
      buildVaultSecretSubmitMessage({
        session_id: request.sessionId,
        request_id: request.requestId,
        vault_key: request.vaultKey,
        value,
      }),
    );
  } catch (error) {
    vaultSecretPromptState.setBusy(false);
    throw error;
  }
}

/** Cancel the current prompt and close the dialog immediately. */
export async function cancelVaultSecret(wsSend: WsSend): Promise<void> {
  const { request } = get(vaultSecretPromptState);
  if (!request) {
    return;
  }
  const message = buildVaultSecretCancelMessage({
    session_id: request.sessionId,
    request_id: request.requestId,
  });
  vaultSecretPromptState.close(request.requestId);
  try {
    await wsSend(message);
  } catch {
    // Dialog already closed locally; a failed cancel notification is non-fatal.
  }
}

/** Drop any pending prompt (e.g. on disconnect / session clear). */
export function resetVaultSecretPrompt(): void {
  vaultSecretPromptState.reset();
}
