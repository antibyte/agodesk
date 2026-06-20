import { chatMediaState } from "../stores/chat-media-state";
import { settings } from "../stores/settings";
import { get } from "svelte/store";
import type { SystemWarningsPayload, WsMessage } from "../types/protocol";
import { normalizeSystemWarningsPayload } from "../types/protocol";
import {
  applyLocalAcknowledgements,
  countUnacknowledgedWarnings,
} from "./system-warnings-persist";
import {
  getPersistedAcknowledgedWarningIds,
  initSystemWarningsPersist,
  persistAcknowledgedWarningId,
  persistAcknowledgedWarningIds,
} from "./system-warnings-storage";

export { initSystemWarningsPersist };

export function handleSystemWarningsMessage(payload: unknown): SystemWarningsPayload | null {
  const normalized = normalizeSystemWarningsPayload(payload);
  if (!normalized) {
    return null;
  }

  const serverUrl = get(settings).serverUrl;
  const localAcknowledgedIds = getPersistedAcknowledgedWarningIds(serverUrl);
  const warnings = applyLocalAcknowledgements(normalized.warnings, localAcknowledgedIds);
  const unacknowledged = countUnacknowledgedWarnings(warnings);

  chatMediaState.setSystemWarnings(warnings, normalized.total, unacknowledged);
  return {
    ...normalized,
    warnings,
    unacknowledged,
  };
}

export async function recordSystemWarningAcknowledgement(
  serverUrl: string,
  id: string,
): Promise<void> {
  chatMediaState.acknowledgeWarningById(id);
  await persistAcknowledgedWarningId(serverUrl, id);
}

export async function recordAllSystemWarningAcknowledgements(
  serverUrl: string,
  ids: string[],
): Promise<void> {
  chatMediaState.acknowledgeAllWarnings();
  await persistAcknowledgedWarningIds(serverUrl, ids);
}

export function buildSystemWarningAcknowledgeMessage(
  sessionId: string,
  options: { id?: string; all?: boolean },
): WsMessage {
  return {
    id: crypto.randomUUID(),
    type: "system.warning.acknowledge",
    timestamp: new Date().toISOString(),
    payload: {
      session_id: sessionId,
      ...(options.all ? { all: true } : {}),
      ...(options.id ? { id: options.id } : {}),
    },
  };
}
