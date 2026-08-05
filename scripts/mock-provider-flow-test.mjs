import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

const URL = `ws://127.0.0.1:${process.env.PORT ?? 8080}/api/agodesk/ws?insecure_loopback=1`;
const ws = new WebSocket(URL);
const pending = new Map();

function send(type, payload) {
  const id = randomUUID();
  pending.set(id, type);
  ws.send(JSON.stringify({ id, type, timestamp: new Date().toISOString(), payload }));
  return id;
}

let sessionId = "";
let catalogProviders = [];
let createdProviderId = "";
let authUrl = "";
let catalogDetail = null;

ws.on("message", (raw) => {
  const message = JSON.parse(raw.toString());
  if (message.type === "system.connected") {
    sessionId = message.payload.session_id;
    send("session.start", {
      pairing_token: "mock-pairing-token",
      client_capabilities: [
        "config.providers.read",
        "config.providers.write",
        "config.providers.oauth",
      ],
    });
    return;
  }
  if (message.type === "session.accepted") {
    sessionId = message.payload.session_id;
    send("config.provider.catalog.list", { session_id: sessionId, include_models: false });
    return;
  }
  if (message.type === "config.provider.catalog") {
    catalogProviders = message.payload.providers;
    send("config.provider.catalog.detail", {
      session_id: sessionId,
      provider_id: "google",
      include_models: true,
    });
    return;
  }
  if (message.type === "config.provider.catalog" && pending.has(message.id)) {
    catalogDetail = message.payload;
    return;
  }
  if (message.type === "config.provider") {
    if (message.payload.provider?.id === createdProviderId) {
      send("config.provider.oauth.start", {
        session_id: sessionId,
        provider_id: createdProviderId,
        redirect_uri: "http://127.0.0.1:8765/oauth/callback",
      });
    }
    return;
  }
  if (message.type === "config.provider.oauth.started") {
    authUrl = message.payload.auth_url;
    send("config.provider.oauth.complete", {
      session_id: sessionId,
      provider_id: createdProviderId,
      redirect_url: `${authUrl}&mock=1`,
    });
    return;
  }
  if (message.type === "config.provider.oauth.status") {
    console.log(
      JSON.stringify(
        {
          ok: true,
          status: message.payload,
          authUrl,
          catalogDetailModels: catalogDetail?.models?.length,
        },
        null,
        2,
      ),
    );
    ws.close();
    process.exit(0);
  }
});

ws.on("open", () => {});

ws.on("error", (error) => {
  console.error("WS error:", error.message);
  process.exit(1);
});

// After catalog list arrives, upsert a Google OAuth provider.
const originalOnMessage = ws.listeners("message")[0];
let didUpsert = false;
ws.on("message", () => {
  if (!didUpsert && catalogProviders.length > 0) {
    didUpsert = true;
    createdProviderId = "prov-google-test";
    send("config.provider.upsert", {
      session_id: sessionId,
      mode: "create",
      provider: {
        id: createdProviderId,
        name: "Google Test",
        type: "google",
        base_url: "https://generativelanguage.googleapis.com/v1beta",
        model: "gemini-2.5-flash",
        auth_type: "oauth",
        oauth_client_id: "mock-client-id",
        oauth_scopes: "openid email",
      },
      secrets: { oauth_client_secret: { op: "set" } },
    });
  }
});

setTimeout(() => {
  console.error(
    "TIMEOUT — flow did not complete. Last state:",
    JSON.stringify({
      sessionId,
      catalogProviders: catalogProviders.map((p) => p.id),
      createdProviderId,
      authUrl,
    }),
  );
  process.exit(2);
}, 8000);
