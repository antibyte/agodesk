import type { FileAccessRoot, FileAccessSettings } from "../types/protocol";

export interface FileAccessRootInvoke {
  rootId: string;
  canonicalPath: string;
  permissions: Array<"read" | "write">;
}

export function toInvokeRoots(roots: FileAccessRoot[]): FileAccessRootInvoke[] {
  return roots
    .filter((root) => root.readEnabled || root.writeEnabled)
    .map((root) => ({
      rootId: root.rootId,
      canonicalPath: root.canonicalPath,
      permissions: [
        ...(root.readEnabled ? (["read"] as const) : []),
        ...(root.writeEnabled ? (["write"] as const) : []),
      ],
    }));
}

export function auditFileAccess(entry: {
  operation: string;
  commandId: string;
  rootId: string;
  path: string;
  bytes: number;
  ok: boolean;
  errorCode?: string;
}): void {
  console.info("[agodesk:file-access]", {
    operation: entry.operation,
    command_id: entry.commandId,
    root_id: entry.rootId,
    path: entry.path,
    bytes: entry.bytes,
    ok: entry.ok,
    error_code: entry.errorCode ?? null,
  });
}

export function fileAccessIsConfigured(settings: FileAccessSettings): boolean {
  return settings.enabled && settings.roots.some((root) => root.readEnabled || root.writeEnabled);
}

export function createFileAccessRootId(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = crypto.randomUUID().slice(0, 8);
  return slug ? `${slug}-${suffix}` : `root-${suffix}`;
}

export function cloneFileAccessSettings(
  source: FileAccessSettings,
): FileAccessSettings {
  return {
    enabled: source.enabled,
    maxReadBytes: source.maxReadBytes,
    maxWriteBytes: source.maxWriteBytes,
    roots: source.roots.map((root) => ({ ...root })),
  };
}

export function buildPathDisplay(canonicalPath: string): string {
  const normalized = canonicalPath.replace(/\\/g, "/");
  if (normalized.length <= 48) {
    return normalized;
  }
  const parts = normalized.split("/");
  return `…/${parts.slice(-2).join("/")}`;
}
