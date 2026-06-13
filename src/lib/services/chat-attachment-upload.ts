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
): Promise<UploadedChatAttachmentResponse> {
  const uploadUrl = resolveUploadUrl(serverUrl, prepared.upload_url);
  const pinnedFingerprint = await resolvePinnedFingerprint(uploadUrl, serverUrl);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { deviceId, sessionId } = get(sessionState);
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<UploadedChatAttachmentResponse>("upload_chat_attachment", {
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
): Promise<UploadedChatAttachmentResponse> {
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
    const json = (await response.json()) as UploadedChatAttachmentResponse;
    return {
      attachment_id: json.attachment_id ?? prepared.attachment_id,
      path: json.path,
      mime_type: json.mime_type ?? file.type,
      size_bytes: json.size_bytes ?? file.size,
      status: json.status,
    };
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
    if (isTauriRuntime()) {
      return await uploadViaTauri(serverUrl, prepared, file);
    }
    return await uploadViaFetch(serverUrl, prepared, file);
  } catch (error) {
    throw new Error(formatInvokeError(error, "Attachment upload failed"));
  }
}
