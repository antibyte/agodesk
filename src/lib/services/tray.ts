import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export async function applyMinimizeToTraySetting(enabled: boolean): Promise<void> {
  try {
    await invoke("set_minimize_to_tray", { enabled });
  } catch {
    // Im Browser-Dev ohne Tauri-Shell ignorieren.
  }
}

export async function isMainWindowVisible(): Promise<boolean> {
  try {
    return await getCurrentWindow().isVisible();
  } catch {
    return true;
  }
}

export async function showMainWindowFromTray(): Promise<void> {
  try {
    const window = getCurrentWindow();
    await window.setSkipTaskbar(false);
    await window.unminimize();
    await window.show();
    await window.setFocus();
  } catch {
    // Im Browser-Dev ohne Tauri-Shell ignorieren.
  }
}
