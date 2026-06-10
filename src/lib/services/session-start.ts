import { get } from "svelte/store";
import { collectHostInfo } from "./desktop";
import { settings } from "../stores/settings";
import type { SessionStartCommon, SessionStartHost } from "../types/protocol";
import {
  AGODESK_CLIENT_VERSION,
  agodeskClientCapabilities,
  buildFileAccessSessionPayload,
} from "../types/protocol";

const fallbackHost: SessionStartHost = {
  hostname: "unknown",
  os: "unknown",
  arch: "unknown",
};

export async function buildSessionStartCommon(): Promise<SessionStartCommon> {
  let host = fallbackHost;
  try {
    const info = await collectHostInfo();
    host = {
      hostname: info.hostname.trim() || fallbackHost.hostname,
      os: info.platform.trim() || fallbackHost.os,
      arch: info.arch.trim() || fallbackHost.arch,
    };
  } catch {
    // Host-Metadaten sind optional — AuraGo akzeptiert session.start trotzdem.
  }

  const fileAccess = get(settings).fileAccess;
  const fileAccessPayload = buildFileAccessSessionPayload(fileAccess);
  const clientCapabilities = agodeskClientCapabilities(
    get(settings).desktopControlEnabled,
    fileAccess,
    get(settings).browserControlEnabled,
  );

  const common: SessionStartCommon = {
    client_version: AGODESK_CLIENT_VERSION,
    client_capabilities: clientCapabilities,
    host,
    ...(fileAccessPayload ? { file_access: fileAccessPayload } : {}),
  };

  console.info("[agodesk:session.start]", {
    file_access_enabled: Boolean(fileAccessPayload),
    file_roots: fileAccessPayload?.roots.map((root) => root.root_id) ?? [],
    client_file_capabilities: clientCapabilities.filter((cap) => cap.startsWith("remote.files.")),
  });

  return common;
}
