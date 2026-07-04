import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface OAuthListenerStartOptions {
  port?: number;
  path?: string;
  providerId?: string;
}

export interface OAuthListenerStartResult {
  redirect_uri: string;
  port: number;
  path: string;
}

export interface OAuthCallbackEvent {
  redirect_url: string;
  provider_id?: string | null;
}

function readStringField(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function normalizeOAuthListenerStartResult(raw: unknown): OAuthListenerStartResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("OAuth loopback listener returned an invalid response.");
  }
  const record = raw as Record<string, unknown>;
  const redirectUri = readStringField(record, "redirect_uri", "redirectUri");
  if (!redirectUri) {
    throw new Error("OAuth loopback listener did not return redirect_uri.");
  }
  const portRaw = record.port;
  const port = typeof portRaw === "number" ? portRaw : Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("OAuth loopback listener returned an invalid port.");
  }
  const path = readStringField(record, "path") || "/oauth/callback";
  return {
    redirect_uri: redirectUri,
    port,
    path,
  };
}

export function normalizeOAuthCallbackEvent(raw: unknown): OAuthCallbackEvent {
  if (!raw || typeof raw !== "object") {
    throw new Error("OAuth callback event payload is invalid.");
  }
  const record = raw as Record<string, unknown>;
  const redirectUrl = readStringField(record, "redirect_url", "redirectUrl");
  if (!redirectUrl) {
    throw new Error("OAuth callback event did not include redirect_url.");
  }
  const providerId = readStringField(record, "provider_id", "providerId");
  return {
    redirect_url: redirectUrl,
    ...(providerId ? { provider_id: providerId } : {}),
  };
}

export async function startOAuthLoopbackListener(
  options: OAuthListenerStartOptions = {},
): Promise<OAuthListenerStartResult> {
  const raw = await invoke<unknown>("oauth_start_listener", {
    port: options.port ?? null,
    path: options.path ?? null,
    providerId: options.providerId ?? null,
  });
  return normalizeOAuthListenerStartResult(raw);
}

export async function stopOAuthLoopbackListener(): Promise<void> {
  try {
    await invoke("oauth_stop_listener");
  } catch {
    // ignore if not running
  }
}

export async function listenForOAuthCallback(
  handler: (event: OAuthCallbackEvent) => void,
): Promise<UnlistenFn> {
  return listen<unknown>("agodesk:oauth-callback", (event) => {
    handler(normalizeOAuthCallbackEvent(event.payload));
  });
}
