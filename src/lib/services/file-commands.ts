import { invoke } from "@tauri-apps/api/core";
import type { FileAccessSettings } from "../types/protocol";
import { auditFileAccess, toInvokeRoots } from "./file-access";

export interface FileListEntry {
  name: string;
  path: string;
  kind: string;
  size: number;
  modified?: string;
}

export interface FileListResult {
  rootId: string;
  path: string;
  entries: FileListEntry[];
}

export interface FileReadResult {
  rootId: string;
  path: string;
  encoding: string;
  content: string;
  size: number;
  truncated: boolean;
}

export interface FileWriteResult {
  rootId: string;
  path: string;
  bytesWritten: number;
}

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

export async function pickFolderPath(): Promise<string | null> {
  const picked = await invoke<string | null>("pick_folder_path");
  return picked?.trim() ? picked.trim() : null;
}

export async function canonicalizeFolderPath(path: string): Promise<string> {
  return invoke<string>("canonicalize_folder_path", { path });
}

export async function listRemoteFiles(
  settings: FileAccessSettings,
  commandId: string,
  rootId: string | undefined,
  path: string,
  recursive: boolean,
): Promise<FileListResult> {
  try {
    const result = await invoke<{
      root_id: string;
      path: string;
      entries: FileListEntry[];
    }>("file_list", {
      roots: mapRootsForInvoke(settings),
      rootId,
      path,
      recursive,
    });
    auditFileAccess({
      operation: "file_list",
      commandId,
      rootId: result.root_id,
      path: result.path,
      bytes: result.entries.length,
      ok: true,
    });
    return {
      rootId: result.root_id,
      path: result.path,
      entries: result.entries,
    };
  } catch (error) {
    auditFileAccess({
      operation: "file_list",
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

export async function readRemoteFile(
  settings: FileAccessSettings,
  commandId: string,
  rootId: string | undefined,
  path: string,
  maxBytes: number,
  encoding?: "utf-8" | "base64" | "auto",
): Promise<FileReadResult> {
  try {
    const result = await invoke<{
      root_id: string;
      path: string;
      encoding: string;
      content: string;
      size: number;
      truncated: boolean;
    }>("file_read", {
      roots: mapRootsForInvoke(settings),
      rootId,
      path,
      maxBytes,
      encoding,
    });
    auditFileAccess({
      operation: "file_read",
      commandId,
      rootId: result.root_id,
      path: result.path,
      bytes: result.size,
      ok: true,
    });
    return {
      rootId: result.root_id,
      path: result.path,
      encoding: result.encoding,
      content: result.content,
      size: result.size,
      truncated: result.truncated,
    };
  } catch (error) {
    auditFileAccess({
      operation: "file_read",
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

export async function writeRemoteFile(
  settings: FileAccessSettings,
  commandId: string,
  rootId: string | undefined,
  path: string,
  content: string,
  maxBytes: number,
  expectedHash?: string,
  createOnly = false,
): Promise<FileWriteResult> {
  try {
    const result = await invoke<{
      root_id: string;
      path: string;
      bytes_written: number;
    }>("file_write", {
      roots: mapRootsForInvoke(settings),
      rootId,
      path,
      content,
      maxBytes,
      expectedHash,
      createOnly,
    });
    auditFileAccess({
      operation: "file_write",
      commandId,
      rootId: result.root_id,
      path: result.path,
      bytes: result.bytes_written,
      ok: true,
    });
    return {
      rootId: result.root_id,
      path: result.path,
      bytesWritten: result.bytes_written,
    };
  } catch (error) {
    auditFileAccess({
      operation: "file_write",
      commandId,
      rootId: rootId ?? "",
      path,
      bytes: content.length,
      ok: false,
      errorCode: mapFileError(error),
    });
    throw error;
  }
}
