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

export async function startOAuthLoopbackListener(
  options: OAuthListenerStartOptions = {},
): Promise<OAuthListenerStartResult> {
  return invoke<OAuthListenerStartResult>("oauth_start_listener", {
    port: options.port ?? null,
    path: options.path ?? null,
    providerId: options.providerId ?? null,
  });
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
  return listen<OAuthCallbackEvent>("agodesk:oauth-callback", (event) => {
    handler(event.payload);
  });
}
