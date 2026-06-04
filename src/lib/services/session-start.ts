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

  const fileAccessPayload = buildFileAccessSessionPayload(get(settings).fileAccess);

  return {
    client_version: AGODESK_CLIENT_VERSION,
    client_capabilities: agodeskClientCapabilities(
      get(settings).desktopControlEnabled,
      get(settings).fileAccess,
      get(settings).browserControlEnabled,
    ),
    host,
    ...(fileAccessPayload ? { file_access: fileAccessPayload } : {}),
  };
}
