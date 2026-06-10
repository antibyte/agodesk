import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getTranslateFn } from "../i18n/store";

export async function applyMinimizeToTraySetting(enabled: boolean): Promise<void> {
  try {
    await invoke("set_minimize_to_tray", { enabled });
  } catch {
    // Im Browser-Dev ohne Tauri-Shell ignorieren.
  }
}

/** Sync tray menu labels with the active UI locale. */
export async function syncTrayLabels(): Promise<void> {
  const t = getTranslateFn();
  try {
    await invoke("update_tray_labels", {
      show: t("tray.show"),
      quit: t("tray.quit"),
      tooltip: t("tray.tooltip"),
    });
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
    await invoke("show_main_window");
  } catch {
    try {
      const window = getCurrentWindow();
      await window.setSkipTaskbar(false);
      await window.unminimize();
      await window.show();
      await window.maximize();
      await window.setFocus();
    } catch {
      // Im Browser-Dev ohne Tauri-Shell ignorieren.
    }
  }
}
