import { writable } from "svelte/store";
import type { ChatMessage } from "../types/protocol";

function createChatStore() {
  const { subscribe, update, set } = writable<ChatMessage[]>([]);
  const seenIds = new Set<string>();

  return {
    subscribe,
    addMessage(message: ChatMessage): void {
      if (seenIds.has(message.id)) {
        return;
      }
      seenIds.add(message.id);
      update((messages) => [...messages, message]);
    },
    clearMessages(): void {
      seenIds.clear();
      set([]);
    },
  };
}

export const chatMessages = createChatStore();
