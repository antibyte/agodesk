import type { SessionStartPayload, WsMessage } from "../types/protocol";
import { buildSessionStartCommon } from "./session-start";

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sharedKeyBytes(sharedKey: string): Uint8Array {
  const trimmed = sharedKey.trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    const bytes = new Uint8Array(trimmed.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(trimmed.slice(index * 2, index * 2 + 2), 16);
    }
    if (bytes.length > 0) {
      return bytes;
    }
  }
  return new TextEncoder().encode(trimmed);
}

export async function computeSharedKeyProof(
  sharedKey: string,
  envelopeId: string,
  deviceId: string,
  nonce: string,
  timestamp: string,
): Promise<string> {
  const material =
    "agodesk.v1\nsession.start\n" + `${envelopeId}\n${deviceId}\n${nonce}\n${timestamp}`;
  const key = await crypto.subtle.importKey(
    "raw",
    sharedKeyBytes(sharedKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(material));
  return toHex(signature);
}

export async function buildPairingSessionStart(
  pairingToken: string,
): Promise<WsMessage<SessionStartPayload>> {
  const common = await buildSessionStartCommon();
  return {
    id: crypto.randomUUID(),
    type: "session.start",
    timestamp: new Date().toISOString(),
    payload: {
      ...common,
      pairing_token: pairingToken.trim(),
    },
  };
}

export async function buildReconnectSessionStart(
  deviceId: string,
  sharedKey: string,
): Promise<WsMessage<SessionStartPayload>> {
  const common = await buildSessionStartCommon();
  const nonce = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const message: WsMessage<SessionStartPayload> = {
    id: crypto.randomUUID(),
    type: "session.start",
    timestamp: new Date().toISOString(),
    payload: {
      ...common,
      device_id: deviceId,
      shared_key_proof: {
        nonce,
        timestamp,
        hmac: "",
      },
    },
  };

  const reconnectPayload = message.payload as Extract<SessionStartPayload, { device_id: string }>;

  reconnectPayload.shared_key_proof.hmac = await computeSharedKeyProof(
    sharedKey,
    message.id,
    reconnectPayload.device_id,
    reconnectPayload.shared_key_proof.nonce,
    reconnectPayload.shared_key_proof.timestamp,
  );

  return message;
}
