import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSigningEnv,
  normalizePrivateKey,
  toTauriKeyEnvValue,
  validateTauriSigningKey,
} from "./release-signing.mjs";

const sampleKey = [
  "untrusted comment: minisign private key: ABCD1234",
  "RWQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
  "trusted comment: ...",
  "signature...",
].join("\n");

test("validateTauriSigningKey accepts well-formed minisign key", () => {
  const result = validateTauriSigningKey(sampleKey, "");
  assert.equal(result.ok, true);
});

test("validateTauriSigningKey rejects key without comment header", () => {
  const result = validateTauriSigningKey("RWQ...base64...", "");
  assert.equal(result.ok, false);
  assert.match(result.reason, /header/i);
});

test("validateTauriSigningKey rejects empty key", () => {
  const result = validateTauriSigningKey("", "");
  assert.equal(result.ok, false);
});

test("validateTauriSigningKey accepts rsign CI key without password", () => {
  const rsignKey = [
    "untrusted comment: rsign encrypted secret key",
    "RWQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
  ].join("\n");
  const result = validateTauriSigningKey(rsignKey, "");
  assert.equal(result.ok, true);
});

test("normalizePrivateKey decodes base64 key file content", () => {
  const decoded = [
    "untrusted comment: rsign encrypted secret key",
    "RWQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
  ].join("\n");
  const encoded = Buffer.from(`${decoded}\n`, "utf8").toString("base64");
  assert.equal(normalizePrivateKey(encoded), decoded);
});

test("normalizePrivateKey repairs single-line secret with space separator", () => {
  const decoded = [
    "untrusted comment: rsign encrypted secret key",
    "RWQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
  ].join("\n");
  const flattened = decoded.replace("\n", " ");
  assert.equal(normalizePrivateKey(flattened), decoded);
});

test("toTauriKeyEnvValue keeps base64 key file secret unchanged", () => {
  const encoded = Buffer.from(
    "untrusted comment: rsign encrypted secret key\nRWQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ\n",
    "utf8",
  ).toString("base64");
  const decoded = normalizePrivateKey(encoded);
  assert.equal(toTauriKeyEnvValue(encoded, decoded), encoded);
});

test("toTauriKeyEnvValue encodes decoded multiline secrets for Tauri", () => {
  const decoded = [
    "untrusted comment: rsign encrypted secret key",
    "RWQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
  ].join("\n");
  const expected = Buffer.from(`${decoded}\n`, "utf8").toString("base64");
  assert.equal(toTauriKeyEnvValue(decoded, decoded), expected);
});

test("buildSigningEnv uses base64 key material without private key path", () => {
  const decoded = [
    "untrusted comment: rsign encrypted secret key",
    "RWQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
  ].join("\n");
  const encoded = Buffer.from(`${decoded}\n`, "utf8").toString("base64");
  const env = buildSigningEnv(encoded, decoded, "");
  assert.equal(env.TAURI_SIGNING_PRIVATE_KEY, encoded);
  assert.equal(env.TAURI_SIGNING_PRIVATE_KEY_PATH, undefined);
});
