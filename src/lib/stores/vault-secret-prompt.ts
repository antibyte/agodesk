import { writable } from "svelte/store";

/**
 * Pending agent-driven secret entry. Holds only the display metadata for the
 * dialog — never the entered value. The plaintext lives exclusively in the
 * modal's local component state until it is sent via `vault.secret.submit`.
 */
export interface VaultSecretPromptRequest {
  requestId: string;
  sessionId: string;
  prompt: string;
  vaultKey: string;
}

export interface VaultSecretPromptState {
  /** The currently open prompt, or null when no dialog is shown. */
  request: VaultSecretPromptRequest | null;
  /** True while a submit/cancel is in flight and we await `vault.secret.ack`. */
  busy: boolean;
}

const initialState: VaultSecretPromptState = {
  request: null,
  busy: false,
};

function createVaultSecretPromptStore() {
  const { subscribe, set, update } = writable<VaultSecretPromptState>({ ...initialState });

  return {
    subscribe,
    /** Show a new prompt (replaces any prior pending one). */
    open(request: VaultSecretPromptRequest): void {
      set({ request, busy: false });
    },
    setBusy(busy: boolean): void {
      update((state) => ({ ...state, busy }));
    },
    /** Close the dialog only if it still shows the given request. */
    close(requestId?: string): void {
      update((state) => {
        if (requestId && state.request && state.request.requestId !== requestId) {
          return state;
        }
        return { ...initialState };
      });
    },
    reset(): void {
      set({ ...initialState });
    },
  };
}

export const vaultSecretPromptState = createVaultSecretPromptStore();
