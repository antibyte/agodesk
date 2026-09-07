import type { SessionStatus } from "../types/protocol";

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
