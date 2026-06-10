import { get } from "svelte/store";
import { sessionState } from "../stores/session";
import type { WsMessage } from "../types/protocol";
import {
  hasAdvertisedIntegrationsWebhosts,
  hasAdvertisedSystemWarnings,
} from "../types/protocol";
import type { NativeWebSocketService } from "./websocket";

export function buildIntegrationsWebhostsListMessage(
  sessionId: string,
): WsMessage {
  return {
    id: crypto.randomUUID(),
    type: "integrations.webhosts.list",
    timestamp: new Date().toISOString(),
    payload: { session_id: sessionId },
  };
}

export function buildSystemWarningsListMessage(sessionId: string): WsMessage {
  return {
    id: crypto.randomUUID(),
    type: "system.warnings.list",
    timestamp: new Date().toISOString(),
    payload: { session_id: sessionId },
  };
}

export async function bootstrapAgodeskFeatures(
  ws: NativeWebSocketService,
  sessionId: string,
): Promise<void> {
  const caps = get(sessionState).advertisedCapabilities;
  const tasks: Promise<void>[] = [];

  if (hasAdvertisedIntegrationsWebhosts(caps)) {
    tasks.push(ws.send(buildIntegrationsWebhostsListMessage(sessionId)));
  }
  if (hasAdvertisedSystemWarnings(caps)) {
    tasks.push(ws.send(buildSystemWarningsListMessage(sessionId)));
  }

  await Promise.all(tasks);
}

export async function refreshIntegrationsWebhosts(
  ws: NativeWebSocketService,
): Promise<void> {
  const session = get(sessionState);
  if (
    !session.sessionId ||
    !hasAdvertisedIntegrationsWebhosts(session.advertisedCapabilities)
  ) {
    return;
  }
  await ws.send(buildIntegrationsWebhostsListMessage(session.sessionId));
}

export async function refreshSystemWarnings(
  ws: NativeWebSocketService,
): Promise<void> {
  const session = get(sessionState);
  if (
    !session.sessionId ||
    !hasAdvertisedSystemWarnings(session.advertisedCapabilities)
  ) {
    return;
  }
  await ws.send(buildSystemWarningsListMessage(session.sessionId));
}
