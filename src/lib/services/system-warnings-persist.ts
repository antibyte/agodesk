import type { SystemWarning } from "../types/protocol";
import { normalizeServerUrl } from "./server-url";

export type AcknowledgedWarningsStore = Record<string, string[]>;

export function sanitizeAcknowledgedWarningsStore(
  raw: AcknowledgedWarningsStore | null | undefined,
): AcknowledgedWarningsStore {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const next: AcknowledgedWarningsStore = {};

  for (const [serverUrl, ids] of Object.entries(raw)) {
    if (typeof serverUrl !== "string" || !Array.isArray(ids)) {
      continue;
    }

    const normalizedUrl = normalizeServerUrl(serverUrl);
    if (!normalizedUrl) {
      continue;
    }

    try {
      const parsed = new URL(normalizedUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        continue;
      }
    } catch {
      continue;
    }

    const uniqueIds = [
      ...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)),
    ];
    if (uniqueIds.length > 0) {
      next[normalizedUrl] = uniqueIds;
    }
  }

  return next;
}

export function applyLocalAcknowledgements(
  warnings: SystemWarning[],
  acknowledgedIds: ReadonlySet<string>,
): SystemWarning[] {
  if (acknowledgedIds.size === 0) {
    return warnings;
  }

  return warnings.map((warning) =>
    acknowledgedIds.has(warning.id) ? { ...warning, acknowledged: true } : warning,
  );
}

export function countUnacknowledgedWarnings(warnings: SystemWarning[]): number {
  return warnings.filter((warning) => !warning.acknowledged).length;
}

export function mergeAcknowledgedIds(
  store: AcknowledgedWarningsStore,
  serverUrl: string,
  ids: Iterable<string>,
): AcknowledgedWarningsStore {
  const key = normalizeServerUrl(serverUrl);
  const existing = new Set(store[key] ?? []);

  for (const id of ids) {
    if (id) {
      existing.add(id);
    }
  }

  if (existing.size === 0) {
    const { [key]: _removed, ...rest } = store;
    return rest;
  }

  return {
    ...store,
    [key]: [...existing],
  };
}

export function getAcknowledgedIdsForServer(
  store: AcknowledgedWarningsStore,
  serverUrl: string,
): Set<string> {
  const key = normalizeServerUrl(serverUrl);
  return new Set(store[key] ?? []);
}
