import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPersonaAssetsRequest,
  clearPersonaAssets,
  refreshPersonaAssetsIfMissing,
} from "./persona-flow.ts";
import { personaState, type PersonaState } from "../stores/persona.ts";

test("buildPersonaAssetsRequest enthaelt session_id", () => {
  const message = buildPersonaAssetsRequest("agodesk:dev:abc123");
  assert.equal(message.type, "persona.assets.request");
  assert.equal(message.payload.session_id, "agodesk:dev:abc123");
  assert.match(message.id, /^[0-9a-f-]{36}$/i);
  assert.match(message.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

function emptyNamedPersona(): PersonaState {
  return {
    persona: "thinkerler",
    iconKey: "custom",
    avatarUrl: "",
    avatarFallbackUrl: "",
    iconUrl: "",
    iconFallbackUrl: "",
    personaPrompt: "",
    assetVersion: "",
    loading: false,
  };
}

test("refreshPersonaAssetsIfMissing fordert fehlendes Bild nur einmal an", async () => {
  clearPersonaAssets();
  const sent: unknown[] = [];
  const ws = {
    send: async (message: unknown) => {
      sent.push(message);
    },
  };

  refreshPersonaAssetsIfMissing(ws as never, "agodesk:dev:abc123", emptyNamedPersona());
  refreshPersonaAssetsIfMissing(ws as never, "agodesk:dev:abc123", emptyNamedPersona());
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(sent.length, 1);
  assert.equal((sent[0] as { type: string }).type, "persona.assets.request");
  clearPersonaAssets();
  personaState.reset();
});
