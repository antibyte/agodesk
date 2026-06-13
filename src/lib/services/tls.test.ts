import test from "node:test";
import assert from "node:assert/strict";
import { getWsOrigin, isInsecureLoopbackUrl } from "../types/protocol.ts";
import {
  appendInsecureLoopbackIfNeeded,
  isLoopbackHost,
  normalizeServerUrl,
} from "./server-url.ts";

test("localhost darf insecure_loopback=1 erhalten", () => {
  const url = "ws://127.0.0.1:8080/api/agodesk/ws";
  const next = appendInsecureLoopbackIfNeeded(url);
  assert.match(next, /insecure_loopback=1/);
  assert.ok(isInsecureLoopbackUrl(next));
});

test("LAN-IP bekommt niemals automatisch insecure_loopback=1", () => {
  const url = "wss://192.168.6.238:8443/api/agodesk/ws";
  const next = appendInsecureLoopbackIfNeeded(url);
  assert.equal(next, url);
  assert.equal(isInsecureLoopbackUrl(next), false);
  assert.equal(isLoopbackHost("192.168.6.238"), false);
});

test("normalisiert /api/agodesk/ auf /api/agodesk/ws", () => {
  assert.equal(
    normalizeServerUrl("wss://192.168.6.238:8443/api/agodesk/"),
    "wss://192.168.6.238:8443/api/agodesk/ws",
  );
});

test("origin wird ohne Pfad extrahiert", () => {
  assert.equal(getWsOrigin("wss://192.168.6.238:8443/api/agodesk/ws"), "wss://192.168.6.238:8443");
});
