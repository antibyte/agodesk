import { Store } from "@tauri-apps/plugin-store";

const STORE_PATH = "persona-debug.json";

export async function writePersonaDebug(entry: Record<string, unknown>): Promise<void> {
  try {
    const store = await Store.load(STORE_PATH);
    const previous = (await store.get<unknown[]>("events")) ?? [];
    const events = Array.isArray(previous) ? previous.slice(-20) : [];
    events.push({
      at: new Date().toISOString(),
      ...entry,
    });
    await store.set("events", events);
    await store.set("last", entry);
    await store.save();
  } catch {
    // Diagnosis must never break persona loading.
  }
}
