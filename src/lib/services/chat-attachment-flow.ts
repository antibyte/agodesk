import type {
  ChatAttachmentItem,
  ChatAttachmentPreparedPayload,
  WsMessage,
} from "../types/protocol";
import {
  inferAttachmentKindFromMime,
  normalizeChatAttachmentAcceptedPayload,
  normalizeChatAttachmentPreparedPayload,
} from "../types/protocol";
import { registerSignedAttachmentPaths } from "./chat-attachment-paths";
import { chatMessages } from "../stores/chat";
import { buildAttachmentMediaPath } from "./chat-attachment-paths";

const PREPARE_TIMEOUT_MS = 30_000;

interface PrepareWaiter {
  resolve: (payload: ChatAttachmentPreparedPayload) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const prepareWaiters = new Map<string, PrepareWaiter>();

export function handleChatAttachmentPreparedMessage(message: WsMessage): boolean {
  const payload = normalizeChatAttachmentPreparedPayload(message.payload);
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

export function rejectPendingAttachmentPrepare(prepareId: string, error: Error): void {
  const waiter = prepareWaiters.get(prepareId);
  if (!waiter) {
    return;
  }
  clearTimeout(waiter.timer);
  prepareWaiters.delete(prepareId);
  waiter.reject(error);
}

export function rejectAttachmentPrepareByRequestId(
  requestId: string | undefined,
  message: string,
): boolean {
  if (!requestId) {
    return false;
  }
  if (!prepareWaiters.has(requestId)) {
    return false;
  }
  rejectPendingAttachmentPrepare(requestId, new Error(message));
  return true;
}

export function rejectAnyPendingAttachmentPrepare(error: Error): boolean {
  if (prepareWaiters.size === 0) {
    return false;
  }
  for (const prepareId of [...prepareWaiters.keys()]) {
    rejectPendingAttachmentPrepare(prepareId, error);
  }
  return true;
}

function waitForAttachmentPrepared(prepareId: string): Promise<ChatAttachmentPreparedPayload> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      prepareWaiters.delete(prepareId);
      reject(new Error("Attachment prepare timed out."));
    }, PREPARE_TIMEOUT_MS);
    prepareWaiters.set(prepareId, { resolve, reject, timer });
  });
}

export interface PrepareChatAttachmentInput {
  sessionId: string;
  conversationId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export function buildChatAttachmentPrepareMessage(input: PrepareChatAttachmentInput): WsMessage {
  const prepareId = crypto.randomUUID();
  return {
    id: prepareId,
    type: "chat.attachment.prepare",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: input.sessionId,
      conversation_id: input.conversationId,
      filename: input.filename,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
    },
  };
}

export async function prepareChatAttachment(
  wsSend: (message: WsMessage) => Promise<void>,
  input: PrepareChatAttachmentInput,
): Promise<ChatAttachmentPreparedPayload> {
  const message = buildChatAttachmentPrepareMessage(input);
  const waitPromise = waitForAttachmentPrepared(message.id);
  await wsSend(message);
  return waitPromise;
}

export interface UploadedChatAttachmentResult {
  attachment_id: string;
  path?: string;
  mime_type?: string;
  size_bytes?: number;
}

export function toChatAttachmentItem(
  upload: UploadedChatAttachmentResult,
  filename: string,
  mimeType: string,
  sizeBytes?: number,
  fallbackAttachmentId?: string,
): ChatAttachmentItem {
  const attachment_id = upload.attachment_id?.trim() || fallbackAttachmentId?.trim() || "";
  if (!attachment_id) {
    throw new Error("attachment_id is required");
  }
  const resolvedMime = upload.mime_type || mimeType;
  const path = upload.path?.trim() || buildAttachmentMediaPath(attachment_id, filename);
  return {
    attachment_id,
    filename,
    mime_type: resolvedMime,
    ...((upload.size_bytes ?? sizeBytes) ? { size_bytes: upload.size_bytes ?? sizeBytes } : {}),
    ...(path ? { path } : {}),
    kind: inferAttachmentKindFromMime(resolvedMime),
  };
}

export function handleChatAttachmentAcceptedMessage(payload: unknown): boolean {
  const normalized = normalizeChatAttachmentAcceptedPayload(payload);
  if (!normalized) {
    return false;
  }

  registerSignedAttachmentPaths(normalized.attachments);
  chatMessages.updateMessageAttachments(normalized.request_id, normalized.attachments);
  return true;
}
