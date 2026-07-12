import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { analyzeHotkey } from "./hotkey-utils";
import { isDesktopShell } from "./window-controls";

export type GlobalHotkeyProbeResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "unavailable"; detail?: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryRegisterProbe(shortcut: string): Promise<void> {
  await register(shortcut, (event) => {
    void event;
  });
  try {
    await unregister(shortcut);
  } catch {
    // Best-effort cleanup; register succeeded so the shortcut is usable by this app.
  }
}

/**
 * Optional OS probe. On Windows this is flaky while keys are held and can false-negative
 * with ERROR_HOTKEY_ALREADY_REGISTERED. Prefer soft warnings, not hard blocks.
 *
 * Note: Tauri may still `register` successfully when another app owns the combo; the
 * handler simply never fires. So this cannot be a perfect conflict detector.
 */
export async function probeGlobalHotkeyAvailability(
  hotkey: string,
): Promise<GlobalHotkeyProbeResult> {
  if (!isDesktopShell()) {
    return { ok: true };
  }

  const analysis = analyzeHotkey(hotkey);
  if (!analysis.normalized) {
    return analysis.valid ? { ok: true } : { ok: false, reason: "invalid" };
  }
  if (!analysis.valid) {
    return { ok: false, reason: "invalid" };
  }

  const shortcut = analysis.normalized;

  try {
    try {
      if (await isRegistered(shortcut)) {
        return { ok: true };
      }
    } catch {
      // fall through
    }

    await tryRegisterProbe(shortcut);
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (import.meta.env.DEV) {
      console.warn("[agodesk:hotkey-probe] unavailable", shortcut, detail);
    }
    // If we already own it according to a later check, treat as ok.
    try {
      if (await isRegistered(shortcut)) {
        return { ok: true };
      }
    } catch {
      // ignore
    }
    return { ok: false, reason: "unavailable", detail };
  }
}

/** @deprecated Prefer capturing on keyup; kept for callers that still wait explicitly. */
export function waitForHotkeyKeysReleased(timeoutMs = 400): Promise<void> {
  return sleep(Math.min(timeoutMs, 400));
}
