import { resolvePersonaAssetUrl } from "../types/protocol";
import { formatInvokeError } from "./errors";
import { fetchServerAssetDataUrl } from "./server-asset-fetch";
import { writePersonaDebug } from "./persona-debug";

const PERSONA_ASSET_KEY = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export type PersonaAssetKind = "avatar" | "icon";

export interface PersonaAssetCandidateInput {
  providedUrl: string;
  iconKey: string;
  persona: string;
  kind: PersonaAssetKind;
  assetVersion?: string;
}

function isSafePersonaAssetKey(value: string): boolean {
  return PERSONA_ASSET_KEY.test(value);
}

function personaAssetFolder(kind: PersonaAssetKind): string {
  return kind === "icon" ? "/img/persona-icons" : "/img/personas";
}

function stripAssetVersionQuery(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("v")) {
      return url;
    }
    parsed.searchParams.delete("v");
    return parsed.toString();
  } catch {
    return url.replace(/([?&])v=[^&]*&?/, "$1").replace(/[?&]$/, "");
  }
}

/** Same-origin persona paths: icon_key first, then the provided URL without a stale `v` query. */
export function buildPersonaAssetUrlCandidates(
  serverUrl: string,
  input: PersonaAssetCandidateInput,
): string[] {
  const folder = personaAssetFolder(input.kind);
  const keys: string[] = [];
  const addKey = (value: string) => {
    const trimmed = value.trim();
    if (!isSafePersonaAssetKey(trimmed) || keys.includes(trimmed)) {
      return;
    }
    keys.push(trimmed);
  };

  addKey(input.iconKey);
  addKey(input.persona);
  addKey("custom");

  const ordered: string[] = [];
  const seen = new Set<string>();
  const addUrl = (value: string) => {
    const resolved = resolvePersonaAssetUrl(serverUrl, value);
    if (!resolved || seen.has(resolved)) {
      return;
    }
    seen.add(resolved);
    ordered.push(resolved);
  };

  const addUrlPreferUnversioned = (value: string) => {
    const resolved = resolvePersonaAssetUrl(serverUrl, value);
    if (!resolved) {
      return;
    }
    addUrl(stripAssetVersionQuery(resolved));
    addUrl(resolved);
  };

  // icon_key is the protocol asset key (`custom` for unknown personas).
  if (isSafePersonaAssetKey(input.iconKey.trim())) {
    addUrl(`${folder}/${input.iconKey.trim()}.png`);
  }
  addUrlPreferUnversioned(input.providedUrl);
  for (const key of keys) {
    addUrl(`${folder}/${key}.png`);
  }

  return ordered;
}

export async function fetchFirstPersonaAssetDisplayUrl(
  serverUrl: string,
  candidates: string[],
): Promise<{ dataUrl: string; assetUrl: string }> {
  for (const assetUrl of candidates) {
    const dataUrl = await fetchPersonaAssetDisplayUrl(serverUrl, assetUrl);
    if (dataUrl) {
      return { dataUrl, assetUrl };
    }
  }
  return { dataUrl: "", assetUrl: candidates[0] ?? "" };
}

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
    const message = formatInvokeError(error, "Persona-Asset konnte nicht geladen werden.");
    console.warn("[agodesk:persona-asset]", message, fetchUrl);
    void writePersonaDebug({
      stage: "fetch-failed",
      serverUrl,
      fetchUrl,
      message,
    });
    return "";
  }
}
