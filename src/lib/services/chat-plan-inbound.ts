import { chatPlanState } from "../stores/chat-plan";
import type { ChatResponseMetadata } from "../types/protocol";
import {
  normalizeChatPlanUpdatePayload,
  normalizeAgoDeskPlan,
} from "../types/protocol";

export function handleChatPlanUpdate(payload: unknown): boolean {
  const normalized = normalizeChatPlanUpdatePayload(payload);
  if (!normalized) {
    return false;
  }

  if (normalized.plan === null) {
    chatPlanState.clearPlan();
    return true;
  }

  chatPlanState.setPlan(normalized.session_id, normalized.plan, normalized.request_id);
  return true;
}

export function reconcilePlanFromResponse(metadata: ChatResponseMetadata | undefined): void {
  if (!metadata || !("plan" in metadata)) {
    return;
  }

  const plan = normalizeAgoDeskPlan(metadata.plan);
  chatPlanState.reconcilePlan(plan);
}
