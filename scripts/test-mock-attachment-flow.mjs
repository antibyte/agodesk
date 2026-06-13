#!/usr/bin/env node
/**
 * End-to-end attachment flow against scripts/mock-server.mjs:
 * session.start → prepare → HTTP upload → chat.message → attachment.accepted → chat.response
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import WebSocket from "ws";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MOCK_SCRIPT = path.join(ROOT, "mock-server.mjs");
const WS_PATH = "/api/agodesk/ws";
const CLIENT_CAPS = ["chat.media_upload", "chat.sessions", "chat.attachments"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wsMessage(type, payload, id = randomUUID()) {
  return {
    id,
    type,
    timestamp: new Date().toISOString(),
    payload,
  };
}

function attachMessageBuffer(ws) {
  /** @type {Array<Record<string, unknown>>} */
  const buffer = [];
  /** @type {Array<(message: Record<string, unknown>) => void>} */
  const waiters = [];

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    buffer.push(message);
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (waiter?.(message)) {
        waiters.splice(index, 1);
      }
    }
  });

  return {
    waitFor(predicate, timeoutMs = 10_000, label = "message") {
      const existing = buffer.find(predicate);
      if (existing) {
        return Promise.resolve(existing);
      }

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.indexOf(matcher);
          if (index >= 0) {
            waiters.splice(index, 1);
          }
          const types = buffer.map((entry) => String(entry.type ?? "unknown")).join(", ");
          reject(new Error(`Timed out waiting for ${label} (${timeoutMs}ms). Seen: [${types}]`));
        }, timeoutMs);

        function matcher(message) {
          if (!predicate(message)) {
            return false;
          }
          clearTimeout(timer);
          resolve(message);
          return true;
        }

        waiters.push(matcher);
      });
    },
  };
}

async function startMockServer(port) {
  const child = spawn(process.execPath, [MOCK_SCRIPT], {
    cwd: path.join(ROOT, ".."),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      reject(new Error("Mock server failed to start."));
    }, 10_000);

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      if (text.includes("Mock AuraGo backend")) {
        clearTimeout(deadline);
        resolve();
      }
    });

    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });

    child.on("exit", (code) => {
      clearTimeout(deadline);
      reject(new Error(`Mock server exited early with code ${code ?? "unknown"}.`));
    });
  });

  return child;
}

async function uploadAttachment(uploadUrl, filename, mimeType, body) {
  const form = new FormData();
  form.append("file", new Blob([body], { type: mimeType }), filename);
  const response = await fetch(uploadUrl, { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(`Upload failed with HTTP ${response.status}.`);
  }
  return response.json();
}

async function runFlow(port) {
  const wsUrl = `ws://127.0.0.1:${port}${WS_PATH}`;
  const ws = new WebSocket(wsUrl);
  const inbox = attachMessageBuffer(ws);

  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  await inbox.waitFor((message) => message.type === "system.connected", 10_000, "system.connected");

  ws.send(
    JSON.stringify(
      wsMessage("session.start", {
        pairing_token: "mock-pairing",
        client_capabilities: CLIENT_CAPS,
      }),
    ),
  );

  const accepted = await inbox.waitFor(
    (message) => message.type === "session.accepted",
    10_000,
    "session.accepted",
  );
  const sessionId = String(accepted.payload?.session_id ?? "");
  const advertised = accepted.payload?.advertised_capabilities ?? [];
  if (!sessionId) {
    throw new Error("session.accepted missing session_id.");
  }
  if (!advertised.includes("chat.attachments") || !advertised.includes("chat.media_upload")) {
    throw new Error("session.accepted missing attachment capabilities.");
  }

  const createId = randomUUID();
  ws.send(
    JSON.stringify(wsMessage("chat.session.create", { session_id: sessionId, id: createId })),
  );

  const sessionCreated = await inbox.waitFor(
    (message) => message.type === "chat.session" && Boolean(message.payload?.conversation_id),
    10_000,
    "chat.session",
  );
  const conversationId = String(sessionCreated.payload?.conversation_id ?? "");
  if (!conversationId) {
    throw new Error("chat.session missing conversation_id.");
  }

  const prepareId = randomUUID();
  const fileBody = Buffer.from("mock attachment payload\n", "utf8");
  const filename = "notes.txt";
  const mimeType = "text/plain";

  ws.send(
    JSON.stringify(
      wsMessage("chat.attachment.prepare", {
        session_id: sessionId,
        conversation_id: conversationId,
        filename,
        mime_type: mimeType,
        size_bytes: fileBody.length,
        id: prepareId,
      }),
    ),
  );

  const prepared = await inbox.waitFor(
    (message) => message.type === "chat.attachment.prepared",
    10_000,
    "chat.attachment.prepared",
  );
  const uploadUrl = String(prepared.payload?.upload_url ?? "");
  const attachmentId = String(prepared.payload?.attachment_id ?? "");
  const uploadField = String(prepared.payload?.upload_field ?? "file");
  if (!uploadUrl || !attachmentId) {
    throw new Error("chat.attachment.prepared missing upload metadata.");
  }
  if (uploadField !== "file") {
    throw new Error(`Unexpected upload_field: ${uploadField}`);
  }

  const uploadResult = await uploadAttachment(uploadUrl, filename, mimeType, fileBody);
  if (uploadResult.attachment_id !== attachmentId) {
    throw new Error("Upload response attachment_id mismatch.");
  }

  const messageId = randomUUID();
  ws.send(
    JSON.stringify(
      wsMessage(
        "chat.message",
        {
          session_id: sessionId,
          conversation_id: conversationId,
          text: "Siehe Anhang",
          role: "user",
          attachments: [
            {
              attachment_id: attachmentId,
              filename,
              mime_type: mimeType,
              size_bytes: fileBody.length,
              path: uploadResult.path,
              kind: "document",
            },
          ],
        },
        messageId,
      ),
    ),
  );

  const attachmentAccepted = await inbox.waitFor(
    (message) =>
      message.type === "chat.attachment.accepted" && message.payload?.request_id === messageId,
    10_000,
    "chat.attachment.accepted",
  );
  const acceptedAttachments = attachmentAccepted.payload?.attachments ?? [];
  if (!Array.isArray(acceptedAttachments) || acceptedAttachments.length !== 1) {
    throw new Error("chat.attachment.accepted missing attachment list.");
  }

  const response = await inbox.waitFor(
    (message) => message.type === "chat.response" && message.payload?.request_id === messageId,
    15_000,
    "chat.response",
  );
  const reply = String(response.payload?.text ?? "");
  if (!reply.includes("Anhang")) {
    throw new Error(`chat.response did not acknowledge attachments: ${reply}`);
  }

  ws.close();
}

async function main() {
  const port = 18_080 + Math.floor(Math.random() * 1000);
  const mock = await startMockServer(port);

  try {
    await runFlow(port);
    console.log("mock attachment flow: OK");
  } finally {
    mock.kill();
    await sleep(200);
  }
}

main().catch((error) => {
  console.error("mock attachment flow: FAIL", error);
  process.exitCode = 1;
});
