import { writable } from "svelte/store";
import type { ChatMediaItem, SystemWarning, WebhostIntegration } from "../types/protocol";

export interface ChatMediaState {
  mediaByConversation: Map<string, ChatMediaItem[]>;
  integrationWebhosts: WebhostIntegration[];
  systemWarnings: SystemWarning[];
  warningTotal: number;
  warningUnacknowledged: number;
  integrationsOpen: boolean;
  warningsOpen: boolean;
}

const initialState: ChatMediaState = {
  mediaByConversation: new Map(),
  integrationWebhosts: [],
  systemWarnings: [],
  warningTotal: 0,
  warningUnacknowledged: 0,
  integrationsOpen: false,
  warningsOpen: false,
};

function cloneMediaMap(source: Map<string, ChatMediaItem[]>): Map<string, ChatMediaItem[]> {
  const next = new Map<string, ChatMediaItem[]>();
  for (const [key, items] of source) {
    next.set(key, [...items]);
  }
  return next;
}

function createChatMediaStore() {
  const { subscribe, update, set } = writable<ChatMediaState>({
    ...initialState,
    mediaByConversation: new Map(),
  });

  return {
    subscribe,
    reset(): void {
      set({
        ...initialState,
        mediaByConversation: new Map(),
      });
    },
    appendMediaItem(conversationId: string, item: ChatMediaItem): void {
      update((state) => {
        const mediaByConversation = cloneMediaMap(state.mediaByConversation);
        const existing = mediaByConversation.get(conversationId) ?? [];
        if (existing.some((entry) => entry.id === item.id)) {
          return state;
        }
        mediaByConversation.set(conversationId, [...existing, item]);
        return { ...state, mediaByConversation };
      });
    },
    clearConversationMedia(conversationId: string): void {
      update((state) => {
        const mediaByConversation = cloneMediaMap(state.mediaByConversation);
        mediaByConversation.delete(conversationId);
        return { ...state, mediaByConversation };
      });
    },
    setIntegrationWebhosts(webhosts: WebhostIntegration[]): void {
      update((state) => ({ ...state, integrationWebhosts: [...webhosts] }));
    },
    setSystemWarnings(warnings: SystemWarning[], total: number, unacknowledged: number): void {
      update((state) => ({
        ...state,
        systemWarnings: [...warnings],
        warningTotal: total,
        warningUnacknowledged: unacknowledged,
      }));
    },
    acknowledgeWarningById(id: string): void {
      update((state) => {
        const systemWarnings = state.systemWarnings.map((warning) =>
          warning.id === id ? { ...warning, acknowledged: true } : warning,
        );
        return {
          ...state,
          systemWarnings,
          warningUnacknowledged: systemWarnings.filter((warning) => !warning.acknowledged).length,
        };
      });
    },
    acknowledgeAllWarnings(): void {
      update((state) => ({
        ...state,
        systemWarnings: state.systemWarnings.map((warning) => ({
          ...warning,
          acknowledged: true,
        })),
        warningUnacknowledged: 0,
      }));
    },
    setIntegrationsOpen(open: boolean): void {
      update((state) => ({ ...state, integrationsOpen: open }));
    },
    setWarningsOpen(open: boolean): void {
      update((state) => ({ ...state, warningsOpen: open }));
    },
  };
}

export const chatMediaState = createChatMediaStore();
