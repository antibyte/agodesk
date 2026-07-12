import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import type { ShortcutEvent } from "@tauri-apps/plugin-global-shortcut";
import { resolveHotkeyForOs } from "./hotkey-utils";
import { isDesktopShell } from "./window-controls";

export type HotkeyOwner = "show-window" | "speech";

type ShortcutHandler = (event: ShortcutEvent) => void;

const owners = new Map<string, HotkeyOwner>();

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function toErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isAlreadyRegisteredError(error: unknown): boolean {
  return /already registered/i.test(toErrorMessage(error));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeIsRegistered(shortcut: string): Promise<boolean> {
  try {
    return await isRegistered(shortcut);
  } catch {
    return false;
  }
}

/** Always attempt unregister — plugin map and OS can diverge after failed probes. */
async function forceUnregister(osShortcut: string): Promise<void> {
  try {
    await unregister(osShortcut);
  } catch {
    // Best-effort — may not be in the plugin map.
  }
}

/**
 * Register a global shortcut for a named owner.
 * Serialized across show-window / speech so apply + accidental probes cannot race.
 */
export async function registerOwnedHotkey(
  owner: HotkeyOwner,
  shortcut: string,
  handler: ShortcutHandler,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDesktopShell()) {
    return { ok: true };
  }

  return enqueue(async () => {
    const other = [...owners.entries()].find(
      ([key, ownedBy]) => key === shortcut && ownedBy !== owner,
    );
    if (other) {
      return {
        ok: false,
        error: `hotkey_owned_by_${other[1]}`,
      };
    }

    const osShortcut = await resolveHotkeyForOs(shortcut);

    // Drop previous shortcut for this owner if it changed.
    for (const [key, ownedBy] of [...owners.entries()]) {
      if (ownedBy === owner && key !== shortcut) {
        await forceUnregister(await resolveHotkeyForOs(key));
        owners.delete(key);
      }
    }

    // Already ours — skip re-register (Windows often fails re-register of the same key).
    if (owners.get(shortcut) === owner) {
      if (await safeIsRegistered(osShortcut)) {
        return { ok: true };
      }
      // Ownership map drifted from plugin state — fall through and re-bind.
    }

    await forceUnregister(osShortcut);
    owners.delete(shortcut);
    await sleep(30);

    try {
      await register(osShortcut, handler);
      owners.set(shortcut, owner);
      return { ok: true };
    } catch (error) {
      if (isAlreadyRegisteredError(error)) {
        await forceUnregister(osShortcut);
        await sleep(80);
        try {
          await register(osShortcut, handler);
          owners.set(shortcut, owner);
          return { ok: true };
        } catch (retryError) {
          owners.delete(shortcut);
          return { ok: false, error: toErrorMessage(retryError) };
        }
      }
      owners.delete(shortcut);
      return { ok: false, error: toErrorMessage(error) };
    }
  });
}

export async function unregisterOwnedHotkey(owner: HotkeyOwner): Promise<void> {
  if (!isDesktopShell()) {
    return;
  }

  await enqueue(async () => {
    for (const [key, ownedBy] of [...owners.entries()]) {
      if (ownedBy === owner) {
        await forceUnregister(await resolveHotkeyForOs(key));
        owners.delete(key);
      }
    }
  });
}

export function getHotkeyOwner(shortcut: string): HotkeyOwner | undefined {
  return owners.get(shortcut);
}
