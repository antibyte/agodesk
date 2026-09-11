import { personaState, type PersonaState } from "../stores/persona";
import type { NativeWebSocketService } from "./websocket";
import type { PersonaAssetsRequestPayload, WsMessage } from "../types/protocol";
import { normalizePersonaAssetsPayload } from "../types/protocol";
import {
  buildPersonaAssetUrlCandidates,
  fetchFirstPersonaAssetDisplayUrl,
} from "./persona-asset-fetch";
import { writePersonaDebug } from "./persona-debug";

let personaLoadingTimeout: ReturnType<typeof setTimeout> | null = null;
let missingPersonaImageRefreshDone = false;

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
    const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    void writePersonaDebug({
      stage: "normalize-failed",
      serverUrl,
      payloadKeys: Object.keys(record),
      fieldTypes: {
        session_id: typeof (record.session_id ?? record.sessionId),
        persona: typeof record.persona,
        icon_key: typeof (record.icon_key ?? record.iconKey),
        avatar_image_url: typeof (record.avatar_image_url ?? record.avatarImageUrl),
        icon_url: typeof (record.icon_url ?? record.iconUrl),
        asset_version: typeof (record.asset_version ?? record.assetVersion),
      },
    });
    clearPersonaLoadingTimeout();
    personaState.setLoading(false);
    return false;
  }

  const avatarCandidates = buildPersonaAssetUrlCandidates(serverUrl, {
    providedUrl: normalized.avatar_image_url,
    iconKey: normalized.icon_key,
    persona: normalized.persona,
    kind: "avatar",
    assetVersion: normalized.asset_version,
  });
  const iconCandidates = buildPersonaAssetUrlCandidates(serverUrl, {
    providedUrl: normalized.icon_url,
    iconKey: normalized.icon_key,
    persona: normalized.persona,
    kind: "icon",
    assetVersion: normalized.asset_version,
  });

  const [avatarResult, iconResult] = await Promise.all([
    fetchFirstPersonaAssetDisplayUrl(serverUrl, avatarCandidates),
    fetchFirstPersonaAssetDisplayUrl(serverUrl, iconCandidates),
  ]);

  const avatarUrl = avatarResult.dataUrl || iconResult.dataUrl;
  const iconUrl = iconResult.dataUrl || avatarResult.dataUrl;
  personaState.setAssets({
    persona: normalized.persona,
    iconKey: normalized.icon_key,
    avatarUrl,
    avatarFallbackUrl: avatarResult.assetUrl || iconResult.assetUrl,
    iconUrl,
    iconFallbackUrl: iconResult.assetUrl || avatarResult.assetUrl,
    personaPrompt: normalized.persona_prompt ?? "",
    assetVersion: normalized.asset_version,
  });
  void writePersonaDebug({
    stage: "applied",
    serverUrl,
    persona: normalized.persona,
    iconKey: normalized.icon_key,
    providedAvatar: normalized.avatar_image_url,
    providedIcon: normalized.icon_url,
    assetVersion: normalized.asset_version,
    avatarCandidates,
    iconCandidates,
    avatarFetched: Boolean(avatarResult.dataUrl),
    iconFetched: Boolean(iconResult.dataUrl),
    avatarFetchedLen: avatarResult.dataUrl.length,
    iconFetchedLen: iconResult.dataUrl.length,
    avatarAssetUrl: avatarResult.assetUrl,
    iconAssetUrl: iconResult.assetUrl,
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

export function refreshPersonaAssetsIfMissing(
  ws: NativeWebSocketService,
  sessionId: string,
  state: PersonaState,
): void {
  if (missingPersonaImageRefreshDone) {
    return;
  }
  if (!sessionId.trim() || !state.persona.trim() || state.loading) {
    return;
  }
  if (state.avatarUrl.trim() || state.iconUrl.trim()) {
    return;
  }
  missingPersonaImageRefreshDone = true;
  void writePersonaDebug({
    stage: "refresh-missing",
    sessionId,
    persona: state.persona,
    iconKey: state.iconKey,
  });
  void requestPersonaAssets(ws, sessionId);
}

export function clearPersonaAssets(): void {
  missingPersonaImageRefreshDone = false;
  clearPersonaLoadingTimeout();
  personaState.reset();
}
