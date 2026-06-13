import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { buildReconnectSessionStart, computeSharedKeyProof } from "./pairing.ts";

function signSharedKeyProofLikeGo(
  sharedKey: string,
  envelopeId: string,
  deviceId: string,
  nonce: string,
  timestamp: string,
): string {
  const trimmed = sharedKey.trim();
  const key =
    /^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0
      ? Buffer.from(trimmed, "hex")
      : Buffer.from(trimmed, "utf8");

  return createHmac("sha256", key)
    .update("agodesk.v1")
    .update("\nsession.start\n")
    .update(envelopeId)
    .update("\n")
    .update(deviceId)
    .update("\n")
    .update(nonce)
    .update("\n")
    .update(timestamp)
    .digest("hex");
}

test("AuraGo HMAC Proof ist stabil", async () => {
  const proof = await computeSharedKeyProof(
    "00112233445566778899aabbccddeeff",
    "msg-123",
    "dev-456",
    "nonce-789",
    "2026-05-24T12:00:00.000Z",
  );
  const again = await computeSharedKeyProof(
    "00112233445566778899aabbccddeeff",
    "msg-123",
    "dev-456",
    "nonce-789",
    "2026-05-24T12:00:00.000Z",
  );
  assert.equal(proof, again);
  assert.match(proof, /^[0-9a-f]{64}$/);
});

test("Reconnect session.start nutzt AuraGo SharedKeyProof-Felder", async () => {
  const message = await buildReconnectSessionStart("dev-456", "00112233445566778899aabbccddeeff");

  assert.equal(message.type, "session.start");
  assert.equal(message.payload.device_id, "dev-456");
  assert.equal(typeof message.payload.shared_key_proof, "object");
  assert.match(message.payload.shared_key_proof.nonce, /^[0-9a-f-]{36}$/i);
  assert.match(message.payload.shared_key_proof.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(message.payload.shared_key_proof.hmac, /^[0-9a-f]{64}$/);

  const expected = await computeSharedKeyProof(
    "00112233445566778899aabbccddeeff",
    message.id,
    message.payload.device_id,
    message.payload.shared_key_proof.nonce,
    message.payload.shared_key_proof.timestamp,
  );
  assert.equal(message.payload.shared_key_proof.hmac, expected);
});

test("HMAC entspricht AuraGo signSharedKeyProof", async () => {
  const sharedKey = "00112233445566778899aabbccddeeff";
  const envelopeId = "msg-123";
  const deviceId = "dev-456";
  const nonce = "nonce-789";
  const timestamp = "2026-05-24T12:00:00.000Z";

  const fromClient = await computeSharedKeyProof(sharedKey, envelopeId, deviceId, nonce, timestamp);
  const fromGo = signSharedKeyProofLikeGo(sharedKey, envelopeId, deviceId, nonce, timestamp);

  assert.equal(fromClient, fromGo);
});

test("HMAC akzeptiert rohen String-Key wenn kein gueltiges Hex", async () => {
  const sharedKey = "plain-text-key";
  const envelopeId = "msg-123";
  const deviceId = "dev-456";
  const nonce = "nonce-789";
  const timestamp = "2026-05-24T12:00:00.000Z";

  const fromClient = await computeSharedKeyProof(sharedKey, envelopeId, deviceId, nonce, timestamp);
  const fromGo = signSharedKeyProofLikeGo(sharedKey, envelopeId, deviceId, nonce, timestamp);

  assert.equal(fromClient, fromGo);
});
