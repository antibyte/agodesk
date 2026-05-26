import {
  getWsOrigin,
  type CertificateProbeResult,
  type TrustedCertificateEntry,
} from "../types/protocol";

export { appendInsecureLoopbackIfNeeded, isLoopbackHost, normalizeServerUrl, prepareServerUrl } from "./server-url";
import { formatInvokeError } from "./errors";

export async function probeServerCertificate(
  serverUrl: string,
): Promise<CertificateProbeResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<CertificateProbeResult>("probe_server_certificate", { serverUrl });
  } catch (error) {
    throw new Error(
      formatInvokeError(error, "Zertifikat konnte nicht gelesen werden."),
    );
  }
}

export async function saveTrustedCertificate(
  origin: string,
  entry: TrustedCertificateEntry,
): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("save_trusted_certificate", { origin, entry });
}

export async function getPinnedFingerprint(serverUrl: string): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  const store = await invoke<{ trusted_certificates: Record<string, TrustedCertificateEntry> }>(
    "get_trusted_certificates",
  );
  return store.trusted_certificates[getWsOrigin(serverUrl)]?.sha256_fingerprint ?? null;
}

export function browserOrigin(url: string): string {
  return getWsOrigin(url);
}
