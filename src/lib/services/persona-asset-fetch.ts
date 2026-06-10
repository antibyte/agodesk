import { formatInvokeError } from "./errors";
import { getPinnedFingerprint } from "./tls";

interface FetchedAsset {
  dataUrl: string;
  mime: string;
}

export async function fetchPersonaAssetDisplayUrl(
  serverUrl: string,
  assetUrl: string,
): Promise<string> {
  const trimmed = assetUrl.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return trimmed;
  }

  let fetchUrl = trimmed;
  if (fetchUrl.startsWith("ws://")) {
    fetchUrl = `http://${fetchUrl.slice("ws://".length)}`;
  } else if (fetchUrl.startsWith("wss://")) {
    fetchUrl = `https://${fetchUrl.slice("wss://".length)}`;
  }

  try {
    const pinnedFingerprint = await getPinnedFingerprint(serverUrl).catch(() => null);
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<FetchedAsset>("fetch_server_asset", {
      serverUrl,
      assetUrl: fetchUrl,
      ...(pinnedFingerprint ? { pinnedFingerprint } : {}),
    });
    return result.dataUrl;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(
        formatInvokeError(error, "Persona-Asset konnte nicht geladen werden."),
        fetchUrl,
      );
    }
    return "";
  }
}
