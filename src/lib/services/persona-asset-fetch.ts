import { formatInvokeError } from "./errors";

interface FetchedAsset {
  dataUrl: string;
  mime: string;
}

export async function fetchPersonaAssetDisplayUrl(
  serverUrl: string,
  assetUrl: string,
): Promise<string> {
  if (!assetUrl.trim()) {
    return "";
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<FetchedAsset>("fetch_server_asset", {
      serverUrl,
      assetUrl,
    });
    return result.dataUrl;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(
        formatInvokeError(error, "Persona-Asset konnte nicht geladen werden."),
        assetUrl,
      );
    }
    return assetUrl;
  }
}
