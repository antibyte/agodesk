import { resolveAuraGoChatMediaUrl } from "./server-asset-fetch";

/** True when the value can be used as `<img src>` in chat media blocks. */
export function isInlineImageSrc(src: string | null | undefined): src is string {
  if (!src?.trim()) {
    return false;
  }
  const value = src.trim();
  if (value.startsWith("blob:")) {
    return true;
  }
  if (value.startsWith("data:")) {
    const semi = value.indexOf(";");
    const mime = semi === -1 ? "" : value.slice(5, semi).toLowerCase();
    return mime.startsWith("image/") || mime === "application/octet-stream";
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return (
      value.includes("/api/agodesk/media/") ||
      /\.(png|jpe?g|gif|webp|svg|ico)(\?|$)/i.test(value)
    );
  }
  return false;
}

export function resolveInlineImageFallback(
  serverUrl: string,
  path?: string,
  agentPath?: string,
): string | null {
  const candidate = path?.trim() || agentPath?.trim();
  if (!candidate || !serverUrl.trim()) {
    return null;
  }
  const url = resolveAuraGoChatMediaUrl(serverUrl, candidate);
  return isInlineImageSrc(url) ? url : null;
}
