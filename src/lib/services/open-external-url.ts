import { invoke } from "@tauri-apps/api/core";
import { isDesktopShell } from "./window-controls";

const GEMINI_API_KEY_URL = "https://aistudio.google.com/api-keys";

export { GEMINI_API_KEY_URL };

export async function openExternalUrl(url: string): Promise<void> {
  const target = url.trim();
  if (!target) {
    return;
  }

  if (isDesktopShell()) {
    await invoke("open_external_url", { url: target });
    return;
  }

  window.open(target, "_blank", "noopener,noreferrer");
}
