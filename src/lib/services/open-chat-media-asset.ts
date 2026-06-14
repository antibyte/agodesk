import { invoke } from "@tauri-apps/api/core";
import { fetchFirstChatMediaItemAssetDataUrl, type ChatMediaAssetRefs } from "./server-asset-fetch";
import { getLocalAttachmentPreview } from "./chat-attachment-paths";
import { isDesktopShell } from "./window-controls";
import type { ChatAttachmentItem, ChatMediaItem, ChatMessage } from "../types/protocol";

function extractBase64FromDataUrl(dataUrl: string): string | null {
  if (!dataUrl.startsWith("data:")) {
    return null;
  }
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    return null;
  }
  return dataUrl.slice(commaIndex + 1);
}

async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function openDataUrlAsFile(dataUrl: string, filename: string): Promise<void> {
  let source = dataUrl;
  if (dataUrl.startsWith("blob:")) {
    source = await blobUrlToDataUrl(dataUrl);
  }

  const base64 = extractBase64FromDataUrl(source);
  if (!base64) {
    throw new Error("Invalid media data");
  }

  const bytes = base64ToBytes(base64);
  const safeName = filename.trim() || "attachment";

  if (isDesktopShell()) {
    await invoke("open_temp_file", { filename: safeName, bytes: Array.from(bytes) });
    return;
  }

  const blob = new Blob([bytes]);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface OpenChatMediaAssetOptions {
  serverUrl: string;
  filename: string;
  refs: ChatMediaAssetRefs;
  context?: {
    mediaItem?: Pick<
      ChatMediaItem,
      "id" | "request_id" | "filename" | "title" | "path" | "attachment_id"
    >;
    messages?: ChatMessage[];
    userAttachments?: ChatAttachmentItem[];
  };
  existingDataUrl?: string | null;
}

export async function openAuthenticatedChatMediaAsset(
  options: OpenChatMediaAssetOptions,
): Promise<void> {
  const { serverUrl, filename, refs, context, existingDataUrl } = options;

  if (existingDataUrl) {
    await openDataUrlAsFile(existingDataUrl, filename);
    return;
  }

  const attachmentId = refs.attachment_id?.trim();
  if (attachmentId) {
    const local = getLocalAttachmentPreview(attachmentId);
    if (local) {
      await openDataUrlAsFile(local, filename);
      return;
    }
  }

  if (!serverUrl.trim()) {
    throw new Error("No server URL");
  }

  const fetched = await fetchFirstChatMediaItemAssetDataUrl(serverUrl, refs, context ?? {});
  if (!fetched?.dataUrl) {
    throw new Error("Media could not be loaded");
  }

  await openDataUrlAsFile(fetched.dataUrl, filename);
}
