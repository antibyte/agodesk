import test from "node:test";
import assert from "node:assert/strict";
import { buildPersonaAssetsRequest } from "./persona-flow.ts";

test("buildPersonaAssetsRequest enthaelt session_id", () => {
  const message = buildPersonaAssetsRequest("agodesk:dev:abc123");
  assert.equal(message.type, "persona.assets.request");
  assert.equal(message.payload.session_id, "agodesk:dev:abc123");
  assert.match(message.id, /^[0-9a-f-]{36}$/i);
  assert.match(message.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});
