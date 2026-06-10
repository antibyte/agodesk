import { Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "settings.json";
const LAST_CONVERSATION_KEY = "last_conversation_id";

let storePromise: Promise<Store> | null = null;

async function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load(STORE_FILE);
  }
  return storePromise;
}

export async function loadLastConversationId(): Promise<string | null> {
  try {
    const store = await getStore();
    const value = await store.get<string>(LAST_CONVERSATION_KEY);
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

export async function saveLastConversationId(conversationId: string): Promise<void> {
  const trimmed = conversationId.trim();
  if (!trimmed) {
    return;
  }
  try {
    const store = await getStore();
    await store.set(LAST_CONVERSATION_KEY, trimmed);
    await store.save();
  } catch {
    // Persistenz optional im Browser-Dev
  }
}

export async function clearLastConversationId(): Promise<void> {
  try {
    const store = await getStore();
    await store.delete(LAST_CONVERSATION_KEY);
    await store.save();
  } catch {
    // ignore
  }
}
