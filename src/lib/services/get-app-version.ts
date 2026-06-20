import { getVersion } from "@tauri-apps/api/app";

let cachedVersion: string | null = null;

export async function getAppVersion(): Promise<string> {
  if (cachedVersion) {
    return cachedVersion;
  }

  try {
    cachedVersion = await getVersion();
  } catch {
    cachedVersion = "0.1.0";
  }

  return cachedVersion;
}

export function resetAppVersionCacheForTests(): void {
  cachedVersion = null;
}
