import type { ThemeMode, UiTheme } from "../types/protocol";
import { uiThemeHasFixedScheme } from "../types/protocol";

let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;
let tauriThemeUnlisten: (() => void) | null = null;

/** Fixed color-scheme each non-aurora theme forces, regardless of the light/dark mode. */
const UI_THEME_COLOR_SCHEME: Partial<Record<UiTheme, "light" | "dark">> = {
  minimal: "dark",
  blossom: "light",
  cyberpunk: "dark",
  papyrus: "light",
  chaos: "dark",
};

let currentUiTheme: UiTheme = "aurora";
let currentThemeMode: ThemeMode = "system";

function colorSchemeForMode(theme: ThemeMode): string {
  return theme === "system" ? "light dark" : theme;
}

function applyColorScheme(): void {
  if (uiThemeHasFixedScheme(currentUiTheme)) {
    document.documentElement.style.colorScheme =
      UI_THEME_COLOR_SCHEME[currentUiTheme] ?? "light dark";
    return;
  }
  document.documentElement.style.colorScheme = colorSchemeForMode(currentThemeMode);
}

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
  currentThemeMode = theme;
  document.documentElement.setAttribute("data-theme", theme);
  applyColorScheme();
  void syncNativeTheme(theme);
}

/**
 * Applies the visual theme (design language) via `data-ui-theme`. Fixed themes
 * enforce their own color-scheme; aurora follows the current light/dark mode.
 */
export function applyUiTheme(theme: UiTheme): void {
  currentUiTheme = theme;
  document.documentElement.setAttribute("data-ui-theme", theme);
  applyColorScheme();
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
