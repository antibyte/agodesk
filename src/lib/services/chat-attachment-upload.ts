import { get } from "svelte/store";

import { resolvePersonaAssetUrl } from "../types/protocol";
import { formatInvokeError } from "./errors";
import { getPinnedFingerprint, getPinnedFingerprintForHttpUrl } from "./tls";
import { sessionState } from "../stores/session";
import type { ChatAttachmentPreparedPayload } from "../types/protocol";

export interface UploadedChatAttachmentResponse {
  attachment_id: string;
  status?: string;
  path?: string;
  mime_type?: string;
  size_bytes?: number;
}

function readUploadString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readUploadNumber(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

/** Tauri invoke and some AuraGo responses use camelCase field names. */
export function normalizeUploadedAttachmentResponse(
  raw: unknown,
  fallbackAttachmentId: string,
): UploadedChatAttachmentResponse {
  const fallback = fallbackAttachmentId.trim();
  if (!raw || typeof raw !== "object") {
    if (!fallback) {
      throw new Error("Upload response missing attachment_id.");
    }
    return { attachment_id: fallback, status: "ready" };
  }

  const record = raw as Record<string, unknown>;
  const attachment_id =
    readUploadString(record, "attachment_id", "attachmentId", "id") ?? fallback;
  if (!attachment_id) {
    throw new Error("Upload response missing attachment_id.");
  }

  return {
    attachment_id,
    status: readUploadString(record, "status"),
    path: readUploadString(record, "path", "media_path", "mediaPath", "agent_path", "agentPath"),
    mime_type: readUploadString(record, "mime_type", "mimeType"),
    size_bytes: readUploadNumber(record, "size_bytes", "sizeBytes"),
  };
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function resolveUploadUrl(serverUrl: string, uploadUrl: string): string {
  const resolved = resolvePersonaAssetUrl(serverUrl, uploadUrl);
  if (resolved) {
    return resolved;
  }
  const trimmed = uploadUrl.trim();
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }
  throw new Error("Upload URL could not be resolved against the server URL.");
}

function httpOriginForUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

async function resolvePinnedFingerprint(
  uploadUrl: string,
  serverUrl: string,
): Promise<string | null> {
  const assetOriginPin = await getPinnedFingerprintForHttpUrl(uploadUrl).catch(() => null);
  if (assetOriginPin) {
    return assetOriginPin;
  }
  const uploadOrigin = httpOriginForUrl(uploadUrl);
  const serverOrigin = httpOriginForUrl(serverUrl);
  if (uploadOrigin && uploadOrigin === serverOrigin) {
    return getPinnedFingerprint(serverUrl).catch(() => null);
  }
  return null;
}

async function uploadViaTauri(
  serverUrl: string,
  prepared: ChatAttachmentPreparedPayload,
  file: File,
): Promise<unknown> {
  const uploadUrl = resolveUploadUrl(serverUrl, prepared.upload_url);
  const pinnedFingerprint = await resolvePinnedFingerprint(uploadUrl, serverUrl);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { deviceId, sessionId } = get(sessionState);
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<unknown>("upload_chat_attachment", {
    serverUrl,
    uploadUrl,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes,
    uploadField: prepared.upload_field,
    ...(pinnedFingerprint ? { pinnedFingerprint } : {}),
    ...(deviceId ? { deviceId } : {}),
    ...(sessionId ? { sessionId } : {}),
  });
}

async function uploadViaFetch(
  serverUrl: string,
  prepared: ChatAttachmentPreparedPayload,
  file: File,
): Promise<unknown> {
  const uploadUrl = resolveUploadUrl(serverUrl, prepared.upload_url);
  const form = new FormData();
  form.append(prepared.upload_field, file, file.name);
  const response = await fetch(uploadUrl, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Upload failed with HTTP ${response.status}.`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }
  return {
    attachment_id: prepared.attachment_id,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    status: "ready",
  };
}

export async function uploadChatAttachmentFile(
  serverUrl: string,
  prepared: ChatAttachmentPreparedPayload,
  file: File,
): Promise<UploadedChatAttachmentResponse> {
  if (file.size > prepared.max_bytes) {
    throw new Error("File exceeds server upload limit.");
  }

  try {
    const raw = isTauriRuntime()
      ? await uploadViaTauri(serverUrl, prepared, file)
      : await uploadViaFetch(serverUrl, prepared, file);
    return normalizeUploadedAttachmentResponse(raw, prepared.attachment_id);
  } catch (error) {
    throw new Error(formatInvokeError(error, "Attachment upload failed"));
  }
}
