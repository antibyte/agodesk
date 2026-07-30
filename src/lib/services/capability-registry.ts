/**
 * Capability Registry — single source of truth for AgoDesk advertised capabilities.
 * Used to keep protocol advertisement, risk metadata, and operation lists aligned.
 */

export type CapabilityCategory =
  | "chat"
  | "desktop"
  | "files"
  | "shell"
  | "provider"
  | "persona"
  | "vault";
export type CapabilityRisk = "none" | "observe" | "read" | "write" | "execute" | "control";
export type CapabilityApprovalMode = "none" | "once" | "per_command" | "per_session";
export type CapabilityPlatform = "windows" | "linux" | "macos";

export interface CapabilityDefinition {
  id: string;
  version: number;
  category: CapabilityCategory;
  risk: CapabilityRisk;
  requires_local_setting?: string;
  approval_mode: CapabilityApprovalMode;
  supported_platforms: CapabilityPlatform[];
  operations: string[];
}

const ALL_PLATFORMS: CapabilityPlatform[] = ["windows", "linux", "macos"];

export const CAPABILITY_REGISTRY: readonly CapabilityDefinition[] = [
  {
    id: "chat.full_response",
    version: 1,
    category: "chat",
    risk: "none",
    approval_mode: "none",
    supported_platforms: ALL_PLATFORMS,
    operations: [],
  },
  {
    id: "chat.agent_metadata",
    version: 1,
    category: "chat",
    risk: "none",
    approval_mode: "none",
    supported_platforms: ALL_PLATFORMS,
    operations: [],
  },
  {
    id: "chat.plan_updates",
    version: 1,
    category: "chat",
    risk: "none",
    approval_mode: "none",
    supported_platforms: ALL_PLATFORMS,
    operations: ["chat.plan_update"],
  },
  {
    id: "chat.agent_activity",
    version: 1,
    category: "chat",
    risk: "none",
    approval_mode: "none",
    supported_platforms: ALL_PLATFORMS,
    operations: ["agent.activity"],
  },
  {
    id: "chat.sessions",
    version: 1,
    category: "chat",
    risk: "none",
    approval_mode: "none",
    supported_platforms: ALL_PLATFORMS,
    operations: ["chat.sessions.list", "chat.session.create", "chat.session.load"],
  },
  {
    id: "chat.cancel",
    version: 1,
    category: "chat",
    risk: "none",
    approval_mode: "none",
    supported_platforms: ALL_PLATFORMS,
    operations: ["chat.cancel"],
  },
  {
    id: "chat.media_events",
    version: 1,
    category: "chat",
    risk: "none",
    approval_mode: "none",
    supported_platforms: ALL_PLATFORMS,
    operations: ["chat.media"],
  },
  {
    id: "remote.desktop.capture",
    version: 1,
    category: "desktop",
    risk: "observe",
    requires_local_setting: "desktopControlEnabled",
    approval_mode: "none",
    supported_platforms: ALL_PLATFORMS,
    operations: ["desktop_screenshot"],
  },
  {
    id: "remote.desktop.input",
    version: 1,
    category: "desktop",
    risk: "control",
    requires_local_setting: "desktopControlEnabled",
    approval_mode: "per_session",
    supported_platforms: ALL_PLATFORMS,
    operations: ["desktop_input"],
  },
  {
    id: "remote.files.read",
    version: 1,
    category: "files",
    risk: "read",
    requires_local_setting: "fileAccess.enabled",
    approval_mode: "none",
    supported_platforms: ALL_PLATFORMS,
    operations: ["file_list", "file_read", "file_search"],
  },
  {
    id: "remote.files.write",
    version: 1,
    category: "files",
    risk: "write",
    requires_local_setting: "fileAccess.enabled",
    approval_mode: "none",
    supported_platforms: ALL_PLATFORMS,
    operations: ["file_write", "file_patch"],
  },
  {
    id: "remote.shell.exec",
    version: 1,
    category: "shell",
    risk: "execute",
    requires_local_setting: "shellAccess.enabled",
    approval_mode: "per_command",
    supported_platforms: ALL_PLATFORMS,
    operations: ["shell_exec"],
  },
  {
    id: "remote.shell.session",
    version: 1,
    category: "shell",
    risk: "execute",
    requires_local_setting: "shellAccess.enabled",
    approval_mode: "per_command",
    supported_platforms: ALL_PLATFORMS,
    operations: [
      "shell_session_start",
      "shell_session_read",
      "shell_session_input",
      "shell_session_stop",
      "shell_session_list",
    ],
  },
  {
    id: "persona.assets",
    version: 1,
    category: "persona",
    risk: "none",
    approval_mode: "none",
    supported_platforms: ALL_PLATFORMS,
    operations: ["persona.assets.request"],
  },
  {
    // Agent opens a masked input dialog; the user explicitly confirms each entry.
    // The plaintext goes straight to the AuraGo vault and is never shown to the agent.
    id: "vault.secret.prompt",
    version: 1,
    category: "vault",
    risk: "write",
    approval_mode: "once",
    supported_platforms: ALL_PLATFORMS,
    operations: [
      "vault.secret.prompt",
      "vault.secret.submit",
      "vault.secret.cancel",
      "vault.secret.ack",
    ],
  },
] as const;

export function getCapabilityDefinition(id: string): CapabilityDefinition | undefined {
  return CAPABILITY_REGISTRY.find((entry) => entry.id === id);
}

export function listOperationsForCapability(id: string): string[] {
  return getCapabilityDefinition(id)?.operations.slice() ?? [];
}

export function capabilityIdForDesktopOperation(operation: string): string | undefined {
  for (const entry of CAPABILITY_REGISTRY) {
    if (entry.operations.includes(operation)) {
      return entry.id;
    }
  }
  return undefined;
}

export function assertKnownDesktopOperations(operations: readonly string[]): string[] {
  const known = new Set(
    CAPABILITY_REGISTRY.flatMap((entry) => entry.operations).filter((op) => !op.includes(".")),
  );
  // desktop ops are snake_case without dots; chat message types include dots
  return operations.filter((operation) => {
    if (operation.includes(".")) {
      return false;
    }
    return !known.has(operation);
  });
}

/** Active skill label for UI (AuraGo owns skill logic; AgoDesk only displays). */
export interface ActiveSkillDisplay {
  skill_id: string;
  title: string;
  version?: string;
  steps?: Array<{ title: string; status: "pending" | "active" | "done" }>;
}
