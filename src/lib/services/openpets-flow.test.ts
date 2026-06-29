import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveOpenPetsReaction,
  deriveOpenPetsStatusMessage,
  resolveOpenPetsPetLabel,
  type OpenPetsLifecycleInput,
} from "./openpets-flow.ts";

function baseInput(overrides: Partial<OpenPetsLifecycleInput> = {}): OpenPetsLifecycleInput {
  return {
    enabled: true,
    requestInFlight: false,
    hasActivePlan: false,
    remoteOperation: "",
    speechActive: false,
    reactToSpeech: true,
    connectionError: false,
    sessionError: false,
    requestJustFinished: false,
    requestFailed: false,
    showMessages: false,
    ...overrides,
  };
}

test("deriveOpenPetsReaction mappt Chat-Lebenszyklus", () => {
  assert.equal(deriveOpenPetsReaction(baseInput()), "idle");
  assert.equal(deriveOpenPetsReaction(baseInput({ enabled: false })), "idle");
  assert.equal(deriveOpenPetsReaction(baseInput({ requestInFlight: true })), "thinking");
  assert.equal(
    deriveOpenPetsReaction(baseInput({ requestInFlight: true, hasActivePlan: true })),
    "working",
  );
  assert.equal(deriveOpenPetsReaction(baseInput({ remoteOperation: "shell_exec" })), "running");
  assert.equal(deriveOpenPetsReaction(baseInput({ remoteOperation: "file_write" })), "editing");
  assert.equal(deriveOpenPetsReaction(baseInput({ requestJustFinished: true })), "success");
  assert.equal(deriveOpenPetsReaction(baseInput({ requestFailed: true })), "error");
  assert.equal(
    deriveOpenPetsReaction(baseInput({ speechActive: true, reactToSpeech: true })),
    "waving",
  );
});

test("deriveOpenPetsStatusMessage liefert nur bei showMessages Text", () => {
  assert.equal(
    deriveOpenPetsStatusMessage("thinking", baseInput({ showMessages: true })),
    "Agent denkt nach",
  );
  assert.equal(deriveOpenPetsStatusMessage("thinking", baseInput()), null);
});

test("resolveOpenPetsPetLabel nutzt Katalog-Fallback", () => {
  const pets = [{ id: "cloud-puff", displayName: "Cloud Puff", builtIn: false, broken: false }];
  assert.equal(
    resolveOpenPetsPetLabel({ petId: "cloud-puff", petName: null }, pets, "builtin"),
    "Cloud Puff",
  );
  assert.equal(
    resolveOpenPetsPetLabel({ petId: null, petName: null }, pets, "cloud-puff"),
    "Cloud Puff",
  );
});
