import { createHmac, randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 8080);
const PATH = "/api/agodesk/ws";

const MOCK_PERSONA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2563eb"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient></defs><circle cx="64" cy="64" r="64" fill="url(#g)"/><text x="64" y="78" text-anchor="middle" fill="#fff" font-size="52" font-family="Segoe UI,sans-serif" font-weight="700">A</text></svg>`;
const MOCK_PERSONA_AVATAR_URL = `data:image/svg+xml;base64,${Buffer.from(MOCK_PERSONA_SVG).toString("base64")}`;

/** @typedef {{ id: string; type: string; timestamp: string; payload: Record<string, unknown> }} WsMessage */

/** @type {Map<string, string>} */
const deviceKeys = new Map();

/** @type {WeakMap<import('ws').WebSocket, { connectionSessionId: string; sessionId: string; deviceId: string | null; chatAccepted: boolean; clientCapabilities: string[] }>} */
const socketSessions = new WeakMap();

const DEFAULT_ADVERTISED_CAPABILITIES = [
  "chat.full_response",
  "remote.desktop.capture",
  "remote.desktop.permission_request",
  "remote.desktop.input",
  "remote.desktop.discovery",
  "remote.desktop.ui_automation",
  "persona.assets",
];

const wss = new WebSocketServer({ port: PORT, path: PATH });

console.log(`Mock AuraGo backend: ws://localhost:${PORT}${PATH}`);

wss.on("connection", (socket, request) => {
  const requestUrl = new URL(request.url ?? PATH, "http://localhost");
  const insecureLoopback =
    requestUrl.searchParams.get("insecure_loopback") === "1" &&
    (request.socket.remoteAddress === "127.0.0.1" ||
      request.socket.remoteAddress === "::1" ||
      request.socket.remoteAddress === "::ffff:127.0.0.1");

  const connectionSessionId = `sess-conn-${randomUUID().slice(0, 8)}`;
  socketSessions.set(socket, {
    connectionSessionId,
    sessionId: connectionSessionId,
    deviceId: null,
    chatAccepted: insecureLoopback,
    clientCapabilities: [...DEFAULT_ADVERTISED_CAPABILITIES],
  });

  /** @param {WsMessage} message */
  function send(message) {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  send({
    id: randomUUID(),
    type: "system.connected",
    timestamp: new Date().toISOString(),
    payload: {
      protocol_version: "agodesk.v1",
      session_id: connectionSessionId,
      auth_required: !insecureLoopback,
      pairing_required: !insecureLoopback,
      allows_insecure_loopback: true,
      capabilities: [
        "remote.desktop.capture",
        "remote.desktop.input",
        "remote.desktop.discovery",
        "remote.desktop.ui_automation",
        "chat.full_response",
        "persona.assets",
      ],
    },
  });

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const session = socketSessions.get(socket);
    if (!session) {
      return;
    }

    switch (message.type) {
      case "system.ping":
        send({
          id: randomUUID(),
          type: "system.pong",
          timestamp: new Date().toISOString(),
          payload: {},
        });
        break;

      case "session.start":
        handleSessionStart(message, session, send);
        break;

      case "chat.message":
        if (!session.chatAccepted) {
          send({
            id: randomUUID(),
            type: "chat.error",
            timestamp: new Date().toISOString(),
            payload: {
              request_id: message.id,
              code: "SESSION_NOT_ACCEPTED",
              message: "Chat ist erst nach session.accepted erlaubt.",
            },
          });
          break;
        }
        handleChatMessage(message, session, send);
        break;

      case "persona.assets.request":
        sendPersonaAssets(session, send);
        break;

      case "desktop.result":
        console.log(
          "[desktop.result]",
          JSON.stringify({
            command_id: message.payload?.command_id,
            success: message.payload?.success,
            error: message.payload?.error,
            error_code: message.payload?.error_code,
            has_data: Boolean(message.payload?.data),
          }),
        );
        break;

      default:
        break;
    }
  });
});

function issueAcceptedSession(session, send, payload) {
  const acceptedSessionId = `sess-acc-${randomUUID().slice(0, 8)}`;
  session.sessionId = acceptedSessionId;
  session.chatAccepted = true;
  const advertised =
    session.clientCapabilities.length > 0
      ? session.clientCapabilities
      : DEFAULT_ADVERTISED_CAPABILITIES;
  send({
    id: randomUUID(),
    type: "session.accepted",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: acceptedSessionId,
      advertised_capabilities: advertised,
      ...payload,
    },
  });
}

/**
 * @param {{ sessionId: string }} session
 * @param {(message: WsMessage) => void} send
 */
function sendPersonaAssets(session, send) {
  send({
    id: randomUUID(),
    type: "persona.assets",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: session.sessionId,
      persona: "Aura",
      icon_key: "aura-default",
      avatar_image_url: MOCK_PERSONA_AVATAR_URL,
      icon_url: MOCK_PERSONA_AVATAR_URL,
      asset_version: "mock-1",
      persona_prompt: "Mock-Persona für lokale Entwicklung.",
    },
  });
}

/**
 * @param {WsMessage} message
 * @param {{ sessionId: string; deviceId: string | null; chatAccepted: boolean }} session
 * @param {(message: WsMessage) => void} send
 */
function handleSessionStart(message, session, send) {
  const payload = message.payload ?? {};

  const capsRaw = payload.client_capabilities ?? payload.clientCapabilities;
  if (Array.isArray(capsRaw)) {
    session.clientCapabilities = capsRaw.filter((cap) => typeof cap === "string");
    console.log("[session.start] client_capabilities:", session.clientCapabilities);
  }

  if (payload.pairing_token) {
    const deviceId = `dev-${randomUUID().slice(0, 8)}`;
    const sharedKey = randomUUID().replace(/-/g, "");
    deviceKeys.set(deviceId, sharedKey);
    session.deviceId = deviceId;
    issueAcceptedSession(session, send, {
      device_id: deviceId,
      shared_key: sharedKey,
    });
    return;
  }

  const deviceId = payload.device_id;
  const sharedKey = deviceId ? deviceKeys.get(deviceId) : undefined;
  if (!deviceId || !sharedKey) {
    sendSessionError(send, message.id, "SESSION_DEVICE_UNKNOWN", "Unbekanntes Geraet.");
    return;
  }

  const proofPayload = payload.shared_key_proof ?? {};
  const nonce = String(proofPayload.nonce ?? payload.nonce ?? "");
  const timestamp = String(
    proofPayload.timestamp ?? proofPayload.proof_timestamp ?? payload.proof_timestamp ?? "",
  );
  const submittedProof = String(
    proofPayload.hmac ?? proofPayload.proof ?? payload.shared_key_proof ?? "",
  );

  const expectedProof = computeSharedKeyProof(
    sharedKey,
    message.id,
    deviceId,
    nonce,
    timestamp,
  );

  if (submittedProof !== expectedProof) {
    sendSessionError(send, message.id, "SESSION_PROOF_INVALID", "Shared-Key-Proof ungueltig.");
    return;
  }

  session.deviceId = deviceId;
  issueAcceptedSession(session, send, {
    device_id: deviceId,
  });
}

/**
 * @param {(message: WsMessage) => void} send
 * @param {string} requestId
 * @param {string} code
 * @param {string} messageText
 */
function sendSessionError(send, requestId, code, messageText) {
  send({
    id: randomUUID(),
    type: "chat.error",
    timestamp: new Date().toISOString(),
    payload: {
      request_id: requestId,
      code,
      message: messageText,
    },
  });
}

/**
 * @param {(message: WsMessage) => void} send
 * @param {string} operation
 * @param {Record<string, unknown>} params
 */
function sendDesktopCommand(send, operation, params) {
  send({
    id: randomUUID(),
    type: "desktop.command",
    timestamp: new Date().toISOString(),
    payload: {
      command_id: randomUUID(),
      operation,
      params,
    },
  });
}

/**
 * @param {WsMessage} message
 * @param {{ sessionId: string }} session
 * @param {(message: WsMessage) => void} send
 */
function handleChatMessage(message, session, send) {
  const text = String(message.payload?.text ?? "");
  const requestId = message.id;
  const clientSessionId = String(message.payload?.session_id ?? "");

  if (clientSessionId !== session.sessionId) {
    send({
      id: randomUUID(),
      type: "chat.error",
      timestamp: new Date().toISOString(),
      payload: {
        request_id: requestId,
        code: "SESSION_ID_MISMATCH",
        message:
          "chat.message muss die session_id aus session.accepted verwenden.",
      },
    });
    return;
  }

  if (text.trim().toLowerCase() === "/error") {
    send({
      id: randomUUID(),
      type: "chat.error",
      timestamp: new Date().toISOString(),
      payload: {
        request_id: requestId,
        code: "MOCK_ERROR",
        message: "Simulierter Fehler vom Mock-Agent.",
      },
    });
    return;
  }

  if (text.trim().toLowerCase() === "/desktop") {
    send({
      id: randomUUID(),
      type: "desktop.command",
      timestamp: new Date().toISOString(),
      payload: {
        command_id: randomUUID(),
        operation: "desktop_permission_request",
        params: {},
      },
    });
    return;
  }

  if (text.trim().toLowerCase() === "/screenshot") {
    send({
      id: randomUUID(),
      type: "desktop.command",
      timestamp: new Date().toISOString(),
      payload: {
        command_id: randomUUID(),
        operation: "desktop_screenshot",
        params: {
          format: "png",
        },
      },
    });
    return;
  }

  if (text.trim().toLowerCase() === "/displays") {
    send({
      id: randomUUID(),
      type: "desktop.command",
      timestamp: new Date().toISOString(),
      payload: {
        command_id: randomUUID(),
        operation: "desktop_list_displays",
        params: {},
      },
    });
    return;
  }

  if (text.trim().toLowerCase() === "/windows") {
    send({
      id: randomUUID(),
      type: "desktop.command",
      timestamp: new Date().toISOString(),
      payload: {
        command_id: randomUUID(),
        operation: "desktop_list_windows",
        params: {},
      },
    });
    return;
  }

  if (text.trim().toLowerCase() === "/active") {
    send({
      id: randomUUID(),
      type: "desktop.command",
      timestamp: new Date().toISOString(),
      payload: {
        command_id: randomUUID(),
        operation: "desktop_active_window",
        params: {},
      },
    });
    return;
  }

  if (text.trim().toLowerCase() === "/host") {
    send({
      id: randomUUID(),
      type: "desktop.command",
      timestamp: new Date().toISOString(),
      payload: {
        command_id: randomUUID(),
        operation: "desktop_host_info",
        params: {},
      },
    });
    return;
  }

  if (text.trim().toLowerCase() === "/ui-tree") {
    send({
      id: randomUUID(),
      type: "desktop.command",
      timestamp: new Date().toISOString(),
      payload: {
        command_id: randomUUID(),
        operation: "desktop_ui_tree",
        params: {},
      },
    });
    return;
  }

  if (text.trim().toLowerCase() === "/ui-action") {
    const permissionCommandId = randomUUID();
    send({
      id: randomUUID(),
      type: "desktop.command",
      timestamp: new Date().toISOString(),
      payload: {
        command_id: permissionCommandId,
        operation: "desktop_permission_request",
        params: {},
      },
    });
    setTimeout(() => {
      send({
        id: randomUUID(),
        type: "desktop.command",
        timestamp: new Date().toISOString(),
        payload: {
          command_id: randomUUID(),
          operation: "desktop_ui_action",
          params: {
            element_id: "elem-0",
            action: "click",
          },
        },
      });
    }, 400);
    return;
  }

  if (text.trim().toLowerCase() === "/browser") {
    send({
      id: randomUUID(),
      type: "desktop.command",
      timestamp: new Date().toISOString(),
      payload: {
        command_id: randomUUID(),
        operation: "desktop_browser_connect",
        params: {
          port: 9222,
        },
      },
    });
    return;
  }

  if (text.trim().toLowerCase() === "/desktop-input") {
    const permissionCommandId = randomUUID();
    send({
      id: randomUUID(),
      type: "desktop.command",
      timestamp: new Date().toISOString(),
      payload: {
        command_id: permissionCommandId,
        operation: "desktop_permission_request",
        params: {},
      },
    });
    setTimeout(() => {
      send({
        id: randomUUID(),
        type: "desktop.command",
        timestamp: new Date().toISOString(),
        payload: {
          command_id: randomUUID(),
          operation: "desktop_input",
          params: {
            kind: "mouse_click",
            x: 100,
            y: 100,
            button: "left",
            action: "click",
          },
        },
      });
    }, 400);
    return;
  }

  if (text.trim().toLowerCase() === "/computer-use") {
    sendDesktopCommand(send, "desktop_active_window", {});
    setTimeout(() => {
      sendDesktopCommand(send, "desktop_ui_tree", {});
    }, 300);
    setTimeout(() => {
      sendDesktopCommand(send, "desktop_screenshot", { format: "jpeg", quality: 75 });
    }, 600);
    return;
  }

  if (text.trim().toLowerCase() === "/desktop-stream") {
    send({
      id: randomUUID(),
      type: "desktop.command",
      timestamp: new Date().toISOString(),
      payload: {
        command_id: randomUUID(),
        operation: "desktop_stream_start",
        params: {},
      },
    });
    return;
  }

  setTimeout(() => {
    send({
      id: randomUUID(),
      type: "chat.response",
      timestamp: new Date().toISOString(),
      payload: {
        session_id: session.sessionId,
        request_id: requestId,
        text: mockReply(text),
        role: "assistant",
        metadata: { model: "mock-agent" },
      },
    });
  }, 600);
}

function mockReply(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "Ich habe keine Nachricht erhalten.";
  }
  if (trimmed.toLowerCase() === "ping") {
    return "pong";
  }
  return `Echo vom Mock-Agent: „${trimmed}“`;
}

function sharedKeyBytes(sharedKey) {
  const trimmed = sharedKey.trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return Buffer.from(trimmed, "hex");
  }
  return Buffer.from(trimmed, "utf8");
}

function computeSharedKeyProof(
  sharedKey,
  envelopeId,
  deviceId,
  nonce,
  timestamp,
) {
  const material = `agodesk.v1\nsession.start\n${envelopeId}\n${deviceId}\n${nonce}\n${timestamp}`;
  return createHmac("sha256", sharedKeyBytes(sharedKey)).update(material).digest("hex");
}

wss.on("error", (error) => {
  console.error("Server-Fehler:", error.message);
});
