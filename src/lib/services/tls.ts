import {
  getWsOrigin,
  type CertificateProbeResult,
  type TrustedCertificateEntry,
} from "../types/protocol";

export {
  appendInsecureLoopbackIfNeeded,
  isLoopbackHost,
  normalizeServerUrl,
  prepareServerUrl,
} from "./server-url";
import { formatInvokeError } from "./errors";

export async function probeServerCertificate(serverUrl: string): Promise<CertificateProbeResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<CertificateProbeResult>("probe_server_certificate", { serverUrl });
  } catch (error) {
    throw new Error(formatInvokeError(error, "Zertifikat konnte nicht gelesen werden."));
  }
}

export async function saveTrustedCertificate(
  origin: string,
  entry: TrustedCertificateEntry,
): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("save_trusted_certificate", { origin, entry });
}

export async function saveTrustedCertificateForServer(
  serverUrl: string,
  entry: TrustedCertificateEntry,
): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("save_trusted_certificate_for_server", { serverUrl, entry });
}

export async function getPinnedFingerprint(serverUrl: string): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<string | null>("get_pinned_fingerprint", { serverUrl });
  } catch {
    return null;
  }
}

export async function getPinnedFingerprintForHttpUrl(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<string | null>("get_pinned_fingerprint_for_http_url", {
      assetUrl: trimmed,
    });
  } catch {
    return null;
  }
}

export function browserOrigin(url: string): string {
  return getWsOrigin(url);
}
