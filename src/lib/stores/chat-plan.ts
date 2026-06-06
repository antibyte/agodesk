import { writable } from "svelte/store";
import type { AgoDeskPlan } from "../types/protocol";

export interface ChatPlanState {
  plan: AgoDeskPlan | null;
  sessionId: string;
  requestId?: string;
}

const initialState: ChatPlanState = {
  plan: null,
  sessionId: "",
};

function createChatPlanStore() {
  const { subscribe, set, update } = writable<ChatPlanState>(initialState);

  return {
    subscribe,
    setPlan(sessionId: string, plan: AgoDeskPlan | null, requestId?: string): void {
      update((state) => ({
        ...state,
        sessionId,
        requestId,
        plan,
      }));
    },
    reconcilePlan(plan: AgoDeskPlan | null): void {
      update((state) => ({
        ...state,
        plan,
      }));
    },
    clearPlan(): void {
      update((state) => ({
        ...state,
        plan: null,
        requestId: undefined,
      }));
    },
    reset(): void {
      set(initialState);
    },
  };
}

export const chatPlanState = createChatPlanStore();

export function isChatPlanPanelVisible(plan: AgoDeskPlan | null): boolean {
  if (!plan) {
    return false;
  }
  const status = typeof plan.status === "string" ? plan.status.toLowerCase() : "";
  return status !== "completed" && status !== "cancelled";
}
