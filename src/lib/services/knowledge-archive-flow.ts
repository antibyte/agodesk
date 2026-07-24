import type {
  KnowledgeArchivePreparedDocument,
  KnowledgeArchivePreparedPayload,
  KnowledgeArchiveStatusPayload,
  WsMessage,
} from "../types/protocol";
import {
  normalizeKnowledgeArchivePreparedPayload,
  normalizeKnowledgeArchiveStatusPayload,
} from "../types/protocol";
import { uploadKnowledgeArchiveFile } from "./knowledge-archive-upload";

const PREPARE_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 180_000;

interface PrepareWaiter {
  resolve: (payload: KnowledgeArchivePreparedPayload) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface StatusWaiter {
  resolve: (payload: KnowledgeArchiveStatusPayload) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const prepareWaiters = new Map<string, PrepareWaiter>();
const statusWaiters = new Map<string, StatusWaiter>();

export function handleKnowledgeArchivePreparedMessage(message: WsMessage): boolean {
  const payload = normalizeKnowledgeArchivePreparedPayload(message.payload);
  if (!payload) {
    return false;
  }
  const waiter = prepareWaiters.get(payload.prepare_id);
  if (!waiter) {
    return false;
  }
  clearTimeout(waiter.timer);
  prepareWaiters.delete(payload.prepare_id);
  waiter.resolve(payload);
  return true;
}

export function handleKnowledgeArchiveStatusMessage(payload: unknown): boolean {
  const normalized = normalizeKnowledgeArchiveStatusPayload(payload);
  if (!normalized) {
    return false;
  }
  // Only terminal states settle a pending waiter; intermediate states are informational.
  if (normalized.state !== "ready" && normalized.state !== "failed") {
    return true;
  }
  const waiter = statusWaiters.get(normalized.document_id);
  if (!waiter) {
    return true;
  }
  clearTimeout(waiter.timer);
  statusWaiters.delete(normalized.document_id);
  waiter.resolve(normalized);
  return true;
}

export function rejectAnyPendingKnowledgeArchive(error: Error): boolean {
  let rejected = false;
  for (const [prepareId, waiter] of [...prepareWaiters.entries()]) {
    clearTimeout(waiter.timer);
    prepareWaiters.delete(prepareId);
    waiter.reject(error);
    rejected = true;
  }
  for (const [documentId, waiter] of [...statusWaiters.entries()]) {
    clearTimeout(waiter.timer);
    statusWaiters.delete(documentId);
    waiter.reject(error);
    rejected = true;
  }
  return rejected;
}

function waitForPrepared(prepareId: string): Promise<KnowledgeArchivePreparedPayload> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      prepareWaiters.delete(prepareId);
      reject(new Error("Knowledge archive prepare timed out."));
    }, PREPARE_TIMEOUT_MS);
    prepareWaiters.set(prepareId, { resolve, reject, timer });
  });
}

function waitForStatus(documentId: string): Promise<KnowledgeArchiveStatusPayload> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      statusWaiters.delete(documentId);
      reject(new Error("Knowledge archive processing timed out."));
    }, STATUS_TIMEOUT_MS);
    statusWaiters.set(documentId, { resolve, reject, timer });
  });
}

export interface KnowledgeArchivePrepareInput {
  sessionId: string;
  files: File[];
}

export function buildKnowledgeArchivePrepareMessage(
  input: KnowledgeArchivePrepareInput,
): WsMessage {
  const prepareId = crypto.randomUUID();
  return {
    id: prepareId,
    type: "knowledge.archive.prepare",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: input.sessionId,
      files: input.files.map((file) => ({
        filename: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      })),
    },
  };
}

/** Pair prepared documents to selected files by filename (fallback: order). */
function matchDocumentToFile(
  document: KnowledgeArchivePreparedDocument,
  files: File[],
  used: Set<number>,
  fallbackIndex: number,
): File | null {
  const byName = files.findIndex(
    (file, index) => !used.has(index) && file.name === document.filename,
  );
  if (byName !== -1) {
    used.add(byName);
    return files[byName] ?? null;
  }
  if (!used.has(fallbackIndex) && files[fallbackIndex]) {
    used.add(fallbackIndex);
    return files[fallbackIndex] ?? null;
  }
  return null;
}

export interface KnowledgeArchiveResultItem {
  filename: string;
  document_id: string;
  state: "ready" | "failed" | "processing";
  error?: string;
  chunk_count?: number;
}

export interface AddToKnowledgeArchiveResult {
  items: KnowledgeArchiveResultItem[];
  readyCount: number;
  failedCount: number;
  processingCount: number;
}

/**
 * Full flow: prepare (WS) -> upload each file (HTTP) -> await terminal status (WS).
 * Separate from chat.attachment.* — documents go into the AuraGo knowledge archive.
 */
export async function addFilesToKnowledgeArchive(
  wsSend: (message: WsMessage) => Promise<void>,
  serverUrl: string,
  sessionId: string,
  files: File[],
): Promise<AddToKnowledgeArchiveResult> {
  const message = buildKnowledgeArchivePrepareMessage({ sessionId, files });
  const preparedPromise = waitForPrepared(message.id);
  await wsSend(message);
  const prepared = await preparedPromise;

  const used = new Set<number>();
  const items: KnowledgeArchiveResultItem[] = [];

  await Promise.all(
    prepared.documents.map(async (document, index) => {
      const file = matchDocumentToFile(document, files, used, index);
      if (!file) {
        items.push({
          filename: document.filename,
          document_id: document.document_id,
          state: "failed",
          error: "No matching local file for prepared document.",
        });
        return;
      }

      const statusPromise = waitForStatus(document.document_id);
      try {
        await uploadKnowledgeArchiveFile(serverUrl, document, file);
      } catch (error) {
        statusWaiters.delete(document.document_id);
        items.push({
          filename: file.name,
          document_id: document.document_id,
          state: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      try {
        const status = await statusPromise;
        items.push({
          filename: file.name,
          document_id: document.document_id,
          state: status.state === "ready" ? "ready" : "failed",
          ...(status.error ? { error: status.error } : {}),
          ...(status.chunk_count !== undefined ? { chunk_count: status.chunk_count } : {}),
        });
      } catch {
        // Upload succeeded but no terminal status within the window — still ingesting.
        items.push({
          filename: file.name,
          document_id: document.document_id,
          state: "processing",
        });
      }
    }),
  );

  const readyCount = items.filter((item) => item.state === "ready").length;
  const failedCount = items.filter((item) => item.state === "failed").length;
  const processingCount = items.filter((item) => item.state === "processing").length;
  return { items, readyCount, failedCount, processingCount };
}
