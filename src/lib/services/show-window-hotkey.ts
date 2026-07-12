import {
  analyzeHotkey,
  formatHotkeyLabel,
  keyboardEventToHotkey,
  normalizeHotkeyValue,
  type HotkeyWarning,
} from "./hotkey-utils";
import { registerOwnedHotkey, unregisterOwnedHotkey } from "./hotkey-registration";
import { showMainWindowFromTray } from "./tray";
import { isDesktopShell } from "./window-controls";

/** Unlikely to collide with browser/OS defaults; includes Alt+Shift modifier pair. */
export const DEFAULT_SHOW_WINDOW_HOTKEY = "Alt+Shift+G";

let activeHotkey: string | null = null;

export function normalizeShowWindowHotkey(value: unknown): string {
  return normalizeHotkeyValue(value, DEFAULT_SHOW_WINDOW_HOTKEY);
}

export function isValidShowWindowHotkey(hotkey: string): boolean {
  if (!hotkey.trim()) {
    return true;
  }
  return analyzeHotkey(hotkey.trim()).valid;
}

export type ShowWindowHotkeyWarning = HotkeyWarning;

export function analyzeShowWindowHotkey(hotkey: string) {
  return analyzeHotkey(hotkey);
}

export { formatHotkeyLabel, keyboardEventToHotkey };

async function revealMainWindow(): Promise<void> {
  await showMainWindowFromTray();
}

export async function applyShowWindowHotkey(
  hotkey: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isDesktopShell()) {
    return { ok: true };
  }

  const normalized = normalizeShowWindowHotkey(hotkey);
  const analysis = analyzeShowWindowHotkey(normalized);
  if (!analysis.valid) {
    return { ok: false, error: "invalid_hotkey" };
  }

  if (!analysis.normalized) {
    await unregisterOwnedHotkey("show-window");
    activeHotkey = null;
    return { ok: true };
  }

  const result = await registerOwnedHotkey("show-window", analysis.normalized, (event) => {
    if (event.state === "Pressed") {
      void revealMainWindow();
    }
  });

  if (!result.ok) {
    activeHotkey = null;
    return { ok: false, error: result.error };
  }

  activeHotkey = analysis.normalized;
  return { ok: true };
}

export async function clearShowWindowHotkey(): Promise<void> {
  await unregisterOwnedHotkey("show-window");
  activeHotkey = null;
}

export function getActiveShowWindowHotkey(): string | null {
  return activeHotkey;
}
