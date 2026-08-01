import { stopSpeechSession } from "./speech-flow";

export type SystemConnectedCleanupDeps = {
  stopSpeechSession: () => Promise<void>;
};

/** Stops speech before session reset on WS `system.connected` / reconnect. */
export async function runSystemConnectedCleanup(
  deps: SystemConnectedCleanupDeps = { stopSpeechSession },
): Promise<void> {
  await deps.stopSpeechSession().catch(() => {});
}
