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

export type HotkeyWarning = "reserved" | "no_modifier" | "modifier_only";

export function normalizeHotkeyTokens(raw: string): string | null {
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

export function normalizeHotkeyValue(value: unknown, fallback: string): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "off" || trimmed === "none" || trimmed === "disabled") {
    return "";
  }
  return normalizeHotkeyTokens(trimmed) ?? fallback;
}

export function isValidHotkey(hotkey: string): boolean {
  if (!hotkey.trim()) {
    return true;
  }
  return normalizeHotkeyTokens(hotkey.trim()) !== null;
}

export function analyzeHotkey(hotkey: string): {
  valid: boolean;
  normalized: string;
  warning?: HotkeyWarning;
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

  // Prefer event.key for letters/digits so QWERTZ keycaps match the stored label
  // (OS registration remaps via resolveHotkeyForOs).
  const key = keyFromKeyboardEvent(event);
  if (!key) {
    return null;
  }

  return [...modifiers, key].join("+");
}

function keyFromKeyboardEvent(event: KeyboardEvent): string | null {
  const printed = event.key;
  if (printed.length === 1 && /^[a-z]$/i.test(printed)) {
    return printed.toUpperCase();
  }
  if (printed.length === 1 && /^[0-9]$/.test(printed)) {
    return printed;
  }
  return codeToHotkeyKey(event.code);
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

type KeyboardLayoutMapLike = {
  entries(): IterableIterator<[string, string]>;
};

let layoutMapPromise: Promise<KeyboardLayoutMapLike | null> | null = null;

async function getKeyboardLayoutMap(): Promise<KeyboardLayoutMapLike | null> {
  if (typeof navigator === "undefined") {
    return null;
  }
  const keyboard = (
    navigator as Navigator & {
      keyboard?: { getLayoutMap?: () => Promise<KeyboardLayoutMapLike> };
    }
  ).keyboard;
  if (!keyboard?.getLayoutMap) {
    return null;
  }
  if (!layoutMapPromise) {
    layoutMapPromise = keyboard.getLayoutMap().catch(() => null);
  }
  return layoutMapPromise;
}

/**
 * Map a user-facing hotkey (keycap letter) to the physical Code token that
 * global-hotkey / Windows RegisterHotKey expect (US-QWERTY positions).
 * Example on German QWERTZ: Alt+Shift+Y → Alt+Shift+Z
 */
export function applyLayoutMapToHotkey(
  hotkey: string,
  layoutMap: KeyboardLayoutMapLike | null | undefined,
): string {
  const trimmed = hotkey.trim();
  if (!trimmed || !layoutMap) {
    return trimmed;
  }

  const parts = trimmed
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return trimmed;
  }

  const keyToken = parts[parts.length - 1] ?? "";
  if (!/^[A-Z]$/i.test(keyToken)) {
    return trimmed;
  }

  const target = keyToken.toLowerCase();
  for (const [code, value] of layoutMap.entries()) {
    if (!code.startsWith("Key") || value.toLowerCase() !== target) {
      continue;
    }
    const physical = code.slice(3);
    if (/^[A-Z]$/i.test(physical)) {
      return [...parts.slice(0, -1), physical.toUpperCase()].join("+");
    }
  }

  return trimmed;
}

/** Resolve stored (keycap) hotkey to the OS/physical form before register. */
export async function resolveHotkeyForOs(hotkey: string): Promise<string> {
  const trimmed = hotkey.trim();
  if (!trimmed) {
    return "";
  }
  const layoutMap = await getKeyboardLayoutMap();
  return applyLayoutMapToHotkey(trimmed, layoutMap);
}
