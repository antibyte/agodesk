import { appendInsecureLoopbackIfNeeded, isLoopbackHost } from "../types/protocol";

export { appendInsecureLoopbackIfNeeded, isLoopbackHost };

export function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname.replace(/\/+$/, "") || "";

    if (path === "" || path === "/") {
      parsed.pathname = "/api/agodesk/ws";
    } else if (path === "/api/agodesk") {
      parsed.pathname = "/api/agodesk/ws";
    }

    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function prepareServerUrl(raw: string): string {
  return appendInsecureLoopbackIfNeeded(normalizeServerUrl(raw));
}
