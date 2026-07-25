/**
 * Local activity journal — metadata only, no secrets / full outputs / file bodies.
 */

export interface ActivityJournalEntry {
  timestamp: string;
  conversation_id?: string;
  request_id?: string;
  activity_id?: string;
  kind: string;
  status: string;
  duration_ms?: number;
  command_summary?: string;
  cwd_id?: string;
  affected_paths?: string[];
  exit_code?: number;
  error_code?: string;
  job_id?: string;
}

const MAX_MEMORY_ENTRIES = 1000;
const STORAGE_KEY = "agodesk.activity-journal.v1";

let memory: ActivityJournalEntry[] = [];
let loaded = false;

function loadFromStorage(): void {
  if (loaded || typeof localStorage === "undefined") {
    loaded = true;
    return;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      loaded = true;
      return;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      memory = parsed
        .filter((entry): entry is ActivityJournalEntry => !!entry && typeof entry === "object")
        .slice(-MAX_MEMORY_ENTRIES);
    }
  } catch {
    memory = [];
  }
  loaded = true;
}

function persist(): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory.slice(-MAX_MEMORY_ENTRIES)));
  } catch {
    // quota / private mode — keep in-memory only
  }
}

function redactSummary(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  let summary = value.slice(0, 240);
  summary = summary.replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  summary = summary.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
  return summary;
}

export function appendActivityJournal(entry: ActivityJournalEntry): void {
  loadFromStorage();
  const cleaned: ActivityJournalEntry = {
    timestamp: entry.timestamp || new Date().toISOString(),
    kind: entry.kind,
    status: entry.status,
    ...(entry.conversation_id ? { conversation_id: entry.conversation_id } : {}),
    ...(entry.request_id ? { request_id: entry.request_id } : {}),
    ...(entry.activity_id ? { activity_id: entry.activity_id } : {}),
    ...(entry.duration_ms !== undefined ? { duration_ms: entry.duration_ms } : {}),
    ...(redactSummary(entry.command_summary)
      ? { command_summary: redactSummary(entry.command_summary) }
      : {}),
    ...(entry.cwd_id ? { cwd_id: entry.cwd_id } : {}),
    ...(entry.affected_paths && entry.affected_paths.length > 0
      ? { affected_paths: entry.affected_paths.slice(0, 50) }
      : {}),
    ...(entry.exit_code !== undefined ? { exit_code: entry.exit_code } : {}),
    ...(entry.error_code ? { error_code: entry.error_code } : {}),
    ...(entry.job_id ? { job_id: entry.job_id } : {}),
  };
  memory.push(cleaned);
  if (memory.length > MAX_MEMORY_ENTRIES) {
    memory = memory.slice(-MAX_MEMORY_ENTRIES);
  }
  persist();
}

export function queryActivityJournal(options: {
  conversationId?: string;
  failedOnly?: boolean;
  limit?: number;
} = {}): ActivityJournalEntry[] {
  loadFromStorage();
  let entries = [...memory];
  if (options.conversationId) {
    entries = entries.filter((entry) => entry.conversation_id === options.conversationId);
  }
  if (options.failedOnly) {
    entries = entries.filter(
      (entry) => entry.status === "failed" || entry.status === "cancelled" || !!entry.error_code,
    );
  }
  const limit = options.limit ?? 100;
  return entries.slice(-limit).reverse();
}

export function exportActivityJournalDiagnostic(limit = 200): string {
  const entries = queryActivityJournal({ limit });
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      entry_count: entries.length,
      entries,
    },
    null,
    2,
  );
}

export function clearActivityJournal(): void {
  memory = [];
  loaded = true;
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}
