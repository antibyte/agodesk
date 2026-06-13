import { writable } from "svelte/store";
import type { SessionStatus } from "../types/protocol";

export interface SessionState {
  status: SessionStatus;
  sessionId: string;
  deviceId: string;
  errorMessage: string;
  remoteControlPending: boolean;
  remoteControlActive: boolean;
  advertisedCapabilities: string[];
  attachmentLimits: import("../types/protocol").ChatAttachmentLimits | null;
}

const initialState: SessionState = {
  status: "idle",
  sessionId: "",
  deviceId: "",
  errorMessage: "",
  remoteControlPending: false,
  remoteControlActive: false,
  advertisedCapabilities: [],
  attachmentLimits: null,
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
    setAdvertisedCapabilities(capabilities: string[]): void {
      update((state) => ({ ...state, advertisedCapabilities: [...capabilities] }));
    },
    setAttachmentLimits(limits: import("../types/protocol").ChatAttachmentLimits | null): void {
      update((state) => ({ ...state, attachmentLimits: limits }));
    },
  };
}

export const sessionState = createSessionStore();
