import { getHttpOrigin, resolvePersonaAssetUrl } from "../types/protocol";
import type { WebhostIntegration } from "../types/protocol";

function httpOriginFromAbsoluteUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  return httpOriginFromAbsoluteUrl(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
}

function defaultPort(protocol: string): string {
  return protocol === "https:" ? "443" : "80";
}

export function isHomelabHost(host: string): boolean {
  const lower = host
    .trim()
    .replace(/^\[']|['\]]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower.endsWith(".local") ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".ts.net") ||
    lower.endsWith(".tailscale.net")
  ) {
    return true;
  }
  const ipv4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) {
    return false;
  }
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

export function originsFromIntegrationWebhosts(
  serverUrl: string,
  webhosts: readonly WebhostIntegration[],
): string[] {
  const origins = new Set<string>();
  for (const webhost of webhosts) {
    for (const value of [webhost.url, webhost.icon]) {
      if (!value?.trim()) {
        continue;
      }
      const origin = httpOriginFromAbsoluteUrl(resolvePersonaAssetUrl(serverUrl, value));
      if (origin) {
        origins.add(origin);
      }
    }
  }
  return [...origins];
}

export function mergeTrustedAssetOrigins(
  serverUrl: string,
  settingsOrigins: readonly string[],
  webhosts: readonly WebhostIntegration[],
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const add = (value: string) => {
    const origin = normalizeOrigin(value);
    if (!origin || seen.has(origin)) {
      return;
    }
    seen.add(origin);
    ordered.push(origin);
  };

  for (const entry of settingsOrigins) {
    add(entry);
  }
  for (const entry of originsFromIntegrationWebhosts(serverUrl, webhosts)) {
    add(entry);
  }
  return ordered;
}

/** Same machine / same API port: LAN IP vs Tailscale hostname of AuraGo. */
export function isTrustedApiAliasOrigin(serverUrl: string, origin: string): boolean {
  try {
    const server = new URL(getHttpOrigin(serverUrl));
    const candidate = new URL(origin.includes("://") ? origin : `https://${origin}`);
    if (candidate.protocol !== "http:" && candidate.protocol !== "https:") {
      return false;
    }
    const serverHost = server.hostname;
    const candidateHost = candidate.hostname;
    if (!isHomelabHost(serverHost) || !isHomelabHost(candidateHost)) {
      return false;
    }
    const serverPort = server.port || defaultPort(server.protocol);
    const candidatePort = candidate.port || defaultPort(candidate.protocol);
    return server.protocol === candidate.protocol && serverPort === candidatePort;
  } catch {
    return false;
  }
}

export function expandSignedMediaAcrossTrustedOrigins(
  serverUrl: string,
  assetUrl: string,
  trustedOrigins: readonly string[],
): string[] {
  let parsed: URL;
  try {
    parsed = new URL(assetUrl);
  } catch {
    return [assetUrl];
  }
  if (!parsed.pathname.includes("/api/agodesk/")) {
    return [assetUrl];
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    ordered.push(value);
  };

  add(assetUrl);
  add(`${getHttpOrigin(serverUrl)}${parsed.pathname}${parsed.search}`);
  for (const origin of trustedOrigins) {
    if (!isTrustedApiAliasOrigin(serverUrl, origin)) {
      continue;
    }
    add(`${origin}${parsed.pathname}${parsed.search}`);
  }
  return ordered;
}

export function shouldReuseServerCertificatePin(serverUrl: string, assetUrl: string): boolean {
  try {
    const server = new URL(getHttpOrigin(serverUrl));
    const asset = new URL(assetUrl);
    if (asset.protocol !== "https:") {
      return false;
    }
    if (server.hostname === asset.hostname) {
      return isHomelabHost(server.hostname);
    }
    return isTrustedApiAliasOrigin(serverUrl, `${asset.protocol}//${asset.host}`);
  } catch {
    return false;
  }
}
