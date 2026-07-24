import { get } from "svelte/store";

import { resolvePersonaAssetUrl } from "../types/protocol";
import type { KnowledgeArchivePreparedDocument } from "../types/protocol";
import { formatInvokeError } from "./errors";
import { getPinnedFingerprint, getPinnedFingerprintForHttpUrl } from "./tls";
import { sessionState } from "../stores/session";

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
  document: KnowledgeArchivePreparedDocument,
  file: File,
): Promise<void> {
  const uploadUrl = resolveUploadUrl(serverUrl, document.upload_url);
  const pinnedFingerprint = await resolvePinnedFingerprint(uploadUrl, serverUrl);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { deviceId, sessionId } = get(sessionState);
  const { invoke } = await import("@tauri-apps/api/core");
  // Reuses the generic multipart uploader; the knowledge document_id is already known
  // from knowledge.archive.prepared, so the response body is not needed here.
  await invoke<unknown>("upload_chat_attachment", {
    serverUrl,
    uploadUrl,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes,
    uploadField: document.upload_field,
    ...(pinnedFingerprint ? { pinnedFingerprint } : {}),
    ...(deviceId ? { deviceId } : {}),
    ...(sessionId ? { sessionId } : {}),
  });
}

async function uploadViaFetch(
  serverUrl: string,
  document: KnowledgeArchivePreparedDocument,
  file: File,
): Promise<void> {
  const uploadUrl = resolveUploadUrl(serverUrl, document.upload_url);
  const form = new FormData();
  form.append(document.upload_field, file, file.name);
  const response = await fetch(uploadUrl, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Upload failed with HTTP ${response.status}.`);
  }
}

/** Upload one prepared knowledge document. Resolves on HTTP success (state comes via WS). */
export async function uploadKnowledgeArchiveFile(
  serverUrl: string,
  document: KnowledgeArchivePreparedDocument,
  file: File,
): Promise<void> {
  if (file.size > document.max_bytes) {
    throw new Error("File exceeds server upload limit.");
  }

  try {
    if (isTauriRuntime()) {
      await uploadViaTauri(serverUrl, document, file);
    } else {
      await uploadViaFetch(serverUrl, document, file);
    }
  } catch (error) {
    throw new Error(formatInvokeError(error, "Knowledge archive upload failed"));
  }
}
