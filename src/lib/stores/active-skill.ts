import { writable } from "svelte/store";
import type { ActiveSkillDisplay } from "../services/capability-registry";
import type { AgentActivityPayload } from "../types/protocol";

export interface ActiveSkillState {
  skill: ActiveSkillDisplay | null;
}

const initialState: ActiveSkillState = { skill: null };

function createActiveSkillStore() {
  const { subscribe, set, update } = writable<ActiveSkillState>(initialState);

  return {
    subscribe,
    setSkill(skill: ActiveSkillDisplay | null): void {
      set({ skill });
    },
    /** Derive skill banner from agent.activity titles like "Skill: Repository-Debugging v1.2". */
    observeActivity(activity: AgentActivityPayload): void {
      if (activity.kind !== "agent") {
        return;
      }
      const match = /^Skill:\s*(.+?)(?:\s+v([\d.]+))?$/i.exec(activity.title.trim());
      if (!match) {
        return;
      }
      update((state) => ({
        skill: {
          skill_id: match[1].toLowerCase().replace(/\s+/g, "-"),
          title: match[1],
          version: match[2],
          steps: state.skill?.steps,
        },
      }));
    },
    clear(): void {
      set(initialState);
    },
    reset(): void {
      set(initialState);
    },
  };
}

export const activeSkillState = createActiveSkillStore();
