import { get } from "svelte/store";
import type {
  ConfigProvider,
  ConfigProviderCatalogPayload,
  ConfigProviderOauthStartedPayload,
  ConfigProviderOauthStatusPayload,
  ConfigProviderPayload,
  ConfigProviderTestResultPayload,
  ConfigProviderUpsertPayload,
  ConfigProvidersPayload,
  WsMessage,
} from "../types/protocol";
import {
  buildConfigProviderOauthCompletePayload,
  isProviderTestResponsePayload,
  normalizeConfigProviderCatalogPayload,
  normalizeConfigProviderOauthStartedPayload,
  normalizeConfigProviderOauthStatusPayload,
  normalizeConfigProviderPayload,
  normalizeConfigProviderTestResultPayload,
  normalizeConfigProvidersPayload,
} from "../types/protocol";
import { providersState } from "../stores/providers";

const REQUEST_TIMEOUT_MS = 30_000;

type WaiterKind =
  | "catalog"
  | "provider"
  | "providers"
  | "test_result"
  | "oauth_started"
  | "oauth_status";

interface ProviderWaiter<T = unknown> {
  kind: WaiterKind;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const waiters = new Map<string, ProviderWaiter>();

function registerWaiter<T>(requestId: string, kind: WaiterKind): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(requestId);
      reject(new Error(`Provider request timed out (${kind}).`));
    }, REQUEST_TIMEOUT_MS);
    waiters.set(requestId, {
      kind,
      resolve: resolve as (value: unknown) => void,
      reject,
      timer,
    });
  });
}

function resolveWaiter<T>(requestId: string, kind: WaiterKind, value: T): boolean {
  const waiter = waiters.get(requestId);
  if (waiter && waiter.kind === kind) {
    clearTimeout(waiter.timer);
    waiters.delete(requestId);
    waiter.resolve(value);
    return true;
  }

  for (const [id, pending] of waiters.entries()) {
    if (pending.kind !== kind) {
      continue;
    }
    clearTimeout(pending.timer);
    waiters.delete(id);
    pending.resolve(value);
    return true;
  }

  return false;
}

function rejectWaiterByKind(kind: WaiterKind, error: Error): boolean {
  for (const requestId of [...waiters.keys()]) {
    const pending = waiters.get(requestId);
    if (pending?.kind !== kind) {
      continue;
    }
    if (kind === "test_result") {
      providersState.setTestLoadingProviderId(null);
    }
    rejectWaiter(requestId, error);
    return true;
  }
  return false;
}

export function rejectProviderWaiterByRequestId(
  requestId: string | undefined,
  message: string,
): boolean {
  if (!requestId || !waiters.has(requestId)) {
    return false;
  }
  const kind = waiters.get(requestId)?.kind;
  if (kind === "test_result") {
    providersState.setTestLoadingProviderId(null);
  }
  rejectWaiter(requestId, new Error(message));
  return true;
}

export function isProviderTestResponseMessage(message: WsMessage): boolean {
  if (message.type === "config.provider.test_result") {
    return true;
  }
  if (message.type === "config.provider.test") {
    return isProviderTestResponsePayload(message.payload);
  }
  return false;
}

function rejectWaiter(requestId: string, error: Error): void {
  const waiter = waiters.get(requestId);
  if (!waiter) {
    return;
  }
  clearTimeout(waiter.timer);
  waiters.delete(requestId);
  waiter.reject(error);
}

export function rejectAnyPendingProviderWaiters(error: Error): boolean {
  if (waiters.size === 0) {
    return false;
  }
  for (const requestId of [...waiters.keys()]) {
    rejectWaiter(requestId, error);
  }
  providersState.setLoading(false);
  providersState.setCatalogLoading(false);
  providersState.setTestLoadingProviderId(null);
  providersState.setOauthPending(null);
  return true;
}

export function buildConfigProvidersListMessage(sessionId: string): WsMessage {
  return {
    id: crypto.randomUUID(),
    type: "config.providers.list",
    timestamp: new Date().toISOString(),
    payload: { session_id: sessionId },
  };
}

export function buildConfigProviderGetMessage(sessionId: string, providerId: string): WsMessage {
  const id = crypto.randomUUID();
  return {
    id,
    type: "config.provider.get",
    timestamp: new Date().toISOString(),
    payload: { session_id: sessionId, provider_id: providerId },
  };
}

export function buildConfigProviderCatalogListMessage(sessionId: string): WsMessage {
  return {
    id: crypto.randomUUID(),
    type: "config.provider.catalog.list",
    timestamp: new Date().toISOString(),
    payload: { session_id: sessionId, include_models: false },
  };
}

export function buildConfigProviderCatalogDetailMessage(
  sessionId: string,
  providerId: string,
): WsMessage {
  const id = crypto.randomUUID();
  return {
    id,
    type: "config.provider.catalog.detail",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: sessionId,
      provider_id: providerId,
      include_models: true,
    },
  };
}

export function buildConfigProviderUpsertMessage(payload: ConfigProviderUpsertPayload): WsMessage {
  const id = crypto.randomUUID();
  return {
    id,
    type: "config.provider.upsert",
    timestamp: new Date().toISOString(),
    payload,
  };
}

export function buildConfigProviderDeleteMessage(
  sessionId: string,
  providerId: string,
  force = false,
): WsMessage {
  const id = crypto.randomUUID();
  return {
    id,
    type: "config.provider.delete",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: sessionId,
      provider_id: providerId,
      ...(force ? { force: true } : {}),
    },
  };
}

export function buildConfigProviderTestMessage(sessionId: string, providerId: string): WsMessage {
  const id = crypto.randomUUID();
  return {
    id,
    type: "config.provider.test",
    timestamp: new Date().toISOString(),
    payload: { session_id: sessionId, provider_id: providerId },
  };
}

export function buildConfigProviderOauthStartMessage(
  sessionId: string,
  providerId: string,
  redirectUri: string,
): WsMessage {
  const id = crypto.randomUUID();
  return {
    id,
    type: "config.provider.oauth.start",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: sessionId,
      provider_id: providerId,
      redirect_uri: redirectUri,
    },
  };
}

export function buildConfigProviderOauthCompleteMessage(
  sessionId: string,
  providerId: string,
  redirectUrl: string,
): WsMessage {
  const id = crypto.randomUUID();
  return {
    id,
    type: "config.provider.oauth.complete",
    timestamp: new Date().toISOString(),
    payload: buildConfigProviderOauthCompletePayload(sessionId, providerId, redirectUrl),
  };
}

export function buildConfigProviderOauthStatusMessage(
  sessionId: string,
  providerId: string,
): WsMessage {
  const id = crypto.randomUUID();
  return {
    id,
    type: "config.provider.oauth.status",
    timestamp: new Date().toISOString(),
    payload: { session_id: sessionId, provider_id: providerId },
  };
}

export function buildConfigProviderOauthRevokeMessage(
  sessionId: string,
  providerId: string,
): WsMessage {
  const id = crypto.randomUUID();
  return {
    id,
    type: "config.provider.oauth.revoke",
    timestamp: new Date().toISOString(),
    payload: { session_id: sessionId, provider_id: providerId },
  };
}

export function handleConfigProvidersMessage(
  message: WsMessage,
  payload: unknown,
): ConfigProvidersPayload | null {
  const normalized = normalizeConfigProvidersPayload(payload);
  if (!normalized) {
    return null;
  }
  providersState.setProviders(normalized.providers);
  resolveWaiter(message.id, "providers", normalized);
  return normalized;
}

export function handleConfigProviderMessage(
  message: WsMessage,
  payload: unknown,
): ConfigProviderPayload | null {
  const normalized = normalizeConfigProviderPayload(payload);
  if (!normalized) {
    return null;
  }
  providersState.upsertProviderInList(normalized.provider);
  resolveWaiter(message.id, "provider", normalized);
  return normalized;
}

export function handleConfigProviderCatalogMessage(
  message: WsMessage,
  payload: unknown,
): ConfigProviderCatalogPayload | null {
  const normalized = normalizeConfigProviderCatalogPayload(payload);
  if (!normalized) {
    return null;
  }
  providersState.setCatalogPayload(normalized);
  resolveWaiter(message.id, "catalog", normalized);
  return normalized;
}

export function handleConfigProviderTestResultMessage(
  message: WsMessage,
  payload: unknown,
): ConfigProviderTestResultPayload | null {
  const fallbackProviderId = get(providersState).testLoadingProviderId ?? undefined;
  const normalized = normalizeConfigProviderTestResultPayload(payload, { fallbackProviderId });
  if (!normalized) {
    providersState.setTestLoadingProviderId(null);
    rejectWaiterByKind(
      "test_result",
      new Error("Unexpected provider test response from AuraGo."),
    );
    return null;
  }
  providersState.setTestLoadingProviderId(null);
  resolveWaiter(message.id, "test_result", normalized);
  return normalized;
}

export function handleConfigProviderOauthStartedMessage(
  message: WsMessage,
  payload: unknown,
): ConfigProviderOauthStartedPayload | null {
  const normalized = normalizeConfigProviderOauthStartedPayload(payload);
  if (!normalized) {
    return null;
  }
  providersState.setOauthPending(normalized);
  resolveWaiter(message.id, "oauth_started", normalized);
  return normalized;
}

export function handleConfigProviderOauthStatusMessage(
  message: WsMessage,
  payload: unknown,
): ConfigProviderOauthStatusPayload | null {
  const normalized = normalizeConfigProviderOauthStatusPayload(payload);
  if (!normalized) {
    return null;
  }
  providersState.setOauthStatus(normalized);
  resolveWaiter(message.id, "oauth_status", normalized);
  return normalized;
}

export async function fetchConfigProvidersList(
  wsSend: (message: WsMessage) => Promise<void>,
  sessionId: string,
): Promise<ConfigProvidersPayload> {
  providersState.setLoading(true);
  providersState.setError("");
  const message = buildConfigProvidersListMessage(sessionId);
  const waitPromise = registerWaiter<ConfigProvidersPayload>(message.id, "providers");
  await wsSend(message);
  return waitPromise;
}

export async function fetchConfigProviderDetail(
  wsSend: (message: WsMessage) => Promise<void>,
  sessionId: string,
  providerId: string,
): Promise<ConfigProvider> {
  const message = buildConfigProviderGetMessage(sessionId, providerId);
  const waitPromise = registerWaiter<ConfigProviderPayload>(message.id, "provider");
  await wsSend(message);
  const result = await waitPromise;
  return result.provider;
}

export async function fetchConfigProviderCatalogList(
  wsSend: (message: WsMessage) => Promise<void>,
  sessionId: string,
): Promise<ConfigProviderCatalogPayload> {
  providersState.setCatalogLoading(true);
  const message = buildConfigProviderCatalogListMessage(sessionId);
  const waitPromise = registerWaiter<ConfigProviderCatalogPayload>(message.id, "catalog");
  await wsSend(message);
  return waitPromise;
}

export async function fetchConfigProviderCatalogDetail(
  wsSend: (message: WsMessage) => Promise<void>,
  sessionId: string,
  providerId: string,
): Promise<ConfigProviderCatalogPayload> {
  providersState.setCatalogLoading(true);
  const message = buildConfigProviderCatalogDetailMessage(sessionId, providerId);
  const waitPromise = registerWaiter<ConfigProviderCatalogPayload>(message.id, "catalog");
  await wsSend(message);
  return waitPromise;
}

export async function upsertConfigProvider(
  wsSend: (message: WsMessage) => Promise<void>,
  payload: ConfigProviderUpsertPayload,
): Promise<ConfigProvider> {
  const message = buildConfigProviderUpsertMessage(payload);
  const waitPromise = registerWaiter<ConfigProviderPayload>(message.id, "provider");
  await wsSend(message);
  const result = await waitPromise;
  return result.provider;
}

export async function deleteConfigProvider(
  wsSend: (message: WsMessage) => Promise<void>,
  sessionId: string,
  providerId: string,
  options: { force?: boolean } = {},
): Promise<ConfigProvidersPayload> {
  const message = buildConfigProviderDeleteMessage(sessionId, providerId, options.force ?? false);
  const waitPromise = registerWaiter<ConfigProvidersPayload>(message.id, "providers");
  await wsSend(message);
  const result = await waitPromise;
  providersState.removeProviderFromList(providerId);
  return result;
}

export async function testConfigProvider(
  wsSend: (message: WsMessage) => Promise<void>,
  sessionId: string,
  providerId: string,
): Promise<ConfigProviderTestResultPayload> {
  providersState.setTestLoadingProviderId(providerId);
  const message = buildConfigProviderTestMessage(sessionId, providerId);
  const waitPromise = registerWaiter<ConfigProviderTestResultPayload>(message.id, "test_result");
  try {
    await wsSend(message);
    return await waitPromise;
  } catch (error) {
    providersState.setTestLoadingProviderId(null);
    throw error;
  }
}

export async function startConfigProviderOauth(
  wsSend: (message: WsMessage) => Promise<void>,
  sessionId: string,
  providerId: string,
  redirectUri: string,
): Promise<ConfigProviderOauthStartedPayload> {
  const normalizedRedirectUri = redirectUri.trim();
  if (!normalizedRedirectUri) {
    throw new Error("redirect_uri is required");
  }
  const message = buildConfigProviderOauthStartMessage(
    sessionId,
    providerId,
    normalizedRedirectUri,
  );
  const waitPromise = registerWaiter<ConfigProviderOauthStartedPayload>(
    message.id,
    "oauth_started",
  );
  await wsSend(message);
  return waitPromise;
}

export async function completeConfigProviderOauth(
  wsSend: (message: WsMessage) => Promise<void>,
  sessionId: string,
  providerId: string,
  redirectUrl: string,
): Promise<ConfigProviderOauthStatusPayload> {
  const message = buildConfigProviderOauthCompleteMessage(sessionId, providerId, redirectUrl);
  const waitPromise = registerWaiter<ConfigProviderOauthStatusPayload>(message.id, "oauth_status");
  await wsSend(message);
  return waitPromise;
}

export async function fetchConfigProviderOauthStatus(
  wsSend: (message: WsMessage) => Promise<void>,
  sessionId: string,
  providerId: string,
): Promise<ConfigProviderOauthStatusPayload> {
  const message = buildConfigProviderOauthStatusMessage(sessionId, providerId);
  const waitPromise = registerWaiter<ConfigProviderOauthStatusPayload>(message.id, "oauth_status");
  await wsSend(message);
  return waitPromise;
}

export async function revokeConfigProviderOauth(
  wsSend: (message: WsMessage) => Promise<void>,
  sessionId: string,
  providerId: string,
): Promise<ConfigProviderOauthStatusPayload> {
  const message = buildConfigProviderOauthRevokeMessage(sessionId, providerId);
  const waitPromise = registerWaiter<ConfigProviderOauthStatusPayload>(message.id, "oauth_status");
  await wsSend(message);
  return waitPromise;
}
