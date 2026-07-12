import {
  analyzeHotkey,
  formatHotkeyLabel,
  keyboardEventToHotkey,
  normalizeHotkeyValue,
} from "./hotkey-utils";
import { registerOwnedHotkey, unregisterOwnedHotkey } from "./hotkey-registration";
import { showMainWindowFromTray } from "./tray";
import { isDesktopShell } from "./window-controls";

/** Unlikely to collide with browser/OS defaults; M for microphone. */
export const DEFAULT_SPEECH_HOTKEY = "Alt+Shift+M";

let activeHotkey: string | null = null;
let toggleHandler: (() => void | Promise<void>) | null = null;

export function normalizeSpeechHotkey(value: unknown): string {
  return normalizeHotkeyValue(value, DEFAULT_SPEECH_HOTKEY);
}

export function analyzeSpeechHotkey(hotkey: string) {
  return analyzeHotkey(hotkey);
}

export { formatHotkeyLabel, keyboardEventToHotkey };

export function setSpeechHotkeyToggleHandler(handler: (() => void | Promise<void>) | null): void {
  toggleHandler = handler;
}

async function revealAndToggleSpeech(): Promise<void> {
  await showMainWindowFromTray();
  await toggleHandler?.();
}

export async function applySpeechHotkey(
  hotkey: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isDesktopShell()) {
    return { ok: true };
  }

  const normalized = normalizeSpeechHotkey(hotkey);
  const analysis = analyzeSpeechHotkey(normalized);
  if (!analysis.valid) {
    return { ok: false, error: "invalid_hotkey" };
  }

  if (!analysis.normalized) {
    await unregisterOwnedHotkey("speech");
    activeHotkey = null;
    return { ok: true };
  }

  const result = await registerOwnedHotkey("speech", analysis.normalized, (event) => {
    if (event.state === "Pressed") {
      void revealAndToggleSpeech();
    }
  });

  if (!result.ok) {
    activeHotkey = null;
    return { ok: false, error: result.error };
  }

  activeHotkey = analysis.normalized;
  return { ok: true };
}

export function getActiveSpeechHotkey(): string | null {
  return activeHotkey;
}
