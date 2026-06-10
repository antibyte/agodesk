import { get } from "svelte/store";

import { getHttpOrigin } from "../types/protocol";

import { resolvePersonaAssetUrl } from "../types/protocol";

import { formatInvokeError } from "./errors";

import { sessionState } from "../stores/session";

import { getPinnedFingerprint, getPinnedFingerprintForHttpUrl } from "./tls";

export interface FetchedServerAsset {
  dataUrl: string;
  mime: string;
}

export interface ChatMediaAssetRefs {
  path?: string;
  url?: string;
  preview_url?: string;
  filename?: string;
}

function audioBasename(path: string): string {
  const withoutQuery = path.split("?")[0] ?? path;
  return withoutQuery.split("/").pop() ?? withoutQuery;
}

function pathWithoutQuery(path: string): string {
  return path.split("?")[0] ?? path;
}

/** AuraGo signs `/api/agodesk/media/...` URLs with short-lived query tokens. */
export function isSignedAgodeskMediaPath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed.includes("/api/agodesk/media/")) {
    return false;
  }
  const query = trimmed.includes("?") ? trimmed.slice(trimmed.indexOf("?") + 1) : "";
  if (!query) {
    return false;
  }
  const params = new URLSearchParams(query);
  return params.has("agodesk_exp") && params.has("agodesk_sig");
}

export function collectChatMediaAssetRefs(refs: ChatMediaAssetRefs): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  const add = (value?: string) => {
    const trimmed = value?.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      values.push(trimmed);
    }
  };

  // Server-provided signed paths first; `url` is often an unsigned `/files/...` Web-UI path.
  add(refs.path);
  add(refs.preview_url);
  add(refs.url);
  add(refs.filename);

  return values;
}

export function buildMediaUrlCandidates(serverUrl: string, path: string): string[] {
  const trimmed = path.trim();
  if (!trimmed) {
    return [];
  }

  const candidates = new Set<string>();
  const add = (value: string) => {
    const resolved = resolvePersonaAssetUrl(serverUrl, value);
    if (resolved) {
      candidates.add(resolved);
    }
  };

  add(trimmed);

  const basename = audioBasename(trimmed);
  const isAudioFile = /\.(mp3|wav|ogg|opus|m4a|aac|webm)$/i.test(basename);
  const isBareFilename = !pathWithoutQuery(trimmed).includes("/");

  if (isAudioFile && isBareFilename) {
    add(`/api/agodesk/tts/${basename}`);
  }

  return [...candidates];
}

export function buildChatMediaUrlCandidates(serverUrl: string, path: string): string[] {
  const trimmed = path.trim();
  if (!trimmed) {
    return [];
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const resolved = resolvePersonaAssetUrl(serverUrl, value);
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      ordered.push(resolved);
    }
  };

  const pathOnly = pathWithoutQuery(trimmed);

  if (isSignedAgodeskMediaPath(trimmed)) {
    add(trimmed);
    return ordered;
  }

  if (pathOnly.includes("/api/agodesk/media/")) {
    add(trimmed);
    return ordered;
  }

  // Unsigned `/files/...` and bare filenames require a fresh signed `chat.media` payload.
  if (pathOnly.startsWith("/files/") || !pathOnly.includes("/")) {
    return ordered;
  }

  add(trimmed);
  return ordered;
}

export function buildChatMediaUrlCandidatesFromRefs(
  serverUrl: string,
  refs: ChatMediaAssetRefs,
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const ref of collectChatMediaAssetRefs(refs)) {
    for (const candidate of buildChatMediaUrlCandidates(serverUrl, ref)) {
      if (!seen.has(candidate)) {
        seen.add(candidate);
        ordered.push(candidate);
      }
    }
  }
  return ordered;
}

export function resolveAuraGoChatMediaUrl(serverUrl: string, path: string): string {
  const candidates = buildChatMediaUrlCandidates(serverUrl, path);
  return candidates[0] ?? resolvePersonaAssetUrl(serverUrl, path);
}

function httpOriginForAssetUrl(assetUrl: string): string {
  try {
    const parsed = new URL(assetUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function readAssetFetchAuth(): { deviceId?: string; sessionId?: string } {
  const { deviceId, sessionId } = get(sessionState);
  return {
    ...(deviceId ? { deviceId } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}

export async function fetchServerAssetDataUrl(
  serverUrl: string,
  assetUrl: string,
): Promise<FetchedServerAsset> {
  const assetOriginPin = await getPinnedFingerprintForHttpUrl(assetUrl).catch(() => null);
  let pinnedFingerprint = assetOriginPin;
  if (!pinnedFingerprint) {
    const assetOrigin = httpOriginForAssetUrl(assetUrl);
    const serverOrigin = getHttpOrigin(serverUrl);
    if (assetOrigin && assetOrigin === serverOrigin) {
      pinnedFingerprint = await getPinnedFingerprint(serverUrl).catch(() => null);
    }
  }
  const auth = readAssetFetchAuth();
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<FetchedServerAsset>("fetch_server_asset", {
    serverUrl,
    assetUrl,
    ...auth,
    ...(pinnedFingerprint ? { pinnedFingerprint } : {}),
  });
}

const RETRYABLE_ASSET_ERROR_MARKERS = [
  "HTTP 404",
  "HTTP 403",
  "HTTP 401",
  "HTTP 307",
  "HTTP 301",
  "HTTP 302",
  "HTTP 308",
  "looks like HTML",
  "not a recognized audio file",
  "not a recognized media file",
  "not a recognized image file",
];

function isRetryableAssetFetchError(message: string): boolean {
  return RETRYABLE_ASSET_ERROR_MARKERS.some((marker) => message.includes(marker));
}

async function fetchFirstServerAssetFromCandidates(
  serverUrl: string,
  path: string,
  candidates: string[],
): Promise<{ dataUrl: string; mime: string; assetUrl: string } | null> {
  let lastError: unknown = null;

  if (candidates.length === 0) {
    console.warn("[agodesk:server-asset] Keine fetchbaren Media-URLs", {
      refs: path,
      hint: "Erwarte signiertes path/preview_url (/api/agodesk/media/...?agodesk_exp=&agodesk_sig=)",
    });
    return null;
  }

  for (const assetUrl of candidates) {
    try {
      const result = await fetchServerAssetDataUrl(serverUrl, assetUrl);
      return { ...result, assetUrl };
    } catch (error) {
      lastError = error;
      const message = formatInvokeError(error, "Asset fetch failed");
      if (!isRetryableAssetFetchError(message)) {
        break;
      }
    }
  }

  if (import.meta.env.DEV && lastError) {
    console.warn(
      "[agodesk:server-asset]",
      formatInvokeError(lastError, "Asset fetch failed"),
      {
        path: audioBasename(path),
        attempts: candidates.length,
        candidates: candidates.map((url) => {
          try {
            const parsed = new URL(url);
            return `${parsed.pathname}${parsed.search ? parsed.search.slice(0, 40) : ""}`;
          } catch {
            return audioBasename(url);
          }
        }),
      },
    );
  } else if (lastError) {
    console.warn(
      "[agodesk:server-asset]",
      formatInvokeError(lastError, "Asset fetch failed"),
      { attempts: candidates.length },
    );
  }

  return null;
}

export async function fetchFirstServerAssetDataUrl(
  serverUrl: string,
  path: string,
): Promise<{ dataUrl: string; mime: string; assetUrl: string } | null> {
  return fetchFirstServerAssetFromCandidates(
    serverUrl,
    path,
    buildMediaUrlCandidates(serverUrl, path),
  );
}

export async function fetchFirstChatMediaAssetDataUrl(
  serverUrl: string,
  path: string,
): Promise<{ dataUrl: string; mime: string; assetUrl: string } | null> {
  return fetchFirstServerAssetFromCandidates(
    serverUrl,
    path,
    buildChatMediaUrlCandidates(serverUrl, path),
  );
}

export async function fetchFirstChatMediaItemAssetDataUrl(
  serverUrl: string,
  refs: ChatMediaAssetRefs,
): Promise<{ dataUrl: string; mime: string; assetUrl: string } | null> {
  const label = refs.path ?? refs.preview_url ?? refs.url ?? refs.filename ?? "";
  return fetchFirstServerAssetFromCandidates(
    serverUrl,
    label,
    buildChatMediaUrlCandidatesFromRefs(serverUrl, refs),
  );
}

export function resolveAuraGoMediaUrl(serverUrl: string, path: string): string {
  const candidates = buildMediaUrlCandidates(serverUrl, path);
  return candidates[0] ?? resolvePersonaAssetUrl(serverUrl, path);
}

export function getHttpOriginForServer(serverUrl: string): string {
  return getHttpOrigin(serverUrl);
}
