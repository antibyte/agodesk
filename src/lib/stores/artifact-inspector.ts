import { writable } from "svelte/store";
import type { ChatMediaItem } from "../types/protocol";

export type ArtifactInspectorTab = "preview" | "diff" | "source";

export interface ArtifactInspectorState {
  open: boolean;
  selected: ChatMediaItem | null;
  activeTab: ArtifactInspectorTab;
}

const initialState: ArtifactInspectorState = {
  open: false,
  selected: null,
  activeTab: "preview",
};

function createArtifactInspectorStore() {
  const { subscribe, set, update } = writable<ArtifactInspectorState>(initialState);

  return {
    subscribe,
    select(item: ChatMediaItem, tab: ArtifactInspectorTab = "preview"): void {
      update(() => ({
        open: true,
        selected: item,
        activeTab: tab,
      }));
    },
    setTab(tab: ArtifactInspectorTab): void {
      update((state) => ({ ...state, activeTab: tab }));
    },
    close(): void {
      update((state) => ({ ...state, open: false }));
    },
    reset(): void {
      set(initialState);
    },
  };
}

export const artifactInspectorState = createArtifactInspectorStore();

export function isArtifactInspectorVisible(state: ArtifactInspectorState): boolean {
  return state.open && state.selected !== null;
}
