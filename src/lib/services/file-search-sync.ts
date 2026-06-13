import { invoke } from "@tauri-apps/api/core";
import type { FileAccessSettings } from "../types/protocol";
import { auditFileAccess, fileAccessIsConfigured, toInvokeRoots } from "./file-access";

function mapRootsForInvoke(settings: FileAccessSettings) {
  return toInvokeRoots(settings.roots).map((root) => ({
    root_id: root.rootId,
    canonical_path: root.canonicalPath,
    permissions: root.permissions,
  }));
}

function mapFileError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export interface FileSearchJsonResult {
  status: string;
  message?: string;
  data?: unknown;
}

export function parseFileSearchContent(content: string): FileSearchJsonResult | null {
  try {
    const parsed = JSON.parse(content) as FileSearchJsonResult;
    if (typeof parsed.status === "string") {
      return parsed;
    }
  } catch {
    // Fall through — caller treats unparsable content as opaque success payload.
  }
  return null;
}

export function fileSearchErrorCode(message: string): string {
  const known = [
    "FILE_ACCESS_DISABLED",
    "FILE_ACCESS_DENIED",
    "FILE_PATH_DENIED",
    "FILE_NOT_FOUND",
    "FILE_SEARCH_INDEX_TIMEOUT",
  ];
  const trimmed = message.trim();
  if (known.includes(trimmed)) {
    return trimmed;
  }
  return "DESKTOP_OPERATION_UNSUPPORTED";
}

export async function syncFileSearchRoots(settings: FileAccessSettings): Promise<void> {
  if (!fileAccessIsConfigured(settings)) {
    await invoke("file_search_sync_roots", { roots: [] });
    return;
  }

  await invoke("file_search_sync_roots", {
    roots: mapRootsForInvoke(settings),
  });
}

export async function rescanFileSearchRoot(
  settings: FileAccessSettings,
  rootId: string,
): Promise<void> {
  await invoke("file_search_rescan", {
    roots: mapRootsForInvoke(settings),
    rootId,
  });
}

export async function searchRemoteFiles(
  settings: FileAccessSettings,
  commandId: string,
  rootId: string | undefined,
  operation: string,
  pattern: string,
  path: string,
  glob?: string,
  outputMode?: string,
): Promise<string> {
  try {
    const content = await invoke<string>("file_search", {
      roots: mapRootsForInvoke(settings),
      rootId,
      operation,
      pattern,
      path,
      glob,
      outputMode,
    });
    auditFileAccess({
      operation: "file_search",
      commandId,
      rootId: rootId ?? "",
      path,
      bytes: content.length,
      ok: true,
    });
    return content;
  } catch (error) {
    auditFileAccess({
      operation: "file_search",
      commandId,
      rootId: rootId ?? "",
      path,
      bytes: 0,
      ok: false,
      errorCode: mapFileError(error),
    });
    throw error;
  }
}
