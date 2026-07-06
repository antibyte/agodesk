import test from "node:test";
import assert from "node:assert/strict";
import { deriveCompanionState } from "./companion-state.ts";
import { INITIAL_SPEECH_STATE } from "../types/speech.ts";

test("returns error when speech or connection fails", () => {
  assert.equal(
    deriveCompanionState({
      connectionStatus: "connected",
      sessionStatus: "accepted",
      requestInFlight: false,
      speech: { ...INITIAL_SPEECH_STATE, status: "error", errorMessage: "mic" },
    }),
    "error",
  );
});

test("returns thinking while a chat request is in flight", () => {
  assert.equal(
    deriveCompanionState({
      connectionStatus: "connected",
      sessionStatus: "accepted",
      requestInFlight: true,
      speech: INITIAL_SPEECH_STATE,
    }),
    "thinking",
  );
});

test("returns listening when speech session is active", () => {
  assert.equal(
    deriveCompanionState({
      connectionStatus: "connected",
      sessionStatus: "accepted",
      requestInFlight: false,
      speech: { ...INITIAL_SPEECH_STATE, status: "listening", isActive: true },
    }),
    "listening",
  );
});

test("returns speaking when TTS is active", () => {
  assert.equal(
    deriveCompanionState({
      connectionStatus: "connected",
      sessionStatus: "accepted",
      requestInFlight: false,
      speech: { ...INITIAL_SPEECH_STATE, status: "speaking", isActive: true },
    }),
    "speaking",
  );
});

test("returns disconnected when not connected", () => {
  assert.equal(
    deriveCompanionState({
      connectionStatus: "disconnected",
      sessionStatus: "idle",
      requestInFlight: false,
      speech: INITIAL_SPEECH_STATE,
    }),
    "disconnected",
  );
});
