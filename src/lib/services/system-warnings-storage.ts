import { Store } from "@tauri-apps/plugin-store";
import type { AcknowledgedWarningsStore } from "./system-warnings-persist.ts";
import {
  getAcknowledgedIdsForServer,
  mergeAcknowledgedIds,
  sanitizeAcknowledgedWarningsStore,
} from "./system-warnings-persist.ts";
import { normalizeServerUrl } from "./server-url.ts";

const STORE_PATH = "settings.json";
const STORE_KEY = "system_warnings_ack";

let store: Store | null = null;
let memoryStore: AcknowledgedWarningsStore = {};
let loaded = false;

async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load(STORE_PATH);
  }
  return store;
}

async function ensureLoaded(): Promise<void> {
  if (loaded) {
    return;
  }

  try {
    const loadedStore = await getStore();
    const saved = await loadedStore.get<AcknowledgedWarningsStore>(STORE_KEY);
    memoryStore = sanitizeAcknowledgedWarningsStore(saved);
  } catch {
    memoryStore = {};
  }

  loaded = true;
}

async function persistStore(): Promise<void> {
  try {
    const loadedStore = await getStore();
    await loadedStore.set(STORE_KEY, memoryStore);
    await loadedStore.save();
  } catch {
    // In-memory cache remains available when persistence is unavailable.
  }
}

export async function initSystemWarningsPersist(): Promise<void> {
  await ensureLoaded();
}

export function getPersistedAcknowledgedWarningIds(serverUrl: string): Set<string> {
  return getAcknowledgedIdsForServer(memoryStore, serverUrl);
}

export async function persistAcknowledgedWarningId(
  serverUrl: string,
  id: string,
): Promise<void> {
  if (!id) {
    return;
  }

  await ensureLoaded();
  memoryStore = mergeAcknowledgedIds(memoryStore, serverUrl, [id]);
  await persistStore();
}

export async function persistAcknowledgedWarningIds(
  serverUrl: string,
  ids: Iterable<string>,
): Promise<void> {
  await ensureLoaded();
  memoryStore = mergeAcknowledgedIds(memoryStore, serverUrl, ids);
  await persistStore();
}

export function resetSystemWarningsPersistForTests(): void {
  store = null;
  memoryStore = {};
  loaded = false;
}

export function seedSystemWarningsPersistForTests(
  serverUrl: string,
  ids: string[],
): void {
  memoryStore = mergeAcknowledgedIds({}, serverUrl, ids);
  loaded = true;
}

export function getSystemWarningsPersistSnapshot(serverUrl: string): string[] {
  return [...getAcknowledgedIdsForServer(memoryStore, normalizeServerUrl(serverUrl))];
}
