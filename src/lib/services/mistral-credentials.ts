import { invoke } from "@tauri-apps/api/core";
import { isDesktopShell } from "./window-controls";

export async function loadMistralApiKey(): Promise<string | null> {
  try {
    return await invoke<string | null>("get_mistral_api_key");
  } catch {
    return null;
  }
}

export async function saveMistralApiKey(apiKey: string): Promise<void> {
  await invoke("store_mistral_api_key", { apiKey: apiKey.trim() });
}

export async function clearMistralApiKey(): Promise<void> {
  try {
    await invoke("delete_mistral_api_key");
  } catch {
    // ignore
  }
}

export async function hasMistralApiKey(): Promise<boolean> {
  try {
    return await invoke<boolean>("has_mistral_api_key");
  } catch {
    return false;
  }
}

export interface MistralVoiceOption {
  /** Usable voice identifier for the `voice` field (preset slug or custom voice id). */
  id: string;
  name: string;
  slug: string | null;
  language: string | null;
}

/** Fetch the Voxtral voice catalog (presets + account custom voices). */
export async function listMistralVoices(): Promise<MistralVoiceOption[]> {
  if (!isDesktopShell()) {
    return [];
  }
  const raw = await invoke<
    Array<{ id?: string; name?: string; slug?: string | null; language?: string | null }>
  >("list_mistral_voices");
  return (raw ?? [])
    .map((entry) => ({
      id: (entry.id ?? "").trim(),
      name: (entry.name ?? entry.id ?? "").trim() || (entry.id ?? "").trim(),
      slug: entry.slug ?? null,
      language: entry.language ?? null,
    }))
    .filter((entry) => entry.id.length > 0);
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
  }
  return String(error ?? "unknown error");
}

export interface MistralKeyTestResult {
  ok: true;
  message: string;
  network: boolean;
}

/**
 * Validates the stored Mistral API key.
 *
 * - Default: local only (stored + non-empty) — no Mistral HTTP call.
 * - `network: true`: `GET /v1/models` with Bearer auth.
 */
export async function testMistralApiKey(options?: {
  network?: boolean;
}): Promise<MistralKeyTestResult> {
  if (!isDesktopShell()) {
    throw new Error(
      "Mistral-Key-Test läuft nur in der Desktop-App (tauri dev / gebautes Binary), nicht im reinen Browser.",
    );
  }

  const network = options?.network === true;
  try {
    const message = await invoke<string>("test_mistral_api_key", { network });
    return {
      ok: true,
      message:
        typeof message === "string" && message.trim()
          ? message.trim()
          : network
            ? "Mistral API-Key-Netzwerktest erfolgreich."
            : "Mistral API-Key ist lokal gespeichert.",
      network,
    };
  } catch (error) {
    throw new Error(formatInvokeError(error) || "Mistral API key test failed.");
  }
}
