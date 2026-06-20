import { get } from "svelte/store";
import { collectHostInfo } from "./desktop";
import { settings } from "../stores/settings";
import type { SessionStartCommon, SessionStartHost } from "../types/protocol";
import {
  AGODESK_CLIENT_VERSION,
  agodeskClientCapabilities,
  buildFileAccessSessionPayload,
  buildShellAccessSessionPayload,
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
  const shellAccess = get(settings).shellAccess;
  const fileAccessPayload = buildFileAccessSessionPayload(fileAccess);
  const shellAccessPayload = buildShellAccessSessionPayload(shellAccess);
  const clientCapabilities = agodeskClientCapabilities(
    get(settings).desktopControlEnabled,
    fileAccess,
    get(settings).browserControlEnabled,
    shellAccess,
  );

  const common: SessionStartCommon = {
    client_version: AGODESK_CLIENT_VERSION,
    client_capabilities: clientCapabilities,
    host,
    ...(fileAccessPayload ? { file_access: fileAccessPayload } : {}),
    ...(shellAccessPayload ? { shell_access: shellAccessPayload } : {}),
  };

  console.info("[agodesk:session.start]", {
    file_access_enabled: Boolean(fileAccessPayload),
    file_roots: fileAccessPayload?.roots.map((root) => root.root_id) ?? [],
    shell_access_enabled: Boolean(shellAccessPayload),
    shell_cwds: shellAccessPayload?.allowed_cwds.map((cwd) => cwd.cwd_id) ?? [],
    client_file_capabilities: clientCapabilities.filter((cap) => cap.startsWith("remote.files.")),
    client_shell_capabilities: clientCapabilities.filter((cap) => cap.startsWith("remote.shell.")),
    client_chat_attachment_capabilities: clientCapabilities.filter(
      (cap) => cap === "chat.media_upload" || cap === "chat.attachments",
    ),
  });

  return common;
}
