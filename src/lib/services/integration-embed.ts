import { formatInvokeError } from "./errors";

export interface IntegrationEmbedBounds {
  x: number;

  y: number;

  width: number;

  height: number;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let embedOperation: Promise<void> = Promise.resolve();

let embedGeneration = 0;

let embedPreviewOpen = false;

let closedListener: Promise<void> | null = null;

function runEmbedOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = embedOperation.then(operation, operation);

  embedOperation = next.then(
    () => undefined,

    () => undefined,
  );

  return next;
}

async function ensureClosedListener(): Promise<void> {
  if (closedListener || !isTauriRuntime()) {
    return;
  }

  closedListener = (async () => {
    try {
      const { listen } = await import("@tauri-apps/api/event");

      await listen("integration-embed-closed", () => {
        embedPreviewOpen = false;
      });
    } catch {
      closedListener = null;
    }
  })();

  await closedListener;
}

export function isIntegrationEmbedAvailable(): boolean {
  return isTauriRuntime();
}

export function isIntegrationPreviewOpen(): boolean {
  return embedPreviewOpen;
}

export async function openIntegrationPreview(
  url: string,

  title?: string,
): Promise<boolean> {
  if (!isTauriRuntime() || !url.trim()) {
    return false;
  }

  await ensureClosedListener();

  const generation = ++embedGeneration;

  return runEmbedOperation(async () => {
    if (generation !== embedGeneration) {
      return false;
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");

      await invoke("integration_embed_open", {
        url: url.trim(),

        title: title?.trim() || null,
      });

      if (generation !== embedGeneration) {
        return false;
      }

      embedPreviewOpen = true;

      return true;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn(
          "[agodesk:integration-embed]",

          formatInvokeError(error, "Integration preview failed"),
        );
      }

      return false;
    }
  });
}

/** @deprecated Use openIntegrationPreview in the desktop app. */

export async function openIntegrationEmbed(
  url: string,

  _bounds: IntegrationEmbedBounds,
): Promise<boolean> {
  return openIntegrationPreview(url);
}

export async function syncIntegrationEmbedBounds(_bounds: IntegrationEmbedBounds): Promise<void> {
  // Preview runs in its own window; bounds sync is not used.
}

export async function closeIntegrationEmbed(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  embedGeneration += 1;

  embedPreviewOpen = false;

  return runEmbedOperation(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");

      await Promise.race([
        invoke("integration_embed_close"),

        new Promise<void>((_, reject) => {
          window.setTimeout(() => reject(new Error("integration embed close timeout")), 5000);
        }),
      ]);
    } catch {
      // ignore close races/timeouts; UI must remain usable
    }
  });
}

export function readElementBounds(element: HTMLElement): IntegrationEmbedBounds {
  const rect = element.getBoundingClientRect();

  return {
    x: rect.left,

    y: rect.top,

    width: Math.max(rect.width, 1),

    height: Math.max(rect.height, 1),
  };
}

export async function readEmbedHostBounds(element: HTMLElement): Promise<IntegrationEmbedBounds> {
  return readElementBounds(element);
}

export async function syncEmbedHostBounds(_element: HTMLElement): Promise<void> {
  // no-op
}
