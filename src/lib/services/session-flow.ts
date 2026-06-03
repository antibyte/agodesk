import {
  clearCredentialsForOrigin,
  clearPairingToken,
  loadDeviceId,
  loadPairingToken,
  loadSharedKey,
  saveDeviceId,
  savePairingToken,
  saveSharedKey,
} from "./credentials";
import {
  buildPairingSessionStart,
  buildReconnectSessionStart,
} from "./pairing";
import type { NativeWebSocketService } from "./websocket";
import type {
  SystemConnectedPayload,
  WsMessage,
  DesktopCommandPayload,
} from "../types/protocol";
import { requiresRemoteControlBanner } from "../types/protocol";
import {
  getWsOrigin,
  isInsecureLoopbackUrl,
  isPairingRequired,
  normalizeSessionAcceptedPayload,
} from "../types/protocol";
import { sessionState } from "../stores/session";

export async function handleSystemConnected(
  ws: NativeWebSocketService,
  payload: SystemConnectedPayload,
  serverUrl: string,
): Promise<void> {
  const loopbackFromUrl = isInsecureLoopbackUrl(serverUrl);
  const loopbackAllowed =
    loopbackFromUrl && payload.allows_insecure_loopback !== false;

  if (loopbackAllowed) {
    if (payload.session_id) {
      sessionState.setConnectionSession(payload.session_id);
    }
    sessionState.setStatus("loopback");
    return;
  }

  if (!isPairingRequired(payload)) {
    if (payload.session_id) {
      sessionState.setConnectionSession(payload.session_id);
    }
    sessionState.setStatus("accepted");
    return;
  }

  const origin = getWsOrigin(serverUrl);
  const deviceId = await loadDeviceId(origin);
  if (deviceId) {
    const sharedKey = await loadSharedKey(deviceId);
    if (sharedKey) {
      await sendReconnectSessionStart(ws, deviceId, sharedKey);
      return;
    }
  }

  const savedToken = await loadPairingToken(origin);
  if (savedToken) {
    await sendPairingSessionStart(ws, savedToken, serverUrl);
    return;
  }

  sessionState.setStatus("awaiting_pairing");
}

export async function sendPairingSessionStart(
  ws: NativeWebSocketService,
  pairingToken: string,
  serverUrl: string,
): Promise<void> {
  if (!pairingToken.trim()) {
    sessionState.setStatus("error", "Pairing-Token fehlt.");
    return;
  }

  await savePairingToken(serverUrl, pairingToken);
  sessionState.setStatus("pairing");
  await ws.send(await buildPairingSessionStart(pairingToken));
}

export async function sendReconnectSessionStart(
  ws: NativeWebSocketService,
  deviceId: string,
  sharedKey: string,
): Promise<void> {
  sessionState.setStatus("pairing");
  sessionState.setDeviceId(deviceId);
  const message = await buildReconnectSessionStart(deviceId, sharedKey);
  await ws.send(message);
}

export async function handleSessionAccepted(
  payload: unknown,
  serverUrl: string,
): Promise<void> {
  const normalized = normalizeSessionAcceptedPayload(payload);
  if (!normalized) {
    sessionState.setStatus(
      "error",
      "Ungueltige session.accepted-Antwort vom Server.",
    );
    return;
  }

  const origin = getWsOrigin(serverUrl);
  const existingKey = await loadSharedKey(normalized.device_id);

  await saveDeviceId(origin, normalized.device_id);

  if (normalized.shared_key) {
    try {
      await saveSharedKey(normalized.device_id, normalized.shared_key);
      const verified = await loadSharedKey(normalized.device_id);
      if (!verified) {
        sessionState.setStatus(
          "error",
          "Shared Key konnte nicht gespeichert werden. Bitte erneut paaren.",
        );
        return;
      }
    } catch (error) {
      sessionState.setStatus(
        "error",
        error instanceof Error
          ? error.message
          : "Shared Key konnte nicht gespeichert werden.",
      );
      return;
    }
    await clearPairingToken(origin);
  } else if (!existingKey && !(await loadSharedKey(normalized.device_id))) {
    sessionState.setStatus(
      "error",
      "Wiederverbindung ohne gespeicherten Shared Key. Bitte erneut mit Pairing-Token paaren.",
    );
    return;
  }

  if (!normalized.session_id.trim()) {
    sessionState.setStatus(
      "error",
      "session.accepted ohne session_id.",
    );
    return;
  }

  sessionState.setAcceptedSession(normalized.session_id, normalized.device_id);
  sessionState.setAdvertisedCapabilities(
    normalized.advertised_capabilities ?? normalized.capabilities ?? [],
  );
  sessionState.setStatus("accepted");
}

export async function handleSessionError(message: string): Promise<void> {
  sessionState.setStatus("error", message);
}

export async function retryStoredPairing(
  ws: NativeWebSocketService,
  serverUrl: string,
): Promise<void> {
  const origin = getWsOrigin(serverUrl);
  const deviceId = await loadDeviceId(origin);
  if (deviceId) {
    const sharedKey = await loadSharedKey(deviceId);
    if (sharedKey) {
      await sendReconnectSessionStart(ws, deviceId, sharedKey);
      return;
    }
  }

  const savedToken = await loadPairingToken(origin);
  if (savedToken) {
    await sendPairingSessionStart(ws, savedToken, serverUrl);
    return;
  }

  sessionState.setStatus("awaiting_pairing");
}

export async function unpairDevice(serverUrl: string): Promise<void> {
  await clearCredentialsForOrigin(serverUrl);
  sessionState.setStatus("awaiting_pairing");
}

export function handleDesktopCommand(message: WsMessage<DesktopCommandPayload>): void {
  if (requiresRemoteControlBanner(message.payload.operation)) {
    sessionState.setRemoteControlPending(true);
  }
}
