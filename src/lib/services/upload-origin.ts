import { getTranslateFn } from "../i18n/store";
import { getHttpOrigin } from "../types/protocol";

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

function normalizeAllowedOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    return httpOriginFromAbsoluteUrl(withScheme);
  } catch {
    return "";
  }
}

/** Same policy as Rust `ensure_asset_origin_allowed` for uploads/fetches. */
export function isUploadOriginAllowed(
  serverUrl: string,
  uploadUrl: string,
  allowedOrigins: readonly string[] = [],
): boolean {
  const uploadOrigin = httpOriginFromAbsoluteUrl(uploadUrl);
  const serverOrigin = getHttpOrigin(serverUrl);
  if (!uploadOrigin || !serverOrigin) {
    return false;
  }
  if (uploadOrigin === serverOrigin) {
    return true;
  }
  for (const entry of allowedOrigins) {
    const allowed = normalizeAllowedOrigin(entry);
    if (allowed && uploadOrigin === allowed) {
      return true;
    }
  }
  return false;
}

export function assertUploadOriginAllowed(
  serverUrl: string,
  uploadUrl: string,
  allowedOrigins: readonly string[] = [],
): void {
  if (!isUploadOriginAllowed(serverUrl, uploadUrl, allowedOrigins)) {
    throw new Error(getTranslateFn()("upload.error.originDenied"));
  }
}
