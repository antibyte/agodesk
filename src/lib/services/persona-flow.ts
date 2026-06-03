import { personaState } from "../stores/persona";
import type { NativeWebSocketService } from "./websocket";
import type {
  PersonaAssetsRequestPayload,
  WsMessage,
} from "../types/protocol";
import {
  normalizePersonaAssetsPayload,
  resolvePersonaAssetUrl,
} from "../types/protocol";
import { fetchPersonaAssetDisplayUrl } from "./persona-asset-fetch";

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

export async function applyPersonaAssets(
  payload: unknown,
  serverUrl: string,
): Promise<boolean> {
  const normalized = normalizePersonaAssetsPayload(payload);
  if (!normalized) {
    personaState.setLoading(false);
    return false;
  }

  const avatarRemoteUrl = resolvePersonaAssetUrl(
    serverUrl,
    normalized.avatar_image_url,
  );
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
  return true;
}

export async function requestPersonaAssets(
  ws: NativeWebSocketService,
  sessionId: string,
): Promise<void> {
  if (!sessionId.trim()) {
    return;
  }
  personaState.setLoading(true);
  await ws.send(buildPersonaAssetsRequest(sessionId));
}

export function clearPersonaAssets(): void {
  personaState.reset();
}
