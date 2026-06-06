import { writable } from "svelte/store";
import type { SpeechState, SpeechStatus } from "../types/speech";
import type { SpeechProvider } from "../types/protocol";
import { INITIAL_SPEECH_STATE } from "../types/speech";

function createSpeechStore() {
  const { subscribe, update, set } = writable<SpeechState>({
    ...INITIAL_SPEECH_STATE,
  });

  return {
    subscribe,
    setStatus(status: SpeechStatus): void {
      update((state) => ({
        ...state,
        status,
        isActive:
          status === "connecting" ||
          status === "listening" ||
          status === "processing" ||
          status === "speaking",
        errorMessage: status === "error" ? state.errorMessage : "",
      }));
    },
    setAgentMode(agentMode: boolean): void {
      update((state) => ({ ...state, agentMode }));
    },
    setProvider(provider: SpeechProvider): void {
      update((state) => ({ ...state, provider }));
    },
    setPartialTranscript(partialTranscript: string): void {
      update((state) => ({ ...state, partialTranscript }));
    },
    setError(errorMessage: string): void {
      update((state) => ({
        ...state,
        status: "error",
        isActive: false,
        errorMessage,
        partialTranscript: "",
      }));
    },
    setVadLoading(vadLoading: boolean): void {
      update((state) => ({ ...state, vadLoading }));
    },
    setVadError(vadError: string): void {
      update((state) => ({ ...state, vadError }));
    },
    clearVadError(): void {
      update((state) => ({ ...state, vadError: "" }));
    },
    reset(): void {
      set({ ...INITIAL_SPEECH_STATE });
    },
  };
}

export const speechState = createSpeechStore();
