import { activityTimelineState } from "../stores/activity-timeline";
import type { AgentActivityPayload } from "../types/protocol";
import { normalizeAgentActivityPayload } from "../types/protocol";
import { appendActivityJournal } from "./activity-journal";
import { activeSkillState } from "../stores/active-skill";

export function handleAgentActivity(payload: unknown): boolean {
  const normalized = normalizeAgentActivityPayload(payload);
  if (!normalized) {
    return false;
  }
  activityTimelineState.upsert(normalized);
  activeSkillState.observeActivity(normalized);
  appendActivityJournal({
    timestamp: normalized.finished_at || normalized.started_at || new Date().toISOString(),
    conversation_id: normalized.conversation_id,
    request_id: normalized.request_id,
    activity_id: normalized.activity_id,
    kind: normalized.kind,
    status: normalized.phase,
    duration_ms: normalized.duration_ms,
    command_summary: normalized.title,
    error_code: normalized.error_code,
  });
  return true;
}

export function emitLocalActivity(
  partial: Omit<AgentActivityPayload, "session_id" | "conversation_id"> & {
    session_id?: string;
    conversation_id?: string;
  },
): void {
  const activity: AgentActivityPayload = {
    session_id: partial.session_id || "local",
    conversation_id: partial.conversation_id || "local",
    activity_id: partial.activity_id,
    kind: partial.kind,
    phase: partial.phase,
    title: partial.title,
    ...(partial.parent_activity_id ? { parent_activity_id: partial.parent_activity_id } : {}),
    ...(partial.request_id ? { request_id: partial.request_id } : {}),
    ...(partial.command_id ? { command_id: partial.command_id } : {}),
    ...(partial.summary ? { summary: partial.summary } : {}),
    ...(partial.risk ? { risk: partial.risk } : {}),
    ...(partial.approval_required !== undefined
      ? { approval_required: partial.approval_required }
      : {}),
    ...(partial.progress ? { progress: partial.progress } : {}),
    ...(partial.artifact_ids ? { artifact_ids: partial.artifact_ids } : {}),
    ...(partial.started_at ? { started_at: partial.started_at } : {}),
    ...(partial.finished_at ? { finished_at: partial.finished_at } : {}),
    ...(partial.duration_ms !== undefined ? { duration_ms: partial.duration_ms } : {}),
    ...(partial.error_code ? { error_code: partial.error_code } : {}),
  };
  activityTimelineState.upsert(activity);
}
