import { getCurrentWindow } from "@tauri-apps/api/window";

export function isDesktopShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function minimizeMainWindow(): Promise<void> {
  if (!isDesktopShell()) {
    return;
  }
  try {
    await getCurrentWindow().minimize();
  } catch {
    // Browser-Dev ohne Tauri ignorieren.
  }
}

export async function closeMainWindow(): Promise<void> {
  if (!isDesktopShell()) {
    return;
  }
  try {
    await getCurrentWindow().close();
  } catch {
    // Browser-Dev ohne Tauri ignorieren.
  }
}
