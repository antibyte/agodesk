import { writable } from "svelte/store";

export interface OpenPetsContextState {
  remoteOperation: string;
  pending: boolean;
  requestFailed: boolean;
}

const initialState: OpenPetsContextState = {
  remoteOperation: "",
  pending: false,
  requestFailed: false,
};

function createOpenPetsContextStore() {
  const { subscribe, update, set } = writable<OpenPetsContextState>({ ...initialState });

  return {
    subscribe,
    reset(): void {
      set({ ...initialState });
    },
    setRemoteOperation(remoteOperation: string): void {
      update((state) => ({ ...state, remoteOperation }));
    },
    setPending(pending: boolean): void {
      update((state) => ({
        ...state,
        pending,
        requestFailed: pending ? false : state.requestFailed,
      }));
    },
    markRequestFailed(): void {
      update((state) => ({ ...state, requestFailed: true, pending: false }));
    },
    clearRequestFailed(): void {
      update((state) => ({ ...state, requestFailed: false }));
    },
  };
}

export const openPetsContext = createOpenPetsContextStore();
