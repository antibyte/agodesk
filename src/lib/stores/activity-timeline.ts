import { writable } from "svelte/store";
import type { AgentActivityPayload, AgentActivityPhase } from "../types/protocol";

export interface ActivityTimelineState {
  activities: AgentActivityPayload[];
  conversationId: string;
  requestId?: string;
  dismissed: boolean;
}

const initialState: ActivityTimelineState = {
  activities: [],
  conversationId: "",
  dismissed: false,
};

const TERMINAL_PHASES = new Set<AgentActivityPhase>(["completed", "failed", "cancelled"]);

function createActivityTimelineStore() {
  const { subscribe, set, update } = writable<ActivityTimelineState>(initialState);

  return {
    subscribe,
    upsert(activity: AgentActivityPayload): void {
      update((state) => {
        const sameConversation =
          !state.conversationId || state.conversationId === activity.conversation_id;
        const sameRequest =
          !activity.request_id || !state.requestId || state.requestId === activity.request_id;

        const activities = sameConversation && sameRequest ? [...state.activities] : [];
        const index = activities.findIndex((item) => item.activity_id === activity.activity_id);
        if (index >= 0) {
          activities[index] = { ...activities[index], ...activity };
        } else {
          activities.push(activity);
        }

        return {
          activities,
          conversationId: activity.conversation_id,
          requestId: activity.request_id ?? state.requestId,
          dismissed: sameConversation && sameRequest ? state.dismissed : false,
        };
      });
    },
    dismiss(): void {
      update((state) => ({ ...state, dismissed: true }));
    },
    clear(): void {
      update((state) => ({
        ...state,
        activities: [],
        requestId: undefined,
        dismissed: false,
      }));
    },
    reset(): void {
      set(initialState);
    },
  };
}

export const activityTimelineState = createActivityTimelineStore();

export function isActivityTimelineVisible(
  activities: AgentActivityPayload[],
  dismissed: boolean,
): boolean {
  if (dismissed || activities.length === 0) {
    return false;
  }
  return activities.some((activity) => !TERMINAL_PHASES.has(activity.phase));
}

export function buildActivityTree(
  activities: AgentActivityPayload[],
): Array<AgentActivityPayload & { children: AgentActivityPayload[] }> {
  const byId = new Map<string, AgentActivityPayload & { children: AgentActivityPayload[] }>();
  for (const activity of activities) {
    byId.set(activity.activity_id, { ...activity, children: [] });
  }

  const roots: Array<AgentActivityPayload & { children: AgentActivityPayload[] }> = [];
  for (const node of byId.values()) {
    const parentId = node.parent_activity_id;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function listActiveActivities(activities: AgentActivityPayload[]): AgentActivityPayload[] {
  return activities.filter((activity) => !TERMINAL_PHASES.has(activity.phase));
}
