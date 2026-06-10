import { createHmac, randomUUID } from "node:crypto";
import http from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 8080);
const PATH = "/api/agodesk/ws";

const MOCK_CHART_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const MOCK_PERSONA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2563eb"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient></defs><circle cx="64" cy="64" r="64" fill="url(#g)"/><text x="64" y="78" text-anchor="middle" fill="#fff" font-size="52" font-family="Segoe UI,sans-serif" font-weight="700">A</text></svg>`;
const MOCK_PERSONA_AVATAR_URL = `data:image/svg+xml;base64,${Buffer.from(MOCK_PERSONA_SVG).toString("base64")}`;

/** @typedef {{ id: string; type: string; timestamp: string; payload: Record<string, unknown> }} WsMessage */

/** @type {Map<string, string>} */
const deviceKeys = new Map();

/** @typedef {{ id: string; preview: string; created_at: string; last_active_at: string; messages: Array<{ role: string; content: string; timestamp: string }> }} MockConversation */

/** @type {WeakMap<import('ws').WebSocket, { connectionSessionId: string; sessionId: string; deviceId: string | null; chatAccepted: boolean; speakerMode: boolean; clientCapabilities: string[]; activeStreamId: string | null; streamFramesSeen: number; conversations: Map<string, MockConversation>; activeRequests: Map<string, { timeout: ReturnType<typeof setTimeout> | null; conversationId: string | null }>; mockWarnings: Array<{ id: string; severity: string; title: string; description?: string; category?: string; timestamp: string; acknowledged: boolean }> }>} */
const socketSessions = new WeakMap();

const DEFAULT_ADVERTISED_CAPABILITIES = [
  "chat.full_response",
  "chat.agent_metadata",
  "chat.plan_updates",
  "chat.sessions",
  "chat.cancel",
  "chat.audio_events",
  "chat.voice_output",
  "chat.voice_output_status",
  "chat.media_events",
  "integrations.webhosts",
  "system.warnings",
  "remote.desktop.capture",
  "remote.desktop.stream",
  "remote.desktop.permission_request",
  "remote.desktop.input",
  "remote.desktop.discovery",
  "remote.desktop.ui_automation",
  "persona.assets",
];

const wss = new WebSocketServer({ noServer: true });

const MOCK_MEDIA_SECRET = process.env.MOCK_MEDIA_SECRET ?? "mock-agodesk-media-secret";
const MOCK_MEDIA_TTL_SECONDS = 15 * 60;

function signMockAgodeskMediaPath(pathValue, now = Date.now()) {
  const pathOnly = pathValue.split("?")[0] ?? pathValue;
  if (!pathOnly.startsWith("/api/agodesk/media/")) {
    return pathValue;
  }
  const params = new URLSearchParams(pathValue.includes("?") ? pathValue.split("?")[1] : "");
  params.set("agodesk_exp", String(Math.floor(now / 1000) + MOCK_MEDIA_TTL_SECONDS));
  params.delete("agodesk_sig");
  const material = `${encodeURI(pathOnly)}\n${params.toString()}`;
  params.set(
    "agodesk_sig",
    createHmac("sha256", MOCK_MEDIA_SECRET).update(material).digest("hex"),
  );
  return `${pathOnly}?${params.toString()}`;
}

function verifyMockAgodeskMediaRequest(requestUrl) {
  if (!requestUrl.pathname.startsWith("/api/agodesk/media/")) {
    return false;
  }
  const expRaw = requestUrl.searchParams.get("agodesk_exp");
  const sig = requestUrl.searchParams.get("agodesk_sig");
  if (!expRaw || !sig) {
    return false;
  }
  const expires = Number.parseInt(expRaw, 10);
  if (!Number.isFinite(expires) || Math.floor(Date.now() / 1000) > expires) {
    return false;
  }
  const params = new URLSearchParams(requestUrl.search);
  params.delete("agodesk_sig");
  const material = `${requestUrl.pathname}\n${params.toString()}`;
  const expected = createHmac("sha256", MOCK_MEDIA_SECRET).update(material).digest("hex");
  return expected.toLowerCase() === sig.toLowerCase();
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (requestUrl.pathname.startsWith("/api/agodesk/media/")) {
    if (!verifyMockAgodeskMediaRequest(requestUrl)) {
      res.writeHead(401, { "Content-Type": "text/plain" });
      res.end("unauthorized");
      return;
    }
    if (requestUrl.pathname === "/api/agodesk/media/mock-chart.png") {
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": MOCK_CHART_PNG.length,
      });
      res.end(MOCK_CHART_PNG);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.on("upgrade", (request, socket, head) => {
  const requestUrl = new URL(request.url ?? PATH, "http://localhost");
  if (requestUrl.pathname !== PATH) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (socket) => {
    wss.emit("connection", socket, request);
  });
});

server.listen(PORT, () => {
  console.log(`Mock AuraGo backend: ws://localhost:${PORT}${PATH}`);
  console.log(`Mock media: http://localhost:${PORT}/api/agodesk/media/mock-chart.png`);
});

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
    speakerMode: true,
    clientCapabilities: [...DEFAULT_ADVERTISED_CAPABILITIES],
    activeStreamId: null,
    streamFramesSeen: 0,
    conversations: new Map(),
    activeRequests: new Map(),
    mockWarnings: [
      {
        id: "warn-mock-1",
        severity: "warning",
        title: "Mock: Speicher knapp",
        description: "Der AuraGo-Host meldet **80 %** Speicherauslastung.",
        category: "system",
        timestamp: new Date().toISOString(),
        acknowledged: false,
      },
    ],
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
        "chat.agent_metadata",
        "chat.plan_updates",
        "chat.sessions",
        "chat.cancel",
        "chat.audio_events",
        "chat.voice_output",
        "chat.voice_output_status",
        "chat.media_events",
        "integrations.webhosts",
        "system.warnings",
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

      case "session.clear":
        handleSessionClear(message, session, send);
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

      case "chat.sessions.list":
        handleChatSessionsList(message, session, send);
        break;

      case "chat.session.create":
        handleChatSessionCreate(message, session, send);
        break;

      case "chat.session.load":
        handleChatSessionLoad(message, session, send);
        break;

      case "chat.cancel":
        handleChatCancel(message, session, send);
        break;

      case "chat.voice_output.status":
        handleChatVoiceOutputStatus(message, session, send);
        break;

      case "integrations.webhosts.list":
        sendMockIntegrationsWebhosts(session, send);
        break;

      case "system.warnings.list":
        sendMockSystemWarnings(session, send);
        break;

      case "system.warning.acknowledge":
        handleSystemWarningAcknowledge(message, session, send);
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
            operation_data: message.payload?.data?.stream_id
              ? {
                  stream_id: message.payload.data.stream_id,
                  active: message.payload.data.active,
                  frames_sent: message.payload.data.frames_sent,
                }
              : undefined,
          }),
        );
        if (
          message.payload?.success &&
          message.payload?.data?.stream_id &&
          message.payload?.data?.active === true
        ) {
          session.activeStreamId = message.payload.data.stream_id;
          session.streamFramesSeen = 0;
        }
        if (
          message.payload?.success &&
          message.payload?.data?.active === false
        ) {
          session.activeStreamId = null;
        }
        break;

      case "desktop.stream.frame":
        session.streamFramesSeen += 1;
        console.log(
          "[desktop.stream.frame]",
          JSON.stringify({
            stream_id: message.payload?.stream_id,
            sequence: message.payload?.sequence,
            mime: message.payload?.frame?.mime,
            width: message.payload?.frame?.width,
            height: message.payload?.frame?.height,
            bytes: message.payload?.frame?.data_base64?.length ?? 0,
          }),
        );
        if (session.activeStreamId && session.streamFramesSeen >= 5) {
          send({
            id: randomUUID(),
            type: "desktop.command",
            timestamp: new Date().toISOString(),
            payload: {
              command_id: randomUUID(),
              operation: "desktop_stream_stop",
              params: { stream_id: session.activeStreamId },
            },
          });
        }
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

function sendSessionClear(session, send, reason) {
  const newSessionId = `sess-acc-${randomUUID().slice(0, 8)}`;
  session.sessionId = newSessionId;
  send({
    id: randomUUID(),
    type: "session.clear",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: newSessionId,
      ...(reason ? { reason } : {}),
    },
  });
}

/**
 * @param {WsMessage} message
 * @param {{ sessionId: string }} session
 * @param {(message: WsMessage) => void} send
 */
function handleSessionClear(message, session, send) {
  const reason = String(message.payload?.reason ?? "").trim();
  sendSessionClear(
    session,
    send,
    reason || "Mock: Session durch Client session.clear zurückgesetzt.",
  );
}

/**
 * @param {WsMessage} message
 * @param {{ sessionId: string; deviceId: string | null; chatAccepted: boolean; clientCapabilities: string[] }} session
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
 * @param {{ sessionId: string; conversations: Map<string, MockConversation> }} session
 */
function createMockConversation(session) {
  const id = `sess-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  /** @type {MockConversation} */
  const conversation = {
    id,
    preview: "",
    created_at: now,
    last_active_at: now,
    messages: [],
  };
  session.conversations.set(id, conversation);
  return conversation;
}

/**
 * @param {MockConversation} conversation
 */
function toSessionSummary(conversation) {
  return {
    id: conversation.id,
    preview: conversation.preview || "Mock chat",
    created_at: conversation.created_at,
    last_active_at: conversation.last_active_at,
    message_count: conversation.messages.length,
  };
}

/**
 * @param {{ sessionId: string; conversations: Map<string, MockConversation> }} session
 * @param {(message: WsMessage) => void} send
 * @param {string} conversationId
 * @param {boolean} includeMessages
 */
function sendChatSession(session, send, conversationId, includeMessages = false) {
  const conversation = session.conversations.get(conversationId);
  if (!conversation) {
    sendSessionError(send, randomUUID(), "SESSION_NOT_FOUND", "Unbekannte Unterhaltung.");
    return;
  }

  send({
    id: randomUUID(),
    type: "chat.session",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: session.sessionId,
      conversation_id: conversationId,
      session: toSessionSummary(conversation),
      ...(includeMessages
        ? {
            messages: conversation.messages.map((message) => ({
              role: message.role,
              content: message.content,
              timestamp: message.timestamp,
            })),
          }
        : {}),
    },
  });
}

/**
 * @param {WsMessage} message
 * @param {{ sessionId: string; conversations: Map<string, MockConversation> }} session
 * @param {(message: WsMessage) => void} send
 */
function handleChatSessionsList(message, session, send) {
  const clientSessionId = String(message.payload?.session_id ?? "");
  if (clientSessionId !== session.sessionId) {
    sendSessionError(send, message.id, "SESSION_NOT_FOUND", "Session nicht gefunden.");
    return;
  }

  const limit = Number(message.payload?.limit ?? 20);
  const sessions = [...session.conversations.values()]
    .sort((a, b) => b.last_active_at.localeCompare(a.last_active_at))
    .slice(0, Number.isFinite(limit) ? Math.max(1, limit) : 20)
    .map((conversation) => toSessionSummary(conversation));

  send({
    id: randomUUID(),
    type: "chat.sessions",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: session.sessionId,
      sessions,
    },
  });
}

/**
 * @param {WsMessage} message
 * @param {{ sessionId: string; conversations: Map<string, MockConversation> }} session
 * @param {(message: WsMessage) => void} send
 */
function handleChatSessionCreate(message, session, send) {
  const clientSessionId = String(message.payload?.session_id ?? "");
  if (clientSessionId !== session.sessionId) {
    sendSessionError(send, message.id, "SESSION_NOT_FOUND", "Session nicht gefunden.");
    return;
  }

  const conversation = createMockConversation(session);
  sendChatSession(session, send, conversation.id, false);
}

/**
 * @param {WsMessage} message
 * @param {{ sessionId: string; conversations: Map<string, MockConversation> }} session
 * @param {(message: WsMessage) => void} send
 */
function handleChatSessionLoad(message, session, send) {
  const clientSessionId = String(message.payload?.session_id ?? "");
  const conversationId = String(message.payload?.conversation_id ?? "");
  if (clientSessionId !== session.sessionId) {
    sendSessionError(send, message.id, "SESSION_NOT_FOUND", "Session nicht gefunden.");
    return;
  }

  sendChatSession(session, send, conversationId, true);
}

/**
 * @param {WsMessage} message
 * @param {{ sessionId: string; activeRequests: Map<string, { timeout: ReturnType<typeof setTimeout> | null; conversationId: string | null }> }} session
 * @param {(message: WsMessage) => void} send
 */
function handleChatCancel(message, session, send) {
  const clientSessionId = String(message.payload?.session_id ?? "");
  const conversationId = String(message.payload?.conversation_id ?? "");
  const requestId = String(message.payload?.request_id ?? "");

  if (clientSessionId !== session.sessionId) {
    send({
      id: randomUUID(),
      type: "chat.error",
      timestamp: new Date().toISOString(),
      payload: {
        request_id: requestId || message.id,
        code: "SESSION_NOT_FOUND",
        message: "Session nicht gefunden.",
      },
    });
    return;
  }

  const active = session.activeRequests.get(requestId);
  if (active?.timeout) {
    clearTimeout(active.timeout);
  }
  session.activeRequests.delete(requestId);

  send({
    id: randomUUID(),
    type: "chat.cancelled",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: session.sessionId,
      conversation_id: conversationId,
      request_id: requestId,
      status: active ? "cancelled" : "not_active",
    },
  });
}

/**
 * @param {WsMessage} message
 * @param {{ sessionId: string; speakerMode: boolean }} session
 * @param {(message: WsMessage) => void} send
 */
function handleChatVoiceOutputStatus(message, session, send) {
  const clientSessionId = String(message.payload?.session_id ?? "");
  if (clientSessionId !== session.sessionId) {
    return;
  }

  const speakerMode = message.payload?.speaker_mode === true;
  session.speakerMode = speakerMode;

  send({
    id: message.id,
    type: "chat.voice_output.status",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: session.sessionId,
      ...(message.payload?.conversation_id
        ? { conversation_id: String(message.payload.conversation_id) }
        : {}),
      speaker_mode: speakerMode,
      mode: speakerMode ? "on" : "off",
      status: "ok",
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
  const conversationId = String(message.payload?.conversation_id ?? "");
  const voiceOutput = message.payload?.voice_output === true;

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

  let conversation = conversationId ? session.conversations.get(conversationId) : null;
  if (conversationId && !conversation) {
    sendSessionError(send, requestId, "SESSION_NOT_FOUND", "Unbekannte Unterhaltung.");
    return;
  }

  if (text.trim()) {
    const now = new Date().toISOString();
    if (!conversation) {
      conversation = createMockConversation(session);
    }
    conversation.messages.push({ role: "user", content: text, timestamp: now });
    conversation.last_active_at = now;
    if (!conversation.preview) {
      conversation.preview = text.trim().slice(0, 80);
    }
  }

  const activeConversationId = conversation?.id ?? conversationId || null;

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

  if (text.trim().toLowerCase() === "/newsession") {
    sendSessionClear(
      session,
      send,
      "Mock: neue Session gestartet (Chat-Verlauf gelöscht).",
    );
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
    sendDesktopCommand(send, "desktop_browser_connect", {
      port: 9222,
      auto_launch: true,
    });
    setTimeout(() => {
      sendDesktopCommand(send, "desktop_browser_list_tabs", {});
    }, 900);
    setTimeout(() => {
      sendDesktopCommand(send, "desktop_browser_snapshot", {
        include_html: false,
        include_screenshot: true,
        screenshot_format: "jpeg",
        quality: 75,
      });
    }, 1800);
    setTimeout(() => {
      send({
        id: randomUUID(),
        type: "desktop.command",
        timestamp: new Date().toISOString(),
        payload: {
          command_id: randomUUID(),
          operation: "desktop_browser_action",
          params: {
            action: "select_tab",
            tab_id: "mock-tab-1",
          },
        },
      });
    }, 2700);
    setTimeout(() => {
      send({
        id: randomUUID(),
        type: "desktop.command",
        timestamp: new Date().toISOString(),
        payload: {
          command_id: randomUUID(),
          operation: "desktop_browser_action",
          params: {
            action: "click",
            selector: "body",
          },
        },
      });
    }, 3600);
    setTimeout(() => {
      sendDesktopCommand(send, "desktop_browser_disconnect", {});
    }, 4500);
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
        params: { format: "jpeg", quality: 60, fps: 2 },
      },
    });
    return;
  }

  if (text.trim().toLowerCase() === "/stream") {
    sendStreamingReply(send, session, requestId, mockReply(text));
    return;
  }

  if (text.trim().toLowerCase() === "/plan") {
    sendMockPlanFlow(send, session, requestId, mockReply(text));
    return;
  }

  if (text.trim().toLowerCase() === "/plan-clear") {
    send({
      id: randomUUID(),
      type: "chat.plan_update",
      timestamp: new Date().toISOString(),
      payload: {
        session_id: session.sessionId,
        request_id: requestId,
        plan: null,
      },
    });
    return;
  }

  if (text.trim().toLowerCase() === "/media") {
    sendMockChatMedia(send, session, requestId, activeConversationId);
    send({
      id: randomUUID(),
      type: "chat.response",
      timestamp: new Date().toISOString(),
      payload: {
        session_id: session.sessionId,
        conversation_id: activeConversationId,
        request_id: requestId,
        text: "Mock-Medienartefakte gesendet (Bild, Audio, Link).",
        role: "assistant",
      },
    });
    return;
  }

  const replyText = mockReply(text);
  const timeout = setTimeout(() => {
    session.activeRequests.delete(requestId);
    if (voiceOutput && session.speakerMode) {
      send({
        id: randomUUID(),
        type: "chat.audio",
        timestamp: new Date().toISOString(),
        payload: {
          session_id: session.sessionId,
          conversation_id: activeConversationId,
          request_id: requestId,
          path: "/api/agodesk/tts/response.mp3",
          title: "Mock TTS",
          mime_type: "audio/mpeg",
          filename: "response.mp3",
        },
      });
    }

    if (conversation) {
      const now = new Date().toISOString();
      conversation.messages.push({
        role: "assistant",
        content: replyText,
        timestamp: now,
      });
      conversation.last_active_at = now;
    }

    send({
      id: randomUUID(),
      type: "chat.response",
      timestamp: new Date().toISOString(),
      payload: {
        session_id: session.sessionId,
        conversation_id: activeConversationId ?? undefined,
        request_id: requestId,
        text: replyText,
        role: "assistant",
        metadata: {
          model: "mock-agent",
          agent_mood: buildMockAgentMood("curious"),
        },
      },
    });
  }, 600);

  session.activeRequests.set(requestId, {
    timeout,
    conversationId: activeConversationId,
  });
}

function buildMockAgentMood(mood = "focused") {
  return {
    mood,
    primary_mood: mood,
    recommended_response_style: "kurz und sachlich",
    valence: 0.2,
    arousal: 0.35,
    confidence: 0.85,
    source: "mock-agent",
  };
}

function buildMockPlan(phase = 1) {
  const tasks = [
    {
      id: "t1",
      title: "Kontext sammeln",
      status: phase >= 2 ? "completed" : "in_progress",
    },
    {
      id: "t2",
      title: "Antwort formulieren",
      status: phase >= 3 ? "completed" : phase >= 2 ? "in_progress" : "pending",
    },
    {
      id: "t3",
      title: "Ergebnis prüfen",
      status: phase >= 3 ? "completed" : "pending",
    },
  ];
  const completed = tasks.filter((task) => task.status === "completed").length;
  const inProgress = tasks.filter((task) => task.status === "in_progress").length;
  const pending = tasks.filter((task) => task.status === "pending").length;

  return {
    id: "plan-mock-1",
    title: "Mock-Aufgabenplan",
    status: phase >= 3 ? "completed" : "active",
    progress_pct: Math.round((completed / tasks.length) * 100),
    task_counts: {
      total: tasks.length,
      pending,
      in_progress: inProgress,
      completed,
    },
    current_task: tasks.find((task) => task.status === "in_progress") ?? tasks[0],
    tasks,
  };
}

function sendMockPlanFlow(send, session, requestId, replyText) {
  send({
    id: randomUUID(),
    type: "chat.plan_update",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: session.sessionId,
      request_id: requestId,
      plan: buildMockPlan(1),
    },
  });

  setTimeout(() => {
    send({
      id: randomUUID(),
      type: "chat.plan_update",
      timestamp: new Date().toISOString(),
      payload: {
        session_id: session.sessionId,
        request_id: requestId,
        plan: buildMockPlan(2),
      },
    });
  }, 350);

  setTimeout(() => {
    send({
      id: randomUUID(),
      type: "chat.response",
      timestamp: new Date().toISOString(),
      payload: {
        session_id: session.sessionId,
        request_id: requestId,
        text: replyText,
        role: "assistant",
        metadata: {
          model: "mock-agent",
          agent_mood: buildMockAgentMood("focused"),
          plan: buildMockPlan(3),
        },
      },
    });
  }, 900);
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

function sendStreamingReply(send, session, requestId, fullText) {
  const words = fullText.split(/(\s+)/).filter((part) => part.length > 0);
  if (words.length === 0) {
    send({
      id: randomUUID(),
      type: "chat.response.chunk",
      timestamp: new Date().toISOString(),
      payload: {
        session_id: session.sessionId,
        request_id: requestId,
        delta: "",
        done: true,
      },
    });
    return;
  }

  words.forEach((word, index) => {
    setTimeout(() => {
      send({
        id: randomUUID(),
        type: "chat.response.chunk",
        timestamp: new Date().toISOString(),
        payload: {
          session_id: session.sessionId,
          request_id: requestId,
          delta: word,
          done: index === words.length - 1,
        },
      });
    }, 120 * (index + 1));
  });
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

function sendMockIntegrationsWebhosts(session, send) {
  send({
    id: randomUUID(),
    type: "integrations.webhosts",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: session.sessionId,
      webhosts: [
        {
          id: "webhost-grafana",
          name: "Grafana",
          description: "Monitoring Dashboard",
          status: "running",
          url: "http://127.0.0.1:3000",
          icon: MOCK_PERSONA_AVATAR_URL,
        },
        {
          id: "webhost-docs",
          name: "AuraGo Docs",
          description: "Internal documentation",
          status: "starting",
          url: "/docs/",
        },
      ],
    },
  });
}

function sendMockSystemWarnings(session, send) {
  const warnings = session.mockWarnings ?? [];
  const unacknowledged = warnings.filter((entry) => !entry.acknowledged).length;
  send({
    id: randomUUID(),
    type: "system.warnings",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: session.sessionId,
      warnings,
      total: warnings.length,
      unacknowledged,
    },
  });
}

function handleSystemWarningAcknowledge(message, session, send) {
  const all = message.payload?.all === true;
  const id = String(message.payload?.id ?? "");
  session.mockWarnings = (session.mockWarnings ?? []).map((entry) => {
    if (all || entry.id === id) {
      return { ...entry, acknowledged: true };
    }
    return entry;
  });
  sendMockSystemWarnings(session, send);
}

function sendMockChatMedia(send, session, requestId, conversationId) {
  const base = {
    session_id: session.sessionId,
    conversation_id: conversationId,
    request_id: requestId,
  };
  send({
    id: randomUUID(),
    type: "chat.media",
    timestamp: new Date().toISOString(),
    payload: {
      ...base,
      item: {
        id: randomUUID(),
        kind: "image",
        path: signMockAgodeskMediaPath("/api/agodesk/media/mock-chart.png"),
        title: "Mock Chart",
        caption: "Generiertes **Diagramm** aus dem Mock-Agent.",
      },
    },
  });
  send({
    id: randomUUID(),
    type: "chat.media",
    timestamp: new Date().toISOString(),
    payload: {
      ...base,
      item: {
        id: randomUUID(),
        kind: "link",
        url: "https://example.com/mock-report",
        title: "Mock Report",
        description: "Externer Bericht",
      },
    },
  });
}

wss.on("error", (error) => {
  console.error("Server-Fehler:", error.message);
});
