import { writable } from "svelte/store";
import type { ConnectionStatus } from "../types/protocol";

export const connectionStatus = writable<ConnectionStatus>("disconnected");

export function setConnecting(): void {
  connectionStatus.set("connecting");
}

export function setConnected(): void {
  connectionStatus.set("connected");
}

export function setDisconnected(): void {
  connectionStatus.set("disconnected");
}

export function setConnectionError(): void {
  connectionStatus.set("error");
}
