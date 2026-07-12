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

export interface FilePatchResult {
  rootId: string;
  path: string;
  dryRun: boolean;
  applied: boolean;
  diff: string;
  sha256Before: string;
  sha256After: string;
  replacements: number;
}

export async function patchRemoteFile(
  settings: FileAccessSettings,
  commandId: string,
  rootId: string | undefined,
  path: string,
  patches: Array<{ old_text: string; new_text: string; expected_occurrences?: number }>,
  maxBytes: number,
  expectedSha256?: string,
  dryRun = false,
): Promise<FilePatchResult> {
  try {
    const result = await invoke<{
      root_id: string;
      path: string;
      dry_run: boolean;
      applied: boolean;
      diff: string;
      sha256_before: string;
      sha256_after: string;
      replacements: number;
    }>("file_patch", {
      roots: mapRootsForInvoke(settings),
      args: {
        root_id: rootId,
        path,
        expected_sha256: expectedSha256,
        patches,
        dry_run: dryRun,
        max_bytes: maxBytes,
      },
    });
    auditFileAccess({
      operation: "file_patch",
      commandId,
      rootId: result.root_id,
      path: result.path,
      bytes: 0,
      ok: true,
    });
    return {
      rootId: result.root_id,
      path: result.path,
      dryRun: result.dry_run,
      applied: result.applied,
      diff: result.diff,
      sha256Before: result.sha256_before,
      sha256After: result.sha256_after,
      replacements: result.replacements,
    };
  } catch (error) {
    auditFileAccess({
      operation: "file_patch",
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
