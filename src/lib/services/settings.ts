import { Store } from "@tauri-apps/plugin-store";
import type { AppSettings } from "../types/protocol";
import { DEFAULT_SETTINGS } from "../types/protocol";
import { normalizeServerUrl } from "./server-url";
import { updateSettings } from "../stores/settings";
import { initThemeListener } from "./theme";

const STORE_PATH = "settings.json";
const SETTINGS_KEY = "app_settings";

let store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load(STORE_PATH);
  }
  return store;
}

function normalizeSettings(saved: Partial<AppSettings> | null | undefined): AppSettings {
  const theme = saved?.theme;
  const serverUrl = normalizeServerUrl(saved?.serverUrl ?? DEFAULT_SETTINGS.serverUrl);
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    serverUrl,
    theme:
      theme === "light" || theme === "dark" || theme === "system"
        ? theme
        : DEFAULT_SETTINGS.theme,
  };
}

function applySettings(next: AppSettings): void {
  updateSettings(next);
  initThemeListener(next.theme);
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const loaded = await getStore();
    const saved = await loaded.get<Partial<AppSettings>>(SETTINGS_KEY);
    const merged = normalizeSettings(saved);
    applySettings(merged);
    return merged;
  } catch {
    const fallback = { ...DEFAULT_SETTINGS };
    applySettings(fallback);
    return fallback;
  }
}

export async function saveSettings(next: AppSettings): Promise<void> {
  const normalized = {
    ...next,
    serverUrl: normalizeServerUrl(next.serverUrl),
  };
  applySettings(normalized);

  try {
    const loaded = await getStore();
    await loaded.set(SETTINGS_KEY, normalized);
    await loaded.save();
  } catch {
    // Theme ist bereits angewendet, auch wenn Persistenz fehlschlägt
  }
}
