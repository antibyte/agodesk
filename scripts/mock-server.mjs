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
  params.set("agodesk_sig", createHmac("sha256", MOCK_MEDIA_SECRET).update(material).digest("hex"));
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

/** @type {Map<string, { body: Buffer; mimeType: string; filename: string }>} */
const uploadedMediaBodies = new Map();

/** @type {Map<string, { attachmentId: string; filename: string; mimeType: string; sizeBytes: number; status: string; path?: string }>} */
const pendingAttachmentUploads = new Map();

const DEFAULT_ATTACHMENT_LIMITS = {
  max_file_bytes: 8 * 1024 * 1024,
  max_files_per_message: 5,
  max_total_bytes_per_message: 24 * 1024 * 1024,
  allowed_mime_prefixes: ["image/", "text/", "application/pdf"],
};

function resolveAdvertisedCapabilities(clientCaps) {
  const advertised = clientCaps.length > 0 ? [...clientCaps] : [...DEFAULT_ADVERTISED_CAPABILITIES];
  if (clientCaps.includes("chat.media_upload")) {
    for (const cap of ["chat.media_upload", "chat.attachments"]) {
      if (!advertised.includes(cap)) {
        advertised.push(cap);
      }
    }
  }
  return advertised;
}

function inferAttachmentKind(mimeType) {
  const mime = String(mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  return "document";
}

function extractMultipartFileBody(rawBody, fieldName = "file") {
  const marker = Buffer.from(`name="${fieldName}"`);
  const start = rawBody.indexOf(marker);
  if (start < 0) {
    return rawBody;
  }
  const headerEnd = rawBody.indexOf(Buffer.from("\r\n\r\n"), start);
  if (headerEnd < 0) {
    return rawBody;
  }
  const bodyStart = headerEnd + 4;
  const boundaryStart = rawBody.indexOf(Buffer.from("\r\n--"), bodyStart);
  if (boundaryStart < 0) {
    return rawBody.subarray(bodyStart);
  }
  return rawBody.subarray(bodyStart, boundaryStart);
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (requestUrl.pathname.startsWith("/api/agodesk/media/")) {
    if (!verifyMockAgodeskMediaRequest(requestUrl)) {
      res.writeHead(401, { "Content-Type": "text/plain" });
      res.end("unauthorized");
      return;
    }

    const uploadMatch = requestUrl.pathname.match(/^\/api\/agodesk\/media\/upload\/([^/]+)$/);
    if (req.method === "POST" && uploadMatch) {
      const attachmentId = uploadMatch[1];
      const pending = pendingAttachmentUploads.get(attachmentId);
      if (!pending || pending.status !== "pending") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("unknown attachment");
        return;
      }
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const rawBody = Buffer.concat(chunks);
        const fileBody = extractMultipartFileBody(rawBody, "file");
        if (fileBody.length > DEFAULT_ATTACHMENT_LIMITS.max_file_bytes) {
          res.writeHead(413, { "Content-Type": "text/plain" });
          res.end("too large");
          return;
        }
        const mediaPath = signMockAgodeskMediaPath(
          `/api/agodesk/media/${attachmentId}/${pending.filename}`,
        );
        uploadedMediaBodies.set(mediaPath.split("?")[0], {
          body: fileBody,
          mimeType: pending.mimeType,
          filename: pending.filename,
        });
        pendingAttachmentUploads.set(attachmentId, {
          ...pending,
          status: "ready",
          path: mediaPath,
        });
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            attachment_id: attachmentId,
            status: "ready",
            path: mediaPath,
            mime_type: pending.mimeType,
            size_bytes: fileBody.length,
          }),
        );
      });
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

    const stored = uploadedMediaBodies.get(requestUrl.pathname);
    if (stored) {
      res.writeHead(200, {
        "Content-Type": stored.mimeType || "application/octet-stream",
        "Content-Length": stored.body.length,
      });
      res.end(stored.body);
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

      case "chat.attachment.prepare":
        handleChatAttachmentPrepare(message, session, send);
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
        if (message.payload?.success && message.payload?.data?.active === false) {
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
  const advertised = resolveAdvertisedCapabilities(session.clientCapabilities);
  send({
    id: randomUUID(),
    type: "session.accepted",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: acceptedSessionId,
      advertised_capabilities: advertised,
      ...(advertised.includes("chat.media_upload")
        ? { attachment_limits: DEFAULT_ATTACHMENT_LIMITS }
        : {}),
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

  const expectedProof = computeSharedKeyProof(sharedKey, message.id, deviceId, nonce, timestamp);

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
              ...(message.attachments ? { attachments: message.attachments } : {}),
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

function handleChatAttachmentPrepare(message, session, send) {
  const payload = message.payload ?? {};
  const clientSessionId = String(payload.session_id ?? "");
  const conversationId = String(payload.conversation_id ?? "");
  const filename = String(payload.filename ?? "").slice(0, 255);
  const mimeType = String(payload.mime_type ?? "application/octet-stream");
  const sizeBytes = Number(payload.size_bytes ?? 0);

  if (clientSessionId !== session.sessionId) {
    sendSessionError(send, message.id, "SESSION_NOT_FOUND", "Session nicht gefunden.");
    return;
  }
  if (!conversationId || !filename || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    sendSessionError(send, message.id, "ATTACHMENT_REJECTED", "Ungültige Prepare-Anfrage.");
    return;
  }
  if (sizeBytes > DEFAULT_ATTACHMENT_LIMITS.max_file_bytes) {
    sendSessionError(send, message.id, "ATTACHMENT_TOO_LARGE", "Datei ist zu groß.");
    return;
  }
  const allowed = DEFAULT_ATTACHMENT_LIMITS.allowed_mime_prefixes.some((prefix) =>
    mimeType.toLowerCase().startsWith(prefix),
  );
  if (!allowed && mimeType !== "application/octet-stream") {
    sendSessionError(send, message.id, "ATTACHMENT_MIME_NOT_ALLOWED", "MIME-Typ nicht erlaubt.");
    return;
  }

  const attachmentId = `att-${randomUUID().slice(0, 8)}`;
  const uploadPath = signMockAgodeskMediaPath(`/api/agodesk/media/upload/${attachmentId}`);
  const uploadUrl = `http://127.0.0.1:${PORT}${uploadPath}`;
  pendingAttachmentUploads.set(attachmentId, {
    attachmentId,
    filename,
    mimeType,
    sizeBytes,
    status: "pending",
  });

  send({
    id: randomUUID(),
    type: "chat.attachment.prepared",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: session.sessionId,
      conversation_id: conversationId,
      prepare_id: message.id,
      attachment_id: attachmentId,
      upload_url: uploadUrl,
      upload_method: "POST",
      upload_field: "file",
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      max_bytes: DEFAULT_ATTACHMENT_LIMITS.max_file_bytes,
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
  const attachments = Array.isArray(message.payload?.attachments)
    ? message.payload.attachments
    : [];
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
        message: "chat.message muss die session_id aus session.accepted verwenden.",
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
    conversation.messages.push({
      role: "user",
      content: text,
      timestamp: now,
      ...(attachments.length ? { attachments } : {}),
    });
    conversation.last_active_at = now;
    if (!conversation.preview) {
      conversation.preview = text.trim().slice(0, 80);
    }
  } else if (attachments.length > 0) {
    const now = new Date().toISOString();
    if (!conversation) {
      conversation = createMockConversation(session);
    }
    conversation.messages.push({
      role: "user",
      content: "",
      timestamp: now,
      attachments,
    });
    conversation.last_active_at = now;
    if (!conversation.preview) {
      conversation.preview = `[${attachments.length} Anhang/Anhänge]`;
    }
  }

  const activeConversationId = conversation?.id ?? (conversationId || null);

  if (attachments.length > 0) {
    send({
      id: randomUUID(),
      type: "chat.attachment.accepted",
      timestamp: new Date().toISOString(),
      payload: {
        session_id: session.sessionId,
        conversation_id: activeConversationId ?? conversationId,
        request_id: requestId,
        attachments: attachments.map((entry) => ({
          attachment_id: String(entry.attachment_id ?? ""),
          status: "accepted",
          kind: entry.kind ?? inferAttachmentKind(entry.mime_type),
          path: entry.path,
        })),
      },
    });
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

  if (text.trim().toLowerCase() === "/newsession") {
    sendSessionClear(session, send, "Mock: neue Session gestartet (Chat-Verlauf gelöscht).");
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

  const replyText =
    attachments.length > 0
      ? `${mockReply(text)}\n\n(Mock: ${attachments.length} Anhang/Anhänge empfangen.)`
      : mockReply(text);
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
    setTimeout(
      () => {
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
      },
      120 * (index + 1),
    );
  });
}

function sharedKeyBytes(sharedKey) {
  const trimmed = sharedKey.trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return Buffer.from(trimmed, "hex");
  }
  return Buffer.from(trimmed, "utf8");
}

function computeSharedKeyProof(sharedKey, envelopeId, deviceId, nonce, timestamp) {
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
