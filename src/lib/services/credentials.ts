import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { getWsOrigin } from "../types/protocol";

const DEVICE_STORE_PATH = "device.json";
const LEGACY_DEVICE_ID_KEY = "device_id";
const PAIRED_DEVICES_KEY = "paired_devices";
const PAIRING_TOKENS_KEY = "pairing_tokens";

let deviceStore: Store | null = null;

async function getDeviceStore(): Promise<Store> {
  if (!deviceStore) {
    deviceStore = await Store.load(DEVICE_STORE_PATH);
  }
  return deviceStore;
}

function normalizeOrigin(serverUrlOrOrigin: string): string {
  if (serverUrlOrOrigin.includes("://")) {
    return getWsOrigin(serverUrlOrOrigin);
  }
  return serverUrlOrOrigin;
}

async function readPairedDevices(): Promise<Record<string, string>> {
  const store = await getDeviceStore();
  const devices = (await store.get<Record<string, string>>(PAIRED_DEVICES_KEY)) ?? {};

  const legacy = await store.get<string>(LEGACY_DEVICE_ID_KEY);
  if (legacy && Object.keys(devices).length === 0) {
    return { __legacy__: legacy };
  }

  return devices;
}

export async function loadDeviceId(serverUrlOrOrigin: string): Promise<string | null> {
  try {
    const origin = normalizeOrigin(serverUrlOrOrigin);
    const devices = await readPairedDevices();
    if (devices[origin]) {
      return devices[origin];
    }
    if (devices.__legacy__) {
      await saveDeviceId(origin, devices.__legacy__);
      return devices.__legacy__;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveDeviceId(serverUrlOrOrigin: string, deviceId: string): Promise<void> {
  const origin = normalizeOrigin(serverUrlOrOrigin);
  const store = await getDeviceStore();
  const devices = (await store.get<Record<string, string>>(PAIRED_DEVICES_KEY)) ?? {};
  devices[origin] = deviceId;
  await store.set(PAIRED_DEVICES_KEY, devices);
  if (await store.get<string>(LEGACY_DEVICE_ID_KEY)) {
    await store.delete(LEGACY_DEVICE_ID_KEY);
  }
  await store.save();
}

export async function clearDeviceId(serverUrlOrOrigin: string): Promise<void> {
  try {
    const origin = normalizeOrigin(serverUrlOrOrigin);
    const store = await getDeviceStore();
    const devices = (await store.get<Record<string, string>>(PAIRED_DEVICES_KEY)) ?? {};
    if (!devices[origin]) {
      return;
    }
    delete devices[origin];
    await store.set(PAIRED_DEVICES_KEY, devices);
    await store.save();
  } catch {
    // ignore
  }
}

export async function loadSharedKey(deviceId: string): Promise<string | null> {
  try {
    return await invoke<string | null>("get_shared_key", { deviceId });
  } catch {
    return null;
  }
}

export async function saveSharedKey(deviceId: string, sharedKey: string): Promise<void> {
  await invoke("store_shared_key", { deviceId, sharedKey });
}

export async function clearSharedKey(deviceId: string): Promise<void> {
  try {
    await invoke("delete_shared_key", { deviceId });
  } catch {
    // ignore
  }
}

export async function clearCredentialsForOrigin(serverUrlOrOrigin: string): Promise<void> {
  const origin = normalizeOrigin(serverUrlOrOrigin);
  const deviceId = await loadDeviceId(origin);
  if (deviceId) {
    await clearSharedKey(deviceId);
  }
  await clearDeviceId(origin);
  await clearPairingToken(origin);
}

export async function savePairingToken(
  serverUrlOrOrigin: string,
  pairingToken: string,
): Promise<void> {
  const origin = normalizeOrigin(serverUrlOrOrigin);
  const trimmed = pairingToken.trim();
  if (!trimmed) {
    await clearPairingToken(origin);
    return;
  }

  try {
    const store = await getDeviceStore();
    const tokens = (await store.get<Record<string, string>>(PAIRING_TOKENS_KEY)) ?? {};
    tokens[origin] = trimmed;
    await store.set(PAIRING_TOKENS_KEY, tokens);
    await store.save();
  } catch {
    // ignore persistence errors in dev/browser
  }
}

export async function loadPairingToken(serverUrlOrOrigin: string): Promise<string | null> {
  try {
    const origin = normalizeOrigin(serverUrlOrOrigin);
    const store = await getDeviceStore();
    const tokens = await store.get<Record<string, string>>(PAIRING_TOKENS_KEY);
    return tokens?.[origin] ?? null;
  } catch {
    return null;
  }
}

export async function clearPairingToken(serverUrlOrOrigin: string): Promise<void> {
  try {
    const origin = normalizeOrigin(serverUrlOrOrigin);
    const store = await getDeviceStore();
    const tokens = await store.get<Record<string, string>>(PAIRING_TOKENS_KEY);
    if (!tokens?.[origin]) {
      return;
    }
    delete tokens[origin];
    await store.set(PAIRING_TOKENS_KEY, tokens);
    await store.save();
  } catch {
    // ignore
  }
}
