import test from "node:test";
import assert from "node:assert/strict";
import { buildPersonaAssetUrlCandidates } from "./persona-asset-fetch.ts";

const SERVER = "wss://192.168.6.238:8443/api/agodesk/ws";

test("buildPersonaAssetUrlCandidates stellt icon_key-Pfade vor die gelieferte URL", () => {
  const candidates = buildPersonaAssetUrlCandidates(SERVER, {
    providedUrl: "/img/personas/thinkerler.png?v=20260502-persona-refresh",
    iconKey: "custom",
    persona: "thinkerler",
    kind: "avatar",
    assetVersion: "20260502-persona-refresh",
  });

  assert.equal(candidates[0], "https://192.168.6.238:8443/img/personas/custom.png");
  assert.ok(candidates.includes("https://192.168.6.238:8443/img/personas/thinkerler.png"));
  assert.ok(
    candidates.includes(
      "https://192.168.6.238:8443/img/personas/thinkerler.png?v=20260502-persona-refresh",
    ),
  );
});

test("buildPersonaAssetUrlCandidates versucht thinker.png zuerst ohne veraltetes v", () => {
  const candidates = buildPersonaAssetUrlCandidates(SERVER, {
    providedUrl: "/img/personas/thinker.png?v=20260502-persona-refresh",
    iconKey: "thinker",
    persona: "thinker",
    kind: "avatar",
    assetVersion: "20260502-persona-refresh",
  });

  assert.equal(candidates[0], "https://192.168.6.238:8443/img/personas/thinker.png");
  assert.ok(
    candidates.includes(
      "https://192.168.6.238:8443/img/personas/thinker.png?v=20260502-persona-refresh",
    ),
  );
  assert.ok(candidates.includes("https://192.168.6.238:8443/img/personas/custom.png"));
});

test("buildPersonaAssetUrlCandidates nutzt custom.png wenn keine URL kommt", () => {
  const candidates = buildPersonaAssetUrlCandidates(SERVER, {
    providedUrl: "",
    iconKey: "custom",
    persona: "thinkerler",
    kind: "avatar",
  });

  assert.deepEqual(candidates, [
    "https://192.168.6.238:8443/img/personas/custom.png",
    "https://192.168.6.238:8443/img/personas/thinkerler.png",
  ]);
});

test("buildPersonaAssetUrlCandidates mappt Icons auf /img/persona-icons", () => {
  const candidates = buildPersonaAssetUrlCandidates(SERVER, {
    providedUrl: "/img/persona-icons/thinkerler.png",
    iconKey: "custom",
    persona: "thinkerler",
    kind: "icon",
  });

  assert.equal(candidates[0], "https://192.168.6.238:8443/img/persona-icons/custom.png");
  assert.ok(candidates.includes("https://192.168.6.238:8443/img/persona-icons/thinkerler.png"));
});

test("buildPersonaAssetUrlCandidates ignoriert unsichere icon_key-Werte", () => {
  const candidates = buildPersonaAssetUrlCandidates(SERVER, {
    providedUrl: "",
    iconKey: "../secret",
    persona: "thinkerler",
    kind: "avatar",
  });

  assert.deepEqual(candidates, [
    "https://192.168.6.238:8443/img/personas/thinkerler.png",
    "https://192.168.6.238:8443/img/personas/custom.png",
  ]);
});
