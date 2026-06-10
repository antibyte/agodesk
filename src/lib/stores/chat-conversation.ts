import { writable } from "svelte/store";
import type { ChatSessionSummary } from "../types/protocol";
import { filterVisibleChatSessions, isVisibleChatSession } from "../types/protocol";

export interface ChatConversationState {
  activeConversationId: string | null;
  activeRequestId: string | null;
  requestInFlight: boolean;
  sessions: ChatSessionSummary[];
  historyOpen: boolean;
  /** Request ids marked stopped locally before chat.cancelled arrives. */
  stoppedRequestIds: string[];
  /** Request ids that received chat.audio from AuraGo. */
  serverAudioRequestIds: string[];
  /** Chat without shared conversation_id when server ack has no id (temporary fallback). */
  legacyChatMode: boolean;
}

const initialState: ChatConversationState = {
  activeConversationId: null,
  activeRequestId: null,
  requestInFlight: false,
  sessions: [],
  historyOpen: false,
  stoppedRequestIds: [],
  serverAudioRequestIds: [],
  legacyChatMode: false,
};

function createChatConversationStore() {
  const { subscribe, update, set } = writable<ChatConversationState>({
    ...initialState,
  });

  return {
    subscribe,
    reset(): void {
      set({ ...initialState });
    },
    setActiveConversationId(conversationId: string | null): void {
      update((state) => ({ ...state, activeConversationId: conversationId }));
    },
    setSessions(sessions: ChatSessionSummary[]): void {
      update((state) => ({
        ...state,
        sessions: filterVisibleChatSessions(sessions),
      }));
    },
    upsertSession(session: ChatSessionSummary): void {
      update((state) => {
        const withoutCurrent = state.sessions.filter((entry) => entry.id !== session.id);
        if (!isVisibleChatSession(session)) {
          return { ...state, sessions: withoutCurrent };
        }
        return {
          ...state,
          sessions: [session, ...withoutCurrent].sort(
            (a, b) =>
              Date.parse(b.last_active_at || b.created_at) -
              Date.parse(a.last_active_at || a.created_at),
          ),
        };
      });
    },
    beginRequest(requestId: string): void {
      update((state) => ({
        ...state,
        activeRequestId: requestId,
        requestInFlight: true,
        stoppedRequestIds: state.stoppedRequestIds.filter((id) => id !== requestId),
      }));
    },
    finishRequest(requestId?: string): void {
      update((state) => {
        if (requestId && state.activeRequestId && state.activeRequestId !== requestId) {
          return state;
        }
        return {
          ...state,
          activeRequestId: null,
          requestInFlight: false,
        };
      });
    },
    markStopped(requestId: string): void {
      update((state) => ({
        ...state,
        activeRequestId: null,
        requestInFlight: false,
        stoppedRequestIds: state.stoppedRequestIds.includes(requestId)
          ? state.stoppedRequestIds
          : [...state.stoppedRequestIds, requestId],
      }));
    },
    markServerAudio(requestId: string): void {
      update((state) => ({
        ...state,
        serverAudioRequestIds: state.serverAudioRequestIds.includes(requestId)
          ? state.serverAudioRequestIds
          : [...state.serverAudioRequestIds, requestId],
      }));
    },
    clearServerAudioTracking(requestId?: string): void {
      update((state) => ({
        ...state,
        serverAudioRequestIds: requestId
          ? state.serverAudioRequestIds.filter((id) => id !== requestId)
          : [],
      }));
    },
    setHistoryOpen(open: boolean): void {
      update((state) => ({ ...state, historyOpen: open }));
    },
    setLegacyChatMode(enabled: boolean): void {
      update((state) => ({ ...state, legacyChatMode: enabled }));
    },
  };
}

export const chatConversationState = createChatConversationStore();
