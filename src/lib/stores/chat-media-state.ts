import { writable } from "svelte/store";
import type { ChatMediaItem, SystemWarning, WebhostIntegration } from "../types/protocol";
import { sanitizeServerMediaRef } from "../types/protocol";

/** Stable identity so retried `chat.media` events with new ids/signatures stay one card. */
export function chatMediaStableKey(item: ChatMediaItem): string {
  const attachmentId = item.attachment_id?.trim();
  if (attachmentId) {
    return `attachment:${attachmentId}`;
  }
  const artifactId = item.artifact_id?.trim();
  if (artifactId) {
    return `artifact:${artifactId}`;
  }

  const raw = item.path ?? item.agent_path ?? item.url ?? item.filename ?? "";
  const pathOnly = sanitizeServerMediaRef(raw).split("?")[0] ?? "";
  const basename = pathOnly.split("/").filter(Boolean).pop() ?? "";
  const requestId = item.request_id?.trim();
  if (requestId && basename) {
    return `request:${requestId}:${item.kind}:${basename.toLowerCase()}`;
  }
  if (basename) {
    return `file:${item.kind}:${basename.toLowerCase()}`;
  }
  return `id:${item.id}`;
}

function preferText(next?: string, prev?: string): string | undefined {
  const trimmed = next?.trim();
  return trimmed ? trimmed : prev;
}

function preferMediaRef(next?: string, prev?: string): string | undefined {
  const chosen = preferText(next, prev);
  return chosen ? sanitizeServerMediaRef(chosen) : chosen;
}

function sanitizeChatMediaItemRefs(item: ChatMediaItem): ChatMediaItem {
  return {
    ...item,
    ...(item.path ? { path: sanitizeServerMediaRef(item.path) } : {}),
    ...(item.preview_url ? { preview_url: sanitizeServerMediaRef(item.preview_url) } : {}),
    ...(item.url ? { url: sanitizeServerMediaRef(item.url) } : {}),
  };
}

export function mergeChatMediaItem(
  previous: ChatMediaItem,
  incoming: ChatMediaItem,
): ChatMediaItem {
  return {
    ...previous,
    ...incoming,
    id: previous.id,
    title: preferText(incoming.title, previous.title),
    filename: preferText(incoming.filename, previous.filename),
    caption: preferText(incoming.caption, previous.caption),
    path: preferMediaRef(incoming.path, previous.path),
    agent_path: preferText(incoming.agent_path, previous.agent_path),
    preview_url: preferMediaRef(incoming.preview_url, previous.preview_url),
    url: preferMediaRef(incoming.url, previous.url),
    mime_type: preferText(incoming.mime_type, previous.mime_type),
  };
}

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
        const incomingKey = chatMediaStableKey(item);
        const matchIndex = existing.findIndex((entry) => chatMediaStableKey(entry) === incomingKey);
        if (matchIndex >= 0) {
          const nextItems = [...existing];
          nextItems[matchIndex] = mergeChatMediaItem(existing[matchIndex], item);
          mediaByConversation.set(conversationId, nextItems);
          return { ...state, mediaByConversation };
        }
        mediaByConversation.set(conversationId, [...existing, sanitizeChatMediaItemRefs(item)]);
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
