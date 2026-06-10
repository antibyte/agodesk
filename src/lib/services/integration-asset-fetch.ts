import { resolvePersonaAssetUrl } from "../types/protocol";
import { fetchServerAssetDataUrl, isSignedAgodeskMediaPath } from "./server-asset-fetch";

const IMAGE_URL_PATTERN = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)(\?|#|$)/i;
const EXPECTED_ICON_FAILURES = [
  "looks like HTML",
  "not a recognized media file",
  "not a recognized image file",
  "HTTP 404",
  "HTTP 403",
  "CERTIFICATE_PIN_MISMATCH",
  "connection refused",
  "Verbindung verweigerte",
  "os error 10061",
  "TLS handshake failed",
  "Certificate is not trusted",
];

function looksLikeDirectImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("data:image/")) {
    return true;
  }
  if (trimmed.includes("/api/agodesk/media/")) {
    return isSignedAgodeskMediaPath(trimmed);
  }
  return IMAGE_URL_PATTERN.test(trimmed.split("?")[0] ?? trimmed);
}

function resolveAbsoluteUrl(serverUrl: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }
  return resolvePersonaAssetUrl(serverUrl, trimmed);
}

export function buildIntegrationIconCandidates(
  serverUrl: string,
  icon: string | undefined,
  webhostUrl: string,
): string[] {
  const candidates: string[] = [];
  const add = (value: string) => {
    const resolved = resolveAbsoluteUrl(serverUrl, value);
    if (resolved && !candidates.includes(resolved)) {
      candidates.push(resolved);
    }
  };

  const resolvedIcon = icon ? resolveAbsoluteUrl(serverUrl, icon) : "";
  if (resolvedIcon && looksLikeDirectImageUrl(resolvedIcon)) {
    add(resolvedIcon);
  }

  const resolvedWebhost = resolveAbsoluteUrl(serverUrl, webhostUrl);
  if (resolvedWebhost) {
    try {
      const base = new URL(resolvedWebhost);
      add(new URL("/favicon.ico", base).href);
      add(new URL("/apple-touch-icon.png", base).href);
      add(new URL("/apple-touch-icon-precomposed.png", base).href);
    } catch {
      // ignore invalid webhost URLs
    }
  }

  return candidates;
}

function isExpectedIconFetchFailure(message: string): boolean {
  return EXPECTED_ICON_FAILURES.some((marker) => message.includes(marker));
}

async function fetchFirstIconDataUrl(
  serverUrl: string,
  candidates: string[],
): Promise<string> {
  for (const candidate of candidates) {
    if (candidate.startsWith("data:") || candidate.startsWith("blob:")) {
      return candidate;
    }
    try {
      const result = await fetchServerAssetDataUrl(serverUrl, candidate);
      if (result.dataUrl.startsWith("data:image/")) {
        return result.dataUrl;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (import.meta.env.DEV && !isExpectedIconFetchFailure(message)) {
        console.warn("[agodesk:integration-asset]", message);
      }
    }
  }
  return "";
}

export async function fetchIntegrationDisplayUrl(
  serverUrl: string,
  icon: string | undefined,
  webhostUrl: string,
): Promise<string> {
  const candidates = buildIntegrationIconCandidates(serverUrl, icon, webhostUrl);
  if (candidates.length === 0) {
    return "";
  }
  return fetchFirstIconDataUrl(serverUrl, candidates);
}
