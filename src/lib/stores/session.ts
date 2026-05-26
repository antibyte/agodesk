import { writable } from "svelte/store";
import type { SessionStatus } from "../types/protocol";

export interface SessionState {
  status: SessionStatus;
  sessionId: string;
  deviceId: string;
  errorMessage: string;
  remoteControlPending: boolean;
  remoteControlActive: boolean;
}

const initialState: SessionState = {
  status: "idle",
  sessionId: "",
  deviceId: "",
  errorMessage: "",
  remoteControlPending: false,
  remoteControlActive: false,
};

function createSessionStore() {
  const { subscribe, update, set } = writable<SessionState>({ ...initialState });

  return {
    subscribe,
    reset(): void {
      set({ ...initialState });
    },
    setStatus(status: SessionStatus, errorMessage = ""): void {
      update((state) => ({ ...state, status, errorMessage }));
    },
    setAcceptedSession(sessionId: string, deviceId = ""): void {
      update((state) => ({
        ...state,
        sessionId,
        deviceId: deviceId || state.deviceId,
      }));
    },
    setConnectionSession(sessionId: string): void {
      update((state) => ({ ...state, sessionId }));
    },
    setDeviceId(deviceId: string): void {
      update((state) => ({ ...state, deviceId }));
    },
    setRemoteControlPending(pending: boolean): void {
      update((state) => ({ ...state, remoteControlPending: pending }));
    },
    setRemoteControlActive(active: boolean): void {
      update((state) => ({
        ...state,
        remoteControlActive: active,
        remoteControlPending: active ? false : state.remoteControlPending,
      }));
    },
  };
}

export const sessionState = createSessionStore();
