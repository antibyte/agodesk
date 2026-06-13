import type { ThemeMode } from "../types/protocol";

let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;
let tauriThemeUnlisten: (() => void) | null = null;

async function syncNativeTheme(theme: ThemeMode): Promise<void> {
  try {
    const { setTheme } = await import("@tauri-apps/api/app");
    await setTheme(theme === "system" ? null : theme);
  } catch {
    // Browser-Vorschau ohne Tauri
  }
}

async function listenNativeThemeChanges(theme: ThemeMode): Promise<void> {
  if (theme !== "system") {
    return;
  }

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    tauriThemeUnlisten = await getCurrentWindow().onThemeChanged(() => {
      applyTheme("system");
    });
  } catch {
    // Browser-Vorschau ohne Tauri
  }
}

export function applyTheme(theme: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme === "system" ? "light dark" : theme;
  void syncNativeTheme(theme);
}

export function initThemeListener(theme: ThemeMode): void {
  destroyThemeListener();
  applyTheme(theme);

  if (theme !== "system") {
    return;
  }

  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaListener = () => applyTheme("system");
  mediaQuery.addEventListener("change", mediaListener);
  void listenNativeThemeChanges(theme);
}

export function destroyThemeListener(): void {
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener("change", mediaListener);
  }
  mediaQuery = null;
  mediaListener = null;

  if (tauriThemeUnlisten) {
    tauriThemeUnlisten();
    tauriThemeUnlisten = null;
  }
}

export function cycleTheme(current: ThemeMode): ThemeMode {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}
