import { writable } from "svelte/store";
import type { AgentMoodMetadata } from "../types/protocol";

export interface AgentMoodState {
  mood: AgentMoodMetadata | null;
  sessionId: string;
  requestId?: string;
  updatedAt: string;
}

const initialState: AgentMoodState = {
  mood: null,
  sessionId: "",
  updatedAt: "",
};

function createAgentMoodStore() {
  const { subscribe, set, update } = writable<AgentMoodState>(initialState);

  return {
    subscribe,
    setMood(sessionId: string, mood: AgentMoodMetadata, requestId?: string): void {
      update((state) => ({
        ...state,
        sessionId,
        requestId,
        mood,
        updatedAt: new Date().toISOString(),
      }));
    },
    clearMood(): void {
      update((state) => ({
        ...state,
        mood: null,
        requestId: undefined,
        updatedAt: "",
      }));
    },
    reset(): void {
      set(initialState);
    },
  };
}

export const agentMoodState = createAgentMoodStore();
