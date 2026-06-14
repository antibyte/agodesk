import { formatInvokeError } from "./errors";
import { fetchServerAssetDataUrl } from "./server-asset-fetch";

function normalizePersonaFetchUrl(assetUrl: string): string {
  const trimmed = assetUrl.trim();
  if (trimmed.startsWith("ws://")) {
    return `http://${trimmed.slice("ws://".length)}`;
  }
  if (trimmed.startsWith("wss://")) {
    return `https://${trimmed.slice("wss://".length)}`;
  }
  return trimmed;
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

  const fetchUrl = normalizePersonaFetchUrl(trimmed);

  try {
    const result = await fetchServerAssetDataUrl(serverUrl, fetchUrl);
    return result.dataUrl;
  } catch (error) {
    console.warn(
      "[agodesk:persona-asset]",
      formatInvokeError(error, "Persona-Asset konnte nicht geladen werden."),
      fetchUrl,
    );
    return "";
  }
}
