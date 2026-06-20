import test from "node:test";
import assert from "node:assert/strict";
import { deriveCompanionPresence } from "./companion-presence.ts";

const base = {
  connectionStatus: "connected" as const,
  sessionStatus: "accepted" as const,
  requestInFlight: false,
  speechActive: false,
};

test("error beats everything", () => {
  const state = deriveCompanionPresence({
    ...base,
    speechErrorMessage: "mic failed",
    requestInFlight: true,
    speechActive: true,
    sessionStatus: "pairing",
  });
  assert.equal(state.tone, "error");
});

test("pairing beats thinking and listening", () => {
  const thinking = deriveCompanionPresence({
    ...base,
    sessionStatus: "awaiting_pairing",
    requestInFlight: true,
  });
  assert.equal(thinking.tone, "blocked");

  const listening = deriveCompanionPresence({
    ...base,
    sessionStatus: "pairing",
    speechActive: true,
  });
  assert.equal(listening.tone, "blocked");
});

test("thinking beats listening", () => {
  const state = deriveCompanionPresence({
    ...base,
    requestInFlight: true,
    speechActive: true,
  });
  assert.equal(state.tone, "thinking");
});

test("listening when connected and accepted", () => {
  const state = deriveCompanionPresence({
    ...base,
    speechActive: true,
  });
  assert.equal(state.tone, "listening");
});

test("offline when disconnected", () => {
  const state = deriveCompanionPresence({
    ...base,
    connectionStatus: "disconnected",
  });
  assert.equal(state.tone, "blocked");
  assert.equal(state.labelKey, "companionPresence.label.offline");
});

test("ready when connected accepted idle", () => {
  const state = deriveCompanionPresence(base);
  assert.equal(state.tone, "ready");
});
