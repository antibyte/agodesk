import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import { speechState } from "./speech.ts";

test("clearInboxErrors leert Fehler ohne Status zu setzen", () => {
  speechState.reset();
  speechState.setError("mic");
  speechState.setVadError("vad");
  const before = get(speechState).status;
  speechState.clearInboxErrors();
  const next = get(speechState);
  assert.equal(next.errorMessage, "");
  assert.equal(next.vadError, "");
  assert.equal(next.status, before);
  speechState.reset();
});
