import { getVersion } from "@tauri-apps/api/app";
import { AGODESK_CLIENT_VERSION } from "../types/protocol";

let cachedVersion: string | null = null;

export async function getAppVersion(): Promise<string> {
  if (cachedVersion) {
    return cachedVersion;
  }

  try {
    cachedVersion = await getVersion();
  } catch {
    cachedVersion = AGODESK_CLIENT_VERSION;
  }

  return cachedVersion;
}

export function resetAppVersionCacheForTests(): void {
  cachedVersion = null;
}
