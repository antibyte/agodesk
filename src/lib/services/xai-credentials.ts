import { invoke } from "@tauri-apps/api/core";
import type { GrokVoiceOption } from "../types/grok-voice";
import { isDesktopShell } from "./window-controls";

/** After a 429, block further network key tests for this long. */
const RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;

let rateLimitedUntil = 0;

export async function loadXaiApiKey(): Promise<string | null> {
  try {
    return await invoke<string | null>("get_xai_api_key");
  } catch {
    return null;
  }
}

export async function saveXaiApiKey(apiKey: string): Promise<void> {
  await invoke("store_xai_api_key", { apiKey: apiKey.trim() });
}

export async function clearXaiApiKey(): Promise<void> {
  try {
    await invoke("delete_xai_api_key");
  } catch {
    // ignore
  }
}

export async function hasXaiApiKey(): Promise<boolean> {
  try {
    return await invoke<boolean>("has_xai_api_key");
  } catch {
    return false;
  }
}

/** Fetch full voice catalog from xAI (built-in + custom when available). */
export async function listXaiTtsVoices(): Promise<GrokVoiceOption[]> {
  if (!isDesktopShell()) {
    return [];
  }
  const raw = await invoke<
    Array<{
      voiceId?: string;
      voice_id?: string;
      name?: string;
      language?: string | null;
      custom?: boolean;
    }>
  >("list_xai_tts_voices");
  return (raw ?? [])
    .map((entry) => {
      const voiceId = (entry.voiceId ?? entry.voice_id ?? "").trim().toLowerCase();
      return {
        voiceId,
        name: (entry.name ?? voiceId).trim() || voiceId,
        language: entry.language ?? null,
        custom: entry.custom === true,
      } satisfies GrokVoiceOption;
    })
    .filter((entry) => entry.voiceId.length > 0);
}

/** Mint a short-lived client secret (uses network — avoid while rate-limited). */
export async function createXaiRealtimeClientSecret(expiresSeconds = 300): Promise<string> {
  assertNotRateLimited();
  try {
    return await invoke<string>("create_xai_realtime_client_secret", {
      expiresSeconds,
    });
  } catch (error) {
    noteRateLimitFromError(error);
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function formatInvokeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; error?: unknown };
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error.trim();
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") {
        return json.slice(0, 400);
      }
    } catch {
      // ignore
    }
  }
  return String(error ?? "unknown error");
}

function isRateLimitMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("429") || lower.includes("rate-limit") || lower.includes("too many");
}

function isTransientIpcError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("err_connection_refused") ||
    lower.includes("connection refused") ||
    lower.includes("network error") ||
    lower.includes("ipc custom protocol failed") ||
    lower.includes("load failed")
  );
}

function noteRateLimitFromError(error: unknown): void {
  if (isRateLimitMessage(formatInvokeError(error))) {
    rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  }
}

function assertNotRateLimited(): void {
  const remaining = rateLimitedUntil - Date.now();
  if (remaining > 0) {
    const mins = Math.max(1, Math.ceil(remaining / 60_000));
    throw new Error(
      `xAI Rate-Limit-Cooldown: noch ca. ${mins} Min. warten. ` +
        `Weitere Test-Klicks verschärfen 429. Console: https://console.x.ai/team/default/rate-limits`,
    );
  }
}

export interface XaiKeyTestResult {
  ok: true;
  message: string;
  network: boolean;
}

/**
 * Validates the stored xAI API key.
 *
 * - Default: local only (stored + non-empty) — **no xAI HTTP call**.
 * - `network: true`: GET /v1/tts/voices (can return 429 if team is limited).
 *
 * Official realtime usage (for live speech) is separate:
 * `wss://api.x.ai/v1/realtime?model=grok-voice-latest` + `Authorization: Bearer <key>`.
 */
export async function testXaiApiKey(options?: { network?: boolean }): Promise<XaiKeyTestResult> {
  if (!isDesktopShell()) {
    throw new Error(
      "xAI-Key-Test läuft nur in der Desktop-App (tauri dev / gebautes Binary), nicht im reinen Browser.",
    );
  }

  const network = options?.network === true;
  if (network) {
    assertNotRateLimited();
  }

  let lastMessage = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const message = await invoke<string>("test_xai_api_key", { network });
      return {
        ok: true,
        message:
          typeof message === "string" && message.trim()
            ? message.trim()
            : network
              ? "xAI API-Key-Netzwerktest erfolgreich."
              : "xAI API-Key ist lokal gespeichert.",
        network,
      };
    } catch (error) {
      lastMessage = formatInvokeError(error);
      noteRateLimitFromError(error);

      // Never fall back to client_secrets on 429 — that costs more quota.
      if (isRateLimitMessage(lastMessage)) {
        throw new Error(lastMessage);
      }

      if (isTransientIpcError(lastMessage) && attempt < 2) {
        await sleep(120 + attempt * 180);
        continue;
      }

      throw new Error(lastMessage || "xAI API key test failed.");
    }
  }

  throw new Error(lastMessage || "xAI API key test failed.");
}
