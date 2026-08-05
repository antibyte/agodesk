import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

export function isDesktopShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Last non-maximized outer size — used if unmaximize fails on undecorated Windows. */
let lastRestoredSize: { width: number; height: number } | null = null;

export async function minimizeMainWindow(): Promise<void> {
  if (!isDesktopShell()) {
    return;
  }
  try {
    await getCurrentWindow().minimize();
  } catch {
    // Browser-Dev ohne Tauri ignorieren.
  }
}

export async function closeMainWindow(): Promise<void> {
  if (!isDesktopShell()) {
    return;
  }
  try {
    await getCurrentWindow().close();
  } catch {
    // Browser-Dev ohne Tauri ignorieren.
  }
}

async function rememberRestoredSize(): Promise<void> {
  try {
    const win = getCurrentWindow();
    if (await win.isMaximized()) {
      return;
    }
    const size = await win.outerSize();
    const factor = await win.scaleFactor();
    const width = Math.round(size.width / factor);
    const height = Math.round(size.height / factor);
    if (width >= 400 && height >= 300) {
      lastRestoredSize = { width, height };
    }
  } catch {
    // ignore
  }
}

/**
 * Toggle maximize / restore.
 * @param currentlyMaximized Optional UI state — preferred when isMaximized() lags
 *   on undecorated transparent Windows windows.
 */
export async function toggleMaximizeMainWindow(currentlyMaximized?: boolean): Promise<boolean> {
  if (!isDesktopShell()) {
    return false;
  }
  try {
    const win = getCurrentWindow();
    const reported = await win.isMaximized().catch(() => false);
    // Prefer explicit UI state when the OS report is inconsistent.
    const wasMax =
      typeof currentlyMaximized === "boolean" ? currentlyMaximized || reported : reported;

    if (!wasMax) {
      await rememberRestoredSize();
    }

    // Prefer the dedicated toggle API (needs allow-toggle-maximize).
    try {
      await win.toggleMaximize();
    } catch {
      // Fallback if toggle is denied or fails.
      if (wasMax) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
    }

    // Windows undecorated/transparent: state can settle a frame later.
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 50);
    });

    let nowMax = await win.isMaximized().catch(() => !wasMax);

    // If restore did nothing (known edge case on some Windows + transparent setups),
    // force a previous logical size so the window leaves the maximized visual state.
    if (wasMax && nowMax) {
      try {
        await win.unmaximize();
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 50);
        });
        nowMax = await win.isMaximized().catch(() => true);
      } catch {
        // continue to size fallback
      }
    }

    if (wasMax && nowMax) {
      const fallback = lastRestoredSize ?? { width: 900, height: 700 };
      try {
        await win.setSize(new LogicalSize(fallback.width, fallback.height));
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 50);
        });
        nowMax = await win.isMaximized().catch(() => false);
        // If isMaximized still true after setSize, trust the size change and report restored.
        if (nowMax) {
          nowMax = false;
        }
      } catch (sizeError) {
        console.warn("restore via setSize failed:", sizeError);
      }
    }

    return nowMax;
  } catch (error) {
    console.warn("toggleMaximizeMainWindow failed:", error);
    // Optimistic flip so the button icon still updates if IPC partially worked.
    return typeof currentlyMaximized === "boolean" ? !currentlyMaximized : false;
  }
}
