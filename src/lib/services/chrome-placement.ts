import type { AgentActivityPayload, AgoDeskPlan, SessionStatus, SystemWarning } from "../types/protocol";
import { isUpdateBannerVisible, type UpdateState } from "./update-flow";
import { isChatPlanPanelVisible } from "../stores/chat-plan";
import { isActivityTimelineVisible } from "../stores/activity-timeline";

export type ApprovalKind = "remote" | "shell" | "pairing";

export interface ApprovalInput {
  certModalOpen: boolean;
  desktopControlEnabled: boolean;
  remoteControlPending: boolean;
  remoteControlActive: boolean;
  shellPending: boolean;
  hasShellRequest: boolean;
  sessionStatus: SessionStatus;
}

export function isPairingNeeded(sessionStatus: SessionStatus): boolean {
  return sessionStatus === "awaiting_pairing" || sessionStatus === "error";
}

export function selectApproval(input: ApprovalInput): ApprovalKind | null {
  if (input.certModalOpen) {
    return null;
  }
  if (
    input.desktopControlEnabled &&
    (input.remoteControlPending || input.remoteControlActive)
  ) {
    return "remote";
  }
  if (input.shellPending && input.hasShellRequest) {
    return "shell";
  }
  if (isPairingNeeded(input.sessionStatus)) {
    return "pairing";
  }
  return null;
}

export type InboxItemKind = "warning" | "update" | "speech" | "plan" | "activity";

export interface InboxItem {
  id: string;
  kind: InboxItemKind;
  unread: boolean;
}

export interface InboxInput {
  warnings: SystemWarning[];
  update: Pick<UpdateState, "status" | "dismissed">;
  speechErrorMessage: string;
  vadError: string;
  plan: AgoDeskPlan | null;
  activities: AgentActivityPayload[];
  activityDismissed: boolean;
}

export function deriveInboxItems(input: InboxInput): InboxItem[] {
  const items: InboxItem[] = [];
  for (const warning of input.warnings) {
    items.push({ id: warning.id, kind: "warning", unread: !warning.acknowledged });
  }
  if (isUpdateBannerVisible({ ...input.update, dismissed: input.update.dismissed })) {
    items.push({ id: "update", kind: "update", unread: true });
  }
  if (input.speechErrorMessage.trim() || input.vadError.trim()) {
    items.push({ id: "speech-error", kind: "speech", unread: true });
  }
  if (isChatPlanPanelVisible(input.plan)) {
    items.push({ id: "plan", kind: "plan", unread: false });
  }
  if (isActivityTimelineVisible(input.activities, input.activityDismissed)) {
    items.push({ id: "activity", kind: "activity", unread: false });
  }
  return items;
}

export function countInboxBadge(items: InboxItem[]): number {
  return items.filter((item) => item.unread).length;
}
