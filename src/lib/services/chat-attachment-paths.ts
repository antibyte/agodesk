import { writable } from "svelte/store";

import type { ChatAttachmentItem, ChatMediaItem, ChatMessage } from "../types/protocol";

const signedPathByAttachmentId = new Map<string, string>();
const storageFilenameByAttachmentId = new Map<string, string>();
const localPreviewByAttachmentId = new Map<string, string>();

/** Bumped when signed attachment paths are registered (for reactive media reload). */
export const signedAttachmentPathsVersion = writable(0);

function looksLikeAttachmentId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("att-")) {
    return true;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    trimmed,
  );
}

export function extractAttachmentIdFromMediaPath(path?: string): string | undefined {
  const trimmed = path?.trim();
  if (!trimmed) {
    return undefined;
  }
  const pathOnly = trimmed.split("?")[0] ?? trimmed;
  const uploadMatch = pathOnly.match(/\/api\/agodesk\/media\/upload\/([^/]+)$/i);
  if (uploadMatch?.[1]) {
    return uploadMatch[1];
  }
  const mediaMatch = pathOnly.match(/\/api\/agodesk\/media\/([^/]+)\/[^/]+$/i);
  if (mediaMatch?.[1] && mediaMatch[1].toLowerCase() !== "upload") {
    return mediaMatch[1];
  }
  return undefined;
}

export function findUserAttachmentsForRequest(
  requestId: string | undefined,
  messages: ChatMessage[],
): ChatAttachmentItem[] | undefined {
  if (!requestId?.trim()) {
    return undefined;
  }
  const message = messages.find(
    (entry) => entry.id === requestId.trim() && entry.role === "user",
  );
  return message?.attachments?.length ? message.attachments : undefined;
}

export function findAttachmentByFilename(
  filename: string | undefined,
  messages: ChatMessage[],
): ChatAttachmentItem | undefined {
  const label = filename?.trim();
  if (!label) {
    return undefined;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user" || !message.attachments?.length) {
      continue;
    }
    const match = message.attachments.find((entry) => entry.filename === label);
    if (match) {
      return match;
    }
  }
  return undefined;
}

export function getLocalAttachmentPreviewForRequest(
  requestId: string | undefined,
  messages: ChatMessage[],
  filename?: string,
): string | undefined {
  const attachments = findUserAttachmentsForRequest(requestId, messages);
  if (!attachments?.length) {
    return undefined;
  }
  const label = filename?.trim();
  const attachment = label
    ? attachments.find((entry) => entry.filename === label) ?? attachments[0]
    : attachments[0];
  if (!attachment?.attachment_id) {
    return undefined;
  }
  return getLocalAttachmentPreview(attachment.attachment_id);
}

export function buildAttachmentMediaPath(attachmentId: string, filename: string): string {
  const id = attachmentId.trim();
  const basename = (filename.split(/[/\\]/).pop() ?? filename).trim();
  if (!id || !basename) {
    return "";
  }
  return `/api/agodesk/media/${id}/${encodeURIComponent(basename)}`;
}

export function registerSignedAttachmentPaths(
  entries: Array<{
    attachment_id: string;
    path?: string;
    agent_path?: string;
    metadata?: { storage_filename?: string };
  }>,
): void {
  let changed = false;
  for (const entry of entries) {
    const attachmentId = entry.attachment_id?.trim();
    if (!attachmentId) {
      continue;
    }
    const path = entry.path?.trim() || entry.agent_path?.trim();
    if (path) {
      signedPathByAttachmentId.set(attachmentId, path);
      changed = true;
    }
    const storageFilename = entry.metadata?.storage_filename?.trim();
    if (storageFilename) {
      storageFilenameByAttachmentId.set(attachmentId, storageFilename);
      changed = true;
    }
  }
  if (changed) {
    signedAttachmentPathsVersion.update((version) => version + 1);
  }
}

export function getAttachmentStorageFilename(attachmentId: string): string | undefined {
  return storageFilenameByAttachmentId.get(attachmentId.trim());
}

export function getSignedAttachmentPath(attachmentId: string): string | undefined {
  return signedPathByAttachmentId.get(attachmentId.trim());
}

export function setLocalAttachmentPreview(attachmentId: string, file: File): string {
  const id = attachmentId.trim();
  revokeLocalAttachmentPreview(id);
  const url = URL.createObjectURL(file);
  localPreviewByAttachmentId.set(id, url);
  return url;
}

export function getLocalAttachmentPreview(attachmentId: string): string | undefined {
  return localPreviewByAttachmentId.get(attachmentId.trim());
}

export function revokeLocalAttachmentPreview(attachmentId: string): void {
  const id = attachmentId.trim();
  const existing = localPreviewByAttachmentId.get(id);
  if (existing) {
    URL.revokeObjectURL(existing);
    localPreviewByAttachmentId.delete(id);
  }
}

export function clearAttachmentPathCache(): void {
  signedPathByAttachmentId.clear();
  storageFilenameByAttachmentId.clear();
  for (const url of localPreviewByAttachmentId.values()) {
    URL.revokeObjectURL(url);
  }
  localPreviewByAttachmentId.clear();
  signedAttachmentPathsVersion.set(0);
}

export function resolveAttachmentIdForMedia(
  item: Pick<ChatMediaItem, "id" | "request_id" | "filename" | "title" | "path"> & {
    attachment_id?: string;
  },
  userAttachments?: ChatAttachmentItem[],
  messages: ChatMessage[] = [],
): string | undefined {
  if (item.attachment_id?.trim()) {
    return item.attachment_id.trim();
  }

  const fromPath =
    extractAttachmentIdFromMediaPath(item.path) ??
    extractAttachmentIdFromMediaPath(item.title) ??
    extractAttachmentIdFromMediaPath(item.filename);
  if (fromPath) {
    return fromPath;
  }

  if (userAttachments?.length) {
    const label = item.filename?.trim() || item.title?.trim();
    if (label) {
      const match = userAttachments.find((entry) => entry.filename === label);
      if (match?.attachment_id) {
        return match.attachment_id;
      }
    }
    if (userAttachments.length === 1 && userAttachments[0]?.attachment_id) {
      return userAttachments[0].attachment_id;
    }
  }

  const requestAttachments = findUserAttachmentsForRequest(item.request_id, messages);
  if (requestAttachments?.length) {
    const label = item.filename?.trim() || item.title?.trim();
    if (label) {
      const match = requestAttachments.find((entry) => entry.filename === label);
      if (match?.attachment_id) {
        return match.attachment_id;
      }
    }
    if (requestAttachments.length === 1 && requestAttachments[0]?.attachment_id) {
      return requestAttachments[0].attachment_id;
    }
  }

  const recentMatch = findAttachmentByFilename(item.filename ?? item.title, messages);
  if (recentMatch?.attachment_id) {
    return recentMatch.attachment_id;
  }

  if (item.id?.trim() && looksLikeAttachmentId(item.id)) {
    return item.id.trim();
  }

  return undefined;
}
