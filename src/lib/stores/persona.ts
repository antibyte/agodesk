import { writable } from "svelte/store";

export interface PersonaState {
  persona: string;
  iconKey: string;
  avatarUrl: string;
  iconUrl: string;
  personaPrompt: string;
  assetVersion: string;
  loading: boolean;
}

const initialState: PersonaState = {
  persona: "",
  iconKey: "",
  avatarUrl: "",
  iconUrl: "",
  personaPrompt: "",
  assetVersion: "",
  loading: false,
};

function createPersonaStore() {
  const { subscribe, update, set } = writable<PersonaState>({ ...initialState });

  return {
    subscribe,
    reset(): void {
      set({ ...initialState });
    },
    setLoading(loading: boolean): void {
      update((state) => ({ ...state, loading }));
    },
    setAssets(assets: Omit<PersonaState, "loading">): void {
      set({ ...assets, loading: false });
    },
  };
}

export const personaState = createPersonaStore();
