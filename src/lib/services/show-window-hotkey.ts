import {
  isRegistered,
  register,
  unregister,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";
import { showMainWindowFromTray } from "./tray";
import { isDesktopShell } from "./window-controls";

/** Unlikely to collide with browser/OS defaults; includes Alt+Shift modifier pair. */
export const DEFAULT_SHOW_WINDOW_HOTKEY = "Alt+Shift+G";

let activeHotkey: string | null = null;

const MODIFIER_TOKENS = new Set([
  "Alt",
  "Control",
  "Command",
  "CommandOrControl",
  "Shift",
  "Super",
]);

const RESERVED_HOTKEYS = new Set([
  "Alt+Tab",
  "Control+Alt+Delete",
  "Control+Shift+Escape",
  "Super+L",
  "Super+D",
  "Super+Tab",
]);

export function normalizeShowWindowHotkey(value: unknown): string {
  if (value === null || value === undefined) {
    return DEFAULT_SHOW_WINDOW_HOTKEY;
  }
  if (typeof value !== "string") {
    return DEFAULT_SHOW_WINDOW_HOTKEY;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "off" || trimmed === "none" || trimmed === "disabled") {
    return "";
  }
  return normalizeHotkeyTokens(trimmed) ?? DEFAULT_SHOW_WINDOW_HOTKEY;
}

function normalizeHotkeyTokens(raw: string): string | null {
  const parts = raw
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const normalized: string[] = [];
  for (const part of parts.slice(0, -1)) {
    const token = normalizeModifierToken(part);
    if (!token) {
      return null;
    }
    if (!normalized.includes(token)) {
      normalized.push(token);
    }
  }

  const key = normalizeKeyToken(parts[parts.length - 1] ?? "");
  if (!key || MODIFIER_TOKENS.has(key)) {
    return null;
  }

  normalized.push(key);
  return normalized.join("+");
}

function normalizeModifierToken(token: string): string | null {
  const lower = token.toLowerCase();
  if (
    lower === "ctrl" ||
    lower === "control" ||
    lower === "commandorcontrol" ||
    lower === "cmdorctrl"
  ) {
    return "CommandOrControl";
  }
  if (
    lower === "command" ||
    lower === "cmd" ||
    lower === "meta" ||
    lower === "super" ||
    lower === "win" ||
    lower === "windows"
  ) {
    return "Super";
  }
  if (lower === "alt" || lower === "option") {
    return "Alt";
  }
  if (lower === "shift") {
    return "Shift";
  }
  if (MODIFIER_TOKENS.has(token)) {
    return token;
  }
  return null;
}

function normalizeKeyToken(token: string): string | null {
  if (/^f\d{1,2}$/i.test(token)) {
    return token.toUpperCase();
  }
  if (token.length === 1) {
    return token.toUpperCase();
  }
  const named: Record<string, string> = {
    space: "Space",
    comma: "Comma",
    period: "Period",
    minus: "Minus",
    equal: "Equal",
    bracketleft: "BracketLeft",
    bracketright: "BracketRight",
    backslash: "Backslash",
    semicolon: "Semicolon",
    quote: "Quote",
    backquote: "Backquote",
  };
  const mapped = named[token.toLowerCase()];
  if (mapped) {
    return mapped;
  }
  if (/^[A-Z0-9]$/.test(token)) {
    return token;
  }
  return null;
}

export function isValidShowWindowHotkey(hotkey: string): boolean {
  if (!hotkey.trim()) {
    return true;
  }
  return normalizeHotkeyTokens(hotkey.trim()) !== null;
}

export type ShowWindowHotkeyWarning = "reserved" | "no_modifier" | "modifier_only";

export function analyzeShowWindowHotkey(hotkey: string): {
  valid: boolean;
  normalized: string;
  warning?: ShowWindowHotkeyWarning;
} {
  const trimmed = hotkey.trim();
  if (!trimmed) {
    return { valid: true, normalized: "" };
  }

  const normalized = normalizeHotkeyTokens(trimmed);
  if (!normalized) {
    const parts = trimmed
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 1) {
      return { valid: false, normalized: trimmed, warning: "no_modifier" };
    }
    return { valid: false, normalized: trimmed, warning: "modifier_only" };
  }

  if (RESERVED_HOTKEYS.has(normalized)) {
    return { valid: false, normalized, warning: "reserved" };
  }

  return { valid: true, normalized };
}

export function formatHotkeyLabel(hotkey: string): string {
  if (!hotkey.trim()) {
    return "";
  }
  return hotkey.split("+").join(" + ");
}

export function keyboardEventToHotkey(event: KeyboardEvent): string | null {
  if (event.repeat) {
    return null;
  }
  if (event.key === "Escape" || event.key === "Tab") {
    return null;
  }

  const modifiers: string[] = [];
  if (event.ctrlKey || event.metaKey) {
    modifiers.push("CommandOrControl");
  }
  if (event.altKey) {
    modifiers.push("Alt");
  }
  if (event.shiftKey) {
    modifiers.push("Shift");
  }
  if (modifiers.length === 0) {
    return null;
  }

  const key = codeToHotkeyKey(event.code);
  if (!key) {
    return null;
  }

  return [...modifiers, key].join("+");
}

function codeToHotkeyKey(code: string): string | null {
  if (code.startsWith("Key")) {
    return code.slice(3);
  }
  if (code.startsWith("Digit")) {
    return code.slice(5);
  }
  if (/^F\d{1,2}$/.test(code)) {
    return code;
  }
  const map: Record<string, string> = {
    Space: "Space",
    Comma: "Comma",
    Period: "Period",
    Minus: "Minus",
    Equal: "Equal",
    BracketLeft: "BracketLeft",
    BracketRight: "BracketRight",
    Backslash: "Backslash",
    Semicolon: "Semicolon",
    Quote: "Quote",
    Backquote: "Backquote",
  };
  return map[code] ?? null;
}

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

  try {
    if (activeHotkey && activeHotkey !== analysis.normalized) {
      if (await isRegistered(activeHotkey)) {
        await unregister(activeHotkey);
      }
    }

    if (!analysis.normalized) {
      activeHotkey = null;
      return { ok: true };
    }

    if (await isRegistered(analysis.normalized)) {
      await unregister(analysis.normalized);
    }

    await register(analysis.normalized, (event) => {
      if (event.state === "Pressed") {
        void revealMainWindow();
      }
    });

    activeHotkey = analysis.normalized;
    return { ok: true };
  } catch (error) {
    activeHotkey = null;
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function clearShowWindowHotkey(): Promise<void> {
  if (!isDesktopShell()) {
    activeHotkey = null;
    return;
  }
  try {
    await unregisterAll();
  } catch {
    if (activeHotkey) {
      try {
        await unregister(activeHotkey);
      } catch {
        // ignore
      }
    }
  }
  activeHotkey = null;
}
