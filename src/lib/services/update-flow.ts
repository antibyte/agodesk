import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { get, writable } from "svelte/store";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "error"
  | "dismissed";

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  notes?: string;
  progress?: number;
  error?: string;
  dismissed: boolean;
}

const initialState: UpdateState = {
  status: "idle",
  dismissed: false,
};

export const updateState = writable<UpdateState>({ ...initialState });

let pendingUpdate: Update | null = null;

export function mapDownloadProgress(downloaded: number, contentLength: number): number {
  if (contentLength <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((downloaded / contentLength) * 100));
}

export function isUpdateBannerVisible(state: UpdateState): boolean {
  if (state.dismissed) {
    return false;
  }

  return state.status === "available" || state.status === "downloading";
}

function setState(patch: Partial<UpdateState>): void {
  updateState.update((current) => ({ ...current, ...patch }));
}

export async function checkForUpdates(options?: {
  silent?: boolean;
}): Promise<"available" | "upToDate" | "unavailable" | "error"> {
  setState({ status: "checking", error: undefined });

  try {
    pendingUpdate = await check();

    if (!pendingUpdate) {
      setState({ status: "idle", version: undefined, notes: undefined, progress: undefined });
      return "upToDate";
    }

    setState({
      status: "available",
      version: pendingUpdate.version,
      notes: pendingUpdate.body ?? undefined,
      progress: undefined,
      dismissed: false,
    });

    return "available";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setState({
      status: "error",
      error: message,
    });

    if (!options?.silent) {
      return "error";
    }

    return "unavailable";
  }
}

export async function installUpdate(): Promise<void> {
  const update = pendingUpdate;

  if (!update) {
    throw new Error("No pending update");
  }

  setState({ status: "downloading", progress: 0, error: undefined });

  let downloaded = 0;
  let contentLength = 0;

  try {
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        contentLength = event.data.contentLength ?? 0;
        downloaded = 0;
        setState({ progress: 0 });
        return;
      }

      if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        setState({ progress: mapDownloadProgress(downloaded, contentLength) });
        return;
      }

      if (event.event === "Finished") {
        setState({ progress: 100 });
      }
    });

    pendingUpdate = null;
    await relaunch();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setState({
      status: "error",
      error: message,
    });
    throw error;
  }
}

export function dismissUpdate(): void {
  setState({ dismissed: true, status: "dismissed" });
}

export function resetUpdateStateForTests(): void {
  pendingUpdate = null;
  updateState.set({ ...initialState });
}

export function getUpdateStateSnapshot(): UpdateState {
  return get(updateState);
}
