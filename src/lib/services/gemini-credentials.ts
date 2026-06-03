import { invoke } from "@tauri-apps/api/core";

export async function loadGeminiApiKey(): Promise<string | null> {
  try {
    return await invoke<string | null>("get_gemini_api_key");
  } catch {
    return null;
  }
}

export async function saveGeminiApiKey(apiKey: string): Promise<void> {
  await invoke("store_gemini_api_key", { apiKey: apiKey.trim() });
}

export async function clearGeminiApiKey(): Promise<void> {
  try {
    await invoke("delete_gemini_api_key");
  } catch {
    // ignore
  }
}

export async function hasGeminiApiKey(): Promise<boolean> {
  try {
    return await invoke<boolean>("has_gemini_api_key");
  } catch {
    return false;
  }
}
