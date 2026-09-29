import test from "node:test";
import assert from "node:assert/strict";
import {
  expandSignedMediaAcrossTrustedOrigins,
  isHomelabHost,
  isTrustedApiAliasOrigin,
  mergeTrustedAssetOrigins,
  originsFromIntegrationWebhosts,
  shouldReuseServerCertificatePin,
} from "./trusted-asset-origins.ts";

test("isHomelabHost erkennt LAN, .local und Tailscale", () => {
  assert.equal(isHomelabHost("192.168.6.238"), true);
  assert.equal(isHomelabHost("aurago.taild1480.ts.net"), true);
  assert.equal(isHomelabHost("example.com"), false);
});

test("originsFromIntegrationWebhosts sammelt absolute Webhost-Origins", () => {
  const origins = originsFromIntegrationWebhosts("wss://192.168.6.238:8443/api/agodesk/ws", [
    {
      id: "grafana",
      name: "Grafana",
      status: "running",
      url: "https://192.168.6.238:3101",
    },
    {
      id: "n8n",
      name: "n8n",
      status: "running",
      url: "http://192.168.6.238:3010",
    },
    {
      id: "desk",
      name: "Desktop",
      status: "running",
      url: "https://aurago.taild1480.ts.net:8443/desktop",
      icon: "https://aurago-manifest.taild1480.ts.net/icon.png",
    },
  ]);
  assert.ok(origins.includes("https://192.168.6.238:3101"));
  assert.ok(origins.includes("http://192.168.6.238:3010"));
  assert.ok(origins.includes("https://aurago.taild1480.ts.net:8443"));
  assert.ok(origins.includes("https://aurago-manifest.taild1480.ts.net"));
});

test("isTrustedApiAliasOrigin erlaubt Tailscale-Alias auf demselben API-Port", () => {
  assert.equal(
    isTrustedApiAliasOrigin(
      "wss://192.168.6.238:8443/api/agodesk/ws",
      "https://aurago.taild1480.ts.net:8443",
    ),
    true,
  );
  assert.equal(
    isTrustedApiAliasOrigin(
      "wss://192.168.6.238:8443/api/agodesk/ws",
      "https://192.168.6.238:3101",
    ),
    false,
  );
  assert.equal(
    isTrustedApiAliasOrigin("wss://192.168.6.238:8443/api/agodesk/ws", "https://evil.example:8443"),
    false,
  );
});

test("expandSignedMediaAcrossTrustedOrigins haengt Tailscale-API-Alias an", () => {
  const variants = expandSignedMediaAcrossTrustedOrigins(
    "wss://192.168.6.238:8443/api/agodesk/ws",
    "https://192.168.6.238:8443/api/agodesk/media/audio/a.mp3?agodesk_exp=1&agodesk_sig=x",
    ["https://aurago.taild1480.ts.net:8443", "https://192.168.6.238:3101"],
  );
  assert.ok(
    variants.includes(
      "https://192.168.6.238:8443/api/agodesk/media/audio/a.mp3?agodesk_exp=1&agodesk_sig=x",
    ),
  );
  assert.ok(
    variants.includes(
      "https://aurago.taild1480.ts.net:8443/api/agodesk/media/audio/a.mp3?agodesk_exp=1&agodesk_sig=x",
    ),
  );
  assert.ok(
    !variants.some((url) => url.startsWith("https://192.168.6.238:3101/")),
    "Integrations-Ports sind keine API-Aliase",
  );
});

test("shouldReuseServerCertificatePin fuer gleichen Host und API-Alias", () => {
  assert.equal(
    shouldReuseServerCertificatePin(
      "wss://192.168.6.238:8443/api/agodesk/ws",
      "https://192.168.6.238:3101/favicon.ico",
    ),
    true,
  );
  assert.equal(
    shouldReuseServerCertificatePin(
      "wss://192.168.6.238:8443/api/agodesk/ws",
      "https://aurago.taild1480.ts.net:8443/api/agodesk/media/a.mp3",
    ),
    true,
  );
  assert.equal(
    shouldReuseServerCertificatePin(
      "wss://192.168.6.238:8443/api/agodesk/ws",
      "https://cdn.example.com/a.png",
    ),
    false,
  );
});

test("mergeTrustedAssetOrigins kombiniert Settings und Webhosts ohne Duplikate", () => {
  const merged = mergeTrustedAssetOrigins(
    "wss://192.168.6.238:8443/api/agodesk/ws",
    ["https://cdn.example.com", "https://192.168.6.238:3101"],
    [{ id: "g", name: "G", status: "running", url: "https://192.168.6.238:3101/" }],
  );
  assert.deepEqual(merged, ["https://cdn.example.com", "https://192.168.6.238:3101"]);
});
