/**
 * AuraGo server-side reference types for agodesk Computer-Use.
 * Copy into the AuraGo codebase — NOT compiled by agodesk.
 *
 * Canonical client types: src/lib/types/protocol.ts
 */

/** WebSocket envelope (both directions). */
export interface AgodeskWsMessage<T = unknown> {
  id: string;
  type: AgodeskMessageType;
  timestamp: string;
  payload: T;
}

export type AgodeskMessageType =
  | "system.connected"
  | "system.ping"
  | "system.pong"
  | "session.start"
  | "session.accepted"
  | "chat.message"
  | "chat.response"
  | "chat.error"
  | "desktop.command"
  | "desktop.result"
  | "persona.assets.request"
  | "persona.assets";

/** Capabilities the client sends in session.start.client_capabilities. */
export type AgodeskClientCapability =
  | "chat.full_response"
  | "persona.assets"
  | "remote.desktop.capture"
  | "remote.desktop.permission_request"
  | "remote.desktop.input"
  | "remote.desktop.discovery"
  | "remote.desktop.ui_automation"
  | "remote.desktop.browser"
  | "remote.files.read"
  | "remote.files.write";

export interface SessionStartPayload {
  client_version: string;
  client_capabilities: AgodeskClientCapability[];
  host: { hostname: string; os: string; arch: string; ip?: string };
  pairing_token?: string;
  device_id?: string;
  shared_key_proof?: { nonce: string; timestamp: string; hmac: string };
  file_access?: unknown;
}

export interface SessionAcceptedPayload {
  session_id: string;
  device_id: string;
  shared_key?: string;
  /** MUST mirror negotiated client_capabilities for desktop UI. */
  advertised_capabilities: AgodeskClientCapability[];
}

export type DesktopOperation =
  | "desktop_screenshot"
  | "desktop_permission_request"
  | "desktop_input"
  | "desktop_list_displays"
  | "desktop_list_windows"
  | "desktop_active_window"
  | "desktop_host_info"
  | "desktop_ui_tree"
  | "desktop_ui_action"
  | "desktop_browser_connect"
  | "desktop_browser_list_tabs"
  | "desktop_browser_snapshot"
  | "desktop_browser_action"
  | "desktop_browser_disconnect";

export interface DesktopCommandPayload {
  command_id: string;
  operation: DesktopOperation;
  params?: Record<string, unknown>;
}

export interface DesktopResultPayload {
  command_id: string;
  success: boolean;
  status?: "ok" | "error";
  session_id?: string;
  device_id?: string;
  data?: Record<string, unknown> | null;
  error?: string | null;
  error_code?: string | null;
}

/** Server → client: send desktop.command */
export type SendDesktopCommand = (
  deviceId: string,
  payload: DesktopCommandPayload,
) => Promise<DesktopResultPayload>;

/** Map capability → allowed operations (AuraGo should enforce before send). */
export const CAPABILITY_OPERATIONS: Record<string, DesktopOperation[]> = {
  "remote.desktop.capture": ["desktop_screenshot"],
  "remote.desktop.permission_request": ["desktop_permission_request"],
  "remote.desktop.input": ["desktop_input"],
  "remote.desktop.discovery": [
    "desktop_list_displays",
    "desktop_list_windows",
    "desktop_active_window",
    "desktop_host_info",
  ],
  "remote.desktop.ui_automation": ["desktop_ui_tree", "desktop_ui_action"],
  "remote.desktop.browser": [
    "desktop_browser_connect",
    "desktop_browser_list_tabs",
    "desktop_browser_snapshot",
    "desktop_browser_action",
    "desktop_browser_disconnect",
  ],
};

/** Operations that require user approval in agodesk Remote Control banner. */
export const APPROVAL_REQUIRED_OPERATIONS: DesktopOperation[] = [
  "desktop_input",
  "desktop_ui_action",
  "desktop_browser_action",
];

/** Retry when user approves banner — do not treat as hard failure. */
export const RETRY_AFTER_APPROVAL_ERROR_CODES = [
  "DESKTOP_INPUT_NOT_APPROVED",
  "DESKTOP_SESSION_NOT_APPROVED",
] as const;
