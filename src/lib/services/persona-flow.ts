import { personaState } from "../stores/persona";
import type { NativeWebSocketService } from "./websocket";
import type { PersonaAssetsRequestPayload, WsMessage } from "../types/protocol";
import { normalizePersonaAssetsPayload, resolvePersonaAssetUrl } from "../types/protocol";
import { fetchPersonaAssetDisplayUrl } from "./persona-asset-fetch";

let personaLoadingTimeout: ReturnType<typeof setTimeout> | null = null;

function clearPersonaLoadingTimeout(): void {
  if (personaLoadingTimeout) {
    clearTimeout(personaLoadingTimeout);
    personaLoadingTimeout = null;
  }
}

export function buildPersonaAssetsRequest(
  sessionId: string,
): WsMessage<PersonaAssetsRequestPayload> {
  return {
    id: crypto.randomUUID(),
    type: "persona.assets.request",
    timestamp: new Date().toISOString(),
    payload: { session_id: sessionId },
  };
}

export async function applyPersonaAssets(payload: unknown, serverUrl: string): Promise<boolean> {
  const normalized = normalizePersonaAssetsPayload(payload);
  if (!normalized) {
    clearPersonaLoadingTimeout();
    personaState.setLoading(false);
    return false;
  }

  const avatarRemoteUrl = resolvePersonaAssetUrl(serverUrl, normalized.avatar_image_url);
  const iconRemoteUrl = resolvePersonaAssetUrl(serverUrl, normalized.icon_url);

  const [avatarUrl, iconUrl] = await Promise.all([
    fetchPersonaAssetDisplayUrl(serverUrl, avatarRemoteUrl),
    fetchPersonaAssetDisplayUrl(serverUrl, iconRemoteUrl),
  ]);

  personaState.setAssets({
    persona: normalized.persona,
    iconKey: normalized.icon_key,
    avatarUrl,
    iconUrl,
    personaPrompt: normalized.persona_prompt ?? "",
    assetVersion: normalized.asset_version,
  });
  clearPersonaLoadingTimeout();
  return true;
}

export async function requestPersonaAssets(
  ws: NativeWebSocketService,
  sessionId: string,
): Promise<void> {
  if (!sessionId.trim()) {
    return;
  }
  clearPersonaLoadingTimeout();
  personaState.setLoading(true);
  personaLoadingTimeout = setTimeout(() => {
    personaState.setLoading(false);
    personaLoadingTimeout = null;
  }, 15_000);
  try {
    await ws.send(buildPersonaAssetsRequest(sessionId));
  } catch {
    clearPersonaLoadingTimeout();
    personaState.setLoading(false);
  }
}

export function clearPersonaAssets(): void {
  clearPersonaLoadingTimeout();
  personaState.reset();
}
