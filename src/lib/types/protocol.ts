import type { UiLocaleSetting } from "../i18n/locales";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type SessionStatus =
  | "idle"
  | "awaiting_pairing"
  | "pairing"
  | "accepted"
  | "loopback"
  | "error";

export type TlsMode = "system" | "pinned_self_signed_dev" | "insecure_loopback_dev";

export type ClientErrorCode =
  | "TLS_UNTRUSTED_CERTIFICATE"
  | "CERTIFICATE_PIN_MISMATCH"
  | "CERTIFICATE_EXPIRED"
  | "WEBSOCKET_UPGRADE_FAILED"
  | "PAIRING_REQUIRED"
  | "AUTH_FAILED"
  | "CONNECTION_FAILED";

export type MessageType =
  | "chat.message"
  | "chat.response"
  | "chat.response.chunk"
  | "chat.plan_update"
  | "chat.error"
  | "system.ping"
  | "system.pong"
  | "system.connected"
  | "session.start"
  | "session.accepted"
  | "session.clear"
  | "persona.assets.request"
  | "persona.assets"
  | "desktop.command"
  | "desktop.result"
  | "desktop.stream.frame";

export interface WsMessage<T = unknown> {
  id: string;
  type: MessageType;
  timestamp: string;
  payload: T;
}

export interface SystemConnectedPayload {
  protocol_version: string;
  session_id?: string;
  auth_required?: boolean;
  pairing_required?: boolean;
  requires_pairing?: boolean;
  allows_insecure_loopback?: boolean;
  capabilities?: string[];
}

export interface SessionStartHost {
  hostname: string;
  os: string;
  arch: string;
  ip?: string;
}

export interface SessionStartCommon {
  client_version: string;
  client_capabilities: string[];
  host: SessionStartHost;
  file_access?: FileAccessSessionPayload;
}

export interface SharedKeyProofPayload {
  nonce: string;
  timestamp: string;
  hmac: string;
}

export interface SessionStartPairingPayload extends SessionStartCommon {
  pairing_token: string;
}

export interface SessionStartReconnectPayload extends SessionStartCommon {
  device_id: string;
  shared_key_proof: SharedKeyProofPayload;
}

export type SessionStartPayload =
  | SessionStartPairingPayload
  | SessionStartReconnectPayload;

export interface SessionAcceptedPayload {
  session_id: string;
  device_id: string;
  shared_key?: string;
  advertised_capabilities?: string[];
  capabilities?: string[];
}

export interface SessionClearPayload {
  session_id?: string;
  reason?: string;
  clear_chat?: boolean;
}

export function normalizeSessionClearPayload(
  payload: unknown,
): SessionClearPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const result: SessionClearPayload = {};
  const sessionId = readString(record, "session_id", "sessionId");
  const reason = readString(record, "reason");
  const clearChatRaw = record.clear_chat ?? record.clearChat;

  if (sessionId) {
    result.session_id = sessionId;
  }
  if (reason) {
    result.reason = reason;
  }
  if (typeof clearChatRaw === "boolean") {
    result.clear_chat = clearChatRaw;
  }

  return result;
}

export function normalizeSessionAcceptedPayload(
  payload: unknown,
): SessionAcceptedPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const sessionId = record.session_id ?? record.sessionId;
  const deviceId = record.device_id ?? record.deviceId;
  if (typeof sessionId !== "string" || typeof deviceId !== "string") {
    return null;
  }

  const sharedKeyRaw = record.shared_key ?? record.sharedKey;
  const sharedKey =
    typeof sharedKeyRaw === "string" && sharedKeyRaw.length > 0
      ? sharedKeyRaw
      : undefined;

  const capsRaw = record.advertised_capabilities ?? record.capabilities;
  const advertisedCapabilities = Array.isArray(capsRaw)
    ? capsRaw.filter((cap): cap is string => typeof cap === "string")
    : undefined;

  return {
    session_id: sessionId,
    device_id: deviceId,
    shared_key: sharedKey,
    ...(advertisedCapabilities?.length
      ? { advertised_capabilities: advertisedCapabilities }
      : {}),
  };
}

export interface ChatMessagePayload {
  session_id: string;
  text: string;
  role: "user";
  source?: "user" | "speech" | "tool";
}

export interface AgentMoodMetadata {
  mood?: string;
  primary_mood?: string;
  secondary_mood?: string;
  description?: string;
  valence?: number;
  arousal?: number;
  confidence?: number;
  recommended_response_style?: string;
  source?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface AgoDeskPlanTaskCounts {
  total?: number;
  pending?: number;
  in_progress?: number;
  completed?: number;
  [key: string]: unknown;
}

export interface AgoDeskPlanTask {
  id?: string;
  title?: string;
  status?: string;
  [key: string]: unknown;
}

export interface AgoDeskPlan {
  id?: string;
  title?: string;
  status?: string;
  tasks?: AgoDeskPlanTask[];
  task_counts?: AgoDeskPlanTaskCounts;
  progress_pct?: number;
  current_task?: string;
  [key: string]: unknown;
}

export interface ChatResponseMetadata {
  source?: string;
  server_push?: boolean;
  agent_mood?: AgentMoodMetadata;
  plan?: AgoDeskPlan | null;
  [key: string]: unknown;
}

export interface ChatResponsePayload {
  session_id: string;
  request_id: string;
  text: string;
  role: "assistant";
  metadata?: ChatResponseMetadata;
}

export interface ChatResponseChunkPayload {
  session_id: string;
  request_id: string;
  delta: string;
  done: boolean;
  metadata?: ChatResponseMetadata;
}

export interface ChatPlanUpdatePayload {
  session_id: string;
  request_id?: string;
  plan: AgoDeskPlan | null;
}

export interface ChatErrorPayload {
  request_id?: string;
  code: string;
  message: string;
}

function readOptionalFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

export function normalizeAgentMoodMetadata(raw: unknown): AgentMoodMetadata | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const mood = readString(record, "mood");
  const primaryMood = readString(record, "primary_mood", "primaryMood");
  const secondaryMood = readString(record, "secondary_mood", "secondaryMood");
  const description = readString(record, "description");
  const recommendedStyle = readString(
    record,
    "recommended_response_style",
    "recommendedResponseStyle",
  );
  const source = readString(record, "source");
  const timestamp = readString(record, "timestamp");

  if (
    !mood &&
    !primaryMood &&
    !secondaryMood &&
    !description &&
    !recommendedStyle &&
    readOptionalFiniteNumber(record.valence) === undefined &&
    readOptionalFiniteNumber(record.arousal) === undefined &&
    readOptionalFiniteNumber(record.confidence) === undefined
  ) {
    return null;
  }

  return {
    ...record,
    ...(mood ? { mood } : {}),
    ...(primaryMood ? { primary_mood: primaryMood } : {}),
    ...(secondaryMood ? { secondary_mood: secondaryMood } : {}),
    ...(description ? { description } : {}),
    ...(recommendedStyle ? { recommended_response_style: recommendedStyle } : {}),
    ...(source ? { source } : {}),
    ...(timestamp ? { timestamp } : {}),
    ...(readOptionalFiniteNumber(record.valence) !== undefined
      ? { valence: readOptionalFiniteNumber(record.valence) }
      : {}),
    ...(readOptionalFiniteNumber(record.arousal) !== undefined
      ? { arousal: readOptionalFiniteNumber(record.arousal) }
      : {}),
    ...(readOptionalFiniteNumber(record.confidence) !== undefined
      ? { confidence: readOptionalFiniteNumber(record.confidence) }
      : {}),
  };
}

export function normalizeAgoDeskPlan(raw: unknown): AgoDeskPlan | null {
  if (raw === null) {
    return null;
  }
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const title = readString(record, "title");
  const status = readString(record, "status");
  const id = readString(record, "id");
  const currentTask = readString(record, "current_task", "currentTask");
  const progressPct = readOptionalFiniteNumber(record.progress_pct ?? record.progressPct);

  let tasks: AgoDeskPlanTask[] | undefined;
  if (Array.isArray(record.tasks)) {
    tasks = record.tasks
      .filter((task): task is Record<string, unknown> => !!task && typeof task === "object")
      .map((task) => ({
        ...task,
        ...(readString(task, "id") ? { id: readString(task, "id") } : {}),
        ...(readString(task, "title") ? { title: readString(task, "title") } : {}),
        ...(readString(task, "status") ? { status: readString(task, "status") } : {}),
      }));
  }

  let taskCounts: AgoDeskPlanTaskCounts | undefined;
  const countsRaw = record.task_counts ?? record.taskCounts;
  if (countsRaw && typeof countsRaw === "object") {
    const counts = countsRaw as Record<string, unknown>;
    taskCounts = {
      ...counts,
      ...(readOptionalFiniteNumber(counts.total) !== undefined
        ? { total: readOptionalFiniteNumber(counts.total) }
        : {}),
      ...(readOptionalFiniteNumber(counts.pending) !== undefined
        ? { pending: readOptionalFiniteNumber(counts.pending) }
        : {}),
      ...(readOptionalFiniteNumber(counts.in_progress ?? counts.inProgress) !== undefined
        ? {
            in_progress: readOptionalFiniteNumber(counts.in_progress ?? counts.inProgress),
          }
        : {}),
      ...(readOptionalFiniteNumber(counts.completed) !== undefined
        ? { completed: readOptionalFiniteNumber(counts.completed) }
        : {}),
    };
  }

  return {
    ...record,
    ...(id ? { id } : {}),
    ...(title ? { title } : {}),
    ...(status ? { status } : {}),
    ...(currentTask ? { current_task: currentTask } : {}),
    ...(progressPct !== undefined ? { progress_pct: progressPct } : {}),
    ...(tasks ? { tasks } : {}),
    ...(taskCounts ? { task_counts: taskCounts } : {}),
  };
}

export function normalizeChatResponseMetadata(raw: unknown): ChatResponseMetadata | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const record = raw as Record<string, unknown>;
  const source = readString(record, "source");
  const serverPushRaw = record.server_push ?? record.serverPush;
  const agentMoodRaw = record.agent_mood ?? record.agentMood;
  const planRaw = record.plan;

  const agentMood =
    agentMoodRaw === undefined ? undefined : normalizeAgentMoodMetadata(agentMoodRaw) ?? undefined;
  const plan =
    planRaw === undefined ? undefined : normalizeAgoDeskPlan(planRaw);

  const metadata: ChatResponseMetadata = { ...record };
  if (source) {
    metadata.source = source;
  }
  if (typeof serverPushRaw === "boolean") {
    metadata.server_push = serverPushRaw;
  }
  if (agentMood) {
    metadata.agent_mood = agentMood;
  }
  if (planRaw !== undefined) {
    metadata.plan = plan;
  }

  return metadata;
}

export function normalizeChatResponsePayload(payload: unknown): ChatResponsePayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const sessionId = record.session_id ?? record.sessionId;
  const requestId = record.request_id ?? record.requestId;
  const text = record.text;

  if (typeof sessionId !== "string" || typeof requestId !== "string" || typeof text !== "string") {
    return null;
  }

  const metadata = normalizeChatResponseMetadata(record.metadata);

  return {
    session_id: sessionId,
    request_id: requestId,
    text,
    role: "assistant",
    ...(metadata ? { metadata } : {}),
  };
}

export function normalizeChatPlanUpdatePayload(payload: unknown): ChatPlanUpdatePayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const sessionId = record.session_id ?? record.sessionId;
  if (typeof sessionId !== "string") {
    return null;
  }

  const requestId = readString(record, "request_id", "requestId");
  const planRaw = record.plan;
  if (planRaw !== null && planRaw !== undefined && typeof planRaw !== "object") {
    return null;
  }

  const plan = planRaw === undefined ? null : normalizeAgoDeskPlan(planRaw);

  return {
    session_id: sessionId,
    ...(requestId ? { request_id: requestId } : {}),
    plan,
  };
}

export function normalizeChatResponseChunkPayload(
  payload: unknown,
): ChatResponseChunkPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const sessionId = record.session_id ?? record.sessionId;
  const requestId = record.request_id ?? record.requestId;
  const delta = record.delta;
  const done = record.done;

  if (typeof sessionId !== "string" || typeof requestId !== "string") {
    return null;
  }
  if (typeof delta !== "string") {
    return null;
  }
  if (typeof done !== "boolean") {
    return null;
  }

  const metadata = normalizeChatResponseMetadata(record.metadata);

  return {
    session_id: sessionId,
    request_id: requestId,
    delta,
    done,
    ...(metadata ? { metadata } : {}),
  };
}

export interface DisplayInfo {
  id: string;
  index: number;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  primary: boolean;
  scale_factor: number;
}

export interface WindowInfo {
  id: string;
  title: string;
  class_name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  visible: boolean;
  display_id: string;
  display_name: string;
  monitor_index: number;
}

export interface CaptureScreenshotParams {
  display_id?: string;
  window_id?: string;
  format?: "png" | "jpeg";
  quality?: number;
}

export interface CaptureScreenshotResult {
  source: "display" | "window" | string;
  display_id?: string;
  window_id?: string;
  format: string;
  width: number;
  height: number;
  scale_factor: number;
  mime: string;
  data_base64: string;
}

export interface ControlPermissionStatus {
  screen_capture: boolean;
  input_injection: boolean;
  approved_session: boolean;
  ui_automation?: boolean;
  browser_automation?: boolean;
}

export interface HostInfo {
  hostname: string;
  platform: string;
  arch: string;
}

export interface ActiveWindowInfo {
  id: string;
  title: string;
  process_name: string;
  process_path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  display_id: string;
}

export interface UiBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UiNode {
  id: string;
  role: string;
  name?: string;
  automation_id?: string;
  bounds: UiBounds;
  interactive: boolean;
  enabled: boolean;
  visible: boolean;
  children?: UiNode[];
}

export interface UiTreeResult {
  window_id: string;
  root: UiNode;
  truncated: boolean;
  element_count: number;
}

export interface UiActionParams {
  action: "click" | "invoke" | "focus" | "set_value" | string;
  element_id: string;
  value?: string;
  window_id?: string;
}

export interface BrowserConnectParams {
  endpoint?: string;
  port?: number;
  auto_launch?: boolean;
  url?: string;
}

export interface BrowserSnapshotResult {
  url: string;
  title: string;
  text: string;
  html?: string;
  truncated?: boolean;
  screenshot_base64?: string;
  screenshot_mime?: string;
  screenshot_width?: number;
  screenshot_height?: number;
  tab_id?: string;
}

export interface BrowserSnapshotParams {
  selector?: string;
  include_html?: boolean;
  include_screenshot?: boolean;
  screenshot_format?: "jpeg" | "png" | "webp";
  quality?: number;
  full_page?: boolean;
  tab_id?: string;
}

export interface BrowserTabInfo {
  id: string;
  url: string;
  title: string;
  active: boolean;
}

export interface BrowserTabListResult {
  tabs: BrowserTabInfo[];
  active_tab_id: string;
}

export interface BrowserActionParams {
  action: string;
  selector?: string;
  tab_id?: string;
  value?: string;
}

export type DesktopInputKind =
  | "mouse_move"
  | "mouse_click"
  | "mouse_scroll"
  | "mouse_drag"
  | "key_down"
  | "key_up"
  | "key_combo"
  | "text";

export interface DesktopInputEvent {
  kind: DesktopInputKind | string;
  payload?: Record<string, unknown>;
}

export interface DesktopScreenshotParams {
  display_id?: string;
  window_id?: string;
  format?: "png" | "jpeg";
  quality?: number;
}

export interface DesktopStreamStartParams extends DesktopScreenshotParams {
  fps?: number;
}

export interface DesktopStreamStopParams {
  stream_id?: string;
}

export interface DesktopStreamStartResult {
  stream_id: string;
  active: true;
  fps: number;
  format: "jpeg" | "png";
  display_id?: string;
  window_id?: string;
}

export interface DesktopStreamStopResult {
  stream_id: string;
  active: false;
  frames_sent: number;
}

export interface DesktopStreamFramePayload {
  stream_id: string;
  sequence: number;
  timestamp: string;
  session_id?: string;
  device_id?: string;
  frame: {
    source: string;
    display_id: string | null;
    window_id: string | null;
    format: string;
    width: number;
    height: number;
    scale_factor: number;
    mime: string;
    data_base64: string;
  };
}

export interface DesktopInputParams {
  kind: DesktopInputKind | string;
  x?: number;
  y?: number;
  from_x?: number;
  from_y?: number;
  to_x?: number;
  to_y?: number;
  delta?: number;
  direction?: "up" | "down" | "left" | "right";
  keys?: string[];
  button?: "left" | "right" | "middle";
  action?: "down" | "up" | "click";
  key?: string;
  code?: number;
  text?: string;
  absolute?: boolean;
}

export type DesktopOperation =
  | "desktop_screenshot"
  | "desktop_stream_start"
  | "desktop_stream_stop"
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
  | "desktop_browser_disconnect"
  | "file_list"
  | "file_read"
  | "file_write";

export const FILE_OPERATIONS = ["file_list", "file_read", "file_write"] as const;

export type FileOperation = (typeof FILE_OPERATIONS)[number];

export const DESKTOP_V1_OPERATIONS: DesktopOperation[] = [
  "desktop_screenshot",
  "desktop_stream_start",
  "desktop_stream_stop",
  "desktop_permission_request",
  "desktop_input",
  "desktop_list_displays",
  "desktop_list_windows",
  "desktop_active_window",
  "desktop_host_info",
  "desktop_ui_tree",
  "desktop_ui_action",
  "desktop_browser_connect",
  "desktop_browser_list_tabs",
  "desktop_browser_snapshot",
  "desktop_browser_action",
  "desktop_browser_disconnect",
];

export const DESKTOP_DISCOVERY_OPERATIONS = [
  "desktop_list_displays",
  "desktop_list_windows",
  "desktop_active_window",
  "desktop_host_info",
] as const;

export const DESKTOP_UI_OPERATIONS = [
  "desktop_ui_tree",
  "desktop_ui_action",
] as const;

export const DESKTOP_BROWSER_OPERATIONS = [
  "desktop_browser_connect",
  "desktop_browser_list_tabs",
  "desktop_browser_snapshot",
  "desktop_browser_action",
  "desktop_browser_disconnect",
] as const;

export const DESKTOP_INPUT_OPERATIONS = [
  "desktop_input",
  "desktop_ui_action",
  "desktop_browser_action",
] as const;

const BROWSER_TAB_ACTIONS = new Set(["select_tab", "new_tab", "close_tab"]);

export function isBrowserTabAction(params?: unknown): boolean {
  if (!params || typeof params !== "object") {
    return false;
  }
  const action = (params as Record<string, unknown>).action;
  return typeof action === "string" && BROWSER_TAB_ACTIONS.has(action);
}

export const DESKTOP_STREAM_OPERATIONS: DesktopOperation[] = [
  "desktop_stream_start",
  "desktop_stream_stop",
];

export type DesktopErrorCode =
  | "SESSION_NOT_ACCEPTED"
  | "DESKTOP_SESSION_NOT_APPROVED"
  | "DESKTOP_INPUT_NOT_APPROVED"
  | "DESKTOP_INPUT_DENIED"
  | "DESKTOP_STREAM_UNSUPPORTED"
  | "DESKTOP_STREAM_NOT_ACTIVE"
  | "DESKTOP_OPERATION_UNSUPPORTED"
  | "DESKTOP_COMMAND_INVALID"
  | "DESKTOP_CONTROL_DISABLED"
  | "FILE_ACCESS_DISABLED"
  | "FILE_ROOT_UNKNOWN"
  | "FILE_PATH_DENIED"
  | "FILE_NOT_FOUND"
  | "FILE_TOO_LARGE"
  | "FILE_WRITE_DENIED"
  | "FILE_HASH_MISMATCH"
  | "DESKTOP_UI_UNAVAILABLE"
  | "DESKTOP_ELEMENT_NOT_FOUND"
  | "DESKTOP_ACCESSIBILITY_DENIED"
  | "DESKTOP_BROWSER_UNAVAILABLE";

export interface FileCommandParams {
  root_id?: string;
  path: string;
  recursive?: boolean;
  encoding?: "utf-8";
  content?: string;
  expected_hash?: string;
  create_only?: boolean;
}

export interface DesktopCommandPayload {
  command_id: string;
  operation: DesktopOperation;
  params?:
    | DesktopScreenshotParams
    | DesktopStreamStartParams
    | DesktopStreamStopParams
    | DesktopInputParams
    | FileCommandParams
    | Record<string, unknown>;
}

export interface DesktopResultPayload {
  command_id: string;
  success: boolean;
  /** AuraGo-kompatibles Statusfeld neben `success`. */
  status?: "ok" | "error";
  session_id?: string;
  device_id?: string;
  data?: Record<string, unknown> | null;
  error?: string | null;
  error_code?: DesktopErrorCode | null;
}

export interface DesktopCommandContext {
  sessionId?: string;
  deviceId?: string;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function normalizeDesktopScreenshotParams(
  raw: Record<string, unknown>,
): DesktopScreenshotParams {
  return {
    display_id: readString(raw, "display_id", "displayId"),
    window_id: readString(raw, "window_id", "windowId"),
    format: raw.format === "jpeg" ? "jpeg" : raw.format === "png" ? "png" : undefined,
    quality: typeof raw.quality === "number" ? raw.quality : undefined,
  };
}

function normalizeDesktopStreamStartParams(
  raw: Record<string, unknown>,
): DesktopStreamStartParams {
  const base = normalizeDesktopScreenshotParams(raw);
  const fps =
    typeof raw.fps === "number" && Number.isFinite(raw.fps) ? raw.fps : undefined;
  return {
    ...base,
    fps,
  };
}

function normalizeDesktopStreamStopParams(
  raw: Record<string, unknown>,
): DesktopStreamStopParams {
  return {
    stream_id: readString(raw, "stream_id", "streamId"),
  };
}

function normalizeDesktopInputParams(raw: Record<string, unknown>): DesktopInputParams {
  const kind = readString(raw, "kind") ?? "unknown";
  return {
    kind,
    x: typeof raw.x === "number" ? raw.x : undefined,
    y: typeof raw.y === "number" ? raw.y : undefined,
    button:
      raw.button === "left" || raw.button === "right" || raw.button === "middle"
        ? raw.button
        : undefined,
    action:
      raw.action === "down" || raw.action === "up" || raw.action === "click"
        ? raw.action
        : undefined,
    key: readString(raw, "key"),
    code: typeof raw.code === "number" ? raw.code : undefined,
    text: readString(raw, "text"),
    absolute: typeof raw.absolute === "boolean" ? raw.absolute : undefined,
  };
}

export function normalizeDesktopCommandPayload(
  raw: unknown,
): DesktopCommandPayload | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const commandId = readString(record, "command_id", "commandId");
  const operation = readString(record, "operation") as DesktopOperation | undefined;
  if (!commandId || !operation) {
    return null;
  }

  const paramsRaw = record.params;
  const paramsRecord =
    paramsRaw && typeof paramsRaw === "object"
      ? (paramsRaw as Record<string, unknown>)
      : {};

  let params: DesktopCommandPayload["params"];
  if (operation === "desktop_screenshot") {
    params = normalizeDesktopScreenshotParams(paramsRecord);
  } else if (operation === "desktop_stream_start") {
    params = normalizeDesktopStreamStartParams(paramsRecord);
  } else if (operation === "desktop_stream_stop") {
    params = normalizeDesktopStreamStopParams(paramsRecord);
  } else if (operation === "desktop_input") {
    params = normalizeDesktopInputParams(paramsRecord);
  } else if (operation === "desktop_ui_tree") {
    params = {
      window_id: readString(paramsRecord, "window_id", "windowId"),
    };
  } else if (operation === "desktop_ui_action") {
    params = {
      action: readString(paramsRecord, "action") ?? "click",
      element_id:
        readString(paramsRecord, "element_id", "elementId") ?? "",
      value: readString(paramsRecord, "value"),
      window_id: readString(paramsRecord, "window_id", "windowId"),
    };
  } else if (operation === "desktop_browser_connect") {
    const port =
      typeof paramsRecord.port === "number" && Number.isFinite(paramsRecord.port)
        ? paramsRecord.port
        : undefined;
    const autoLaunchRaw =
      paramsRecord.auto_launch ?? paramsRecord.autoLaunch;
    params = {
      endpoint: readString(paramsRecord, "endpoint"),
      port,
      auto_launch: typeof autoLaunchRaw === "boolean" ? autoLaunchRaw : undefined,
      url: readString(paramsRecord, "url"),
    };
  } else if (operation === "desktop_browser_snapshot") {
    const qualityRaw = paramsRecord.quality;
    const formatRaw = readString(
      paramsRecord,
      "screenshot_format",
      "screenshotFormat",
    );
    params = {
      selector: readString(paramsRecord, "selector"),
      include_html:
        paramsRecord.include_html === true || paramsRecord.includeHtml === true,
      include_screenshot:
        paramsRecord.include_screenshot === true ||
        paramsRecord.includeScreenshot === true,
      screenshot_format:
        formatRaw === "png" || formatRaw === "webp" || formatRaw === "jpeg"
          ? formatRaw
          : undefined,
      quality:
        typeof qualityRaw === "number" && Number.isFinite(qualityRaw)
          ? qualityRaw
          : undefined,
      full_page:
        paramsRecord.full_page === true || paramsRecord.fullPage === true,
      tab_id: readString(paramsRecord, "tab_id", "tabId"),
    };
  } else if (operation === "desktop_browser_action") {
    params = {
      action: readString(paramsRecord, "action") ?? "click",
      selector: readString(paramsRecord, "selector"),
      tab_id: readString(paramsRecord, "tab_id", "tabId"),
      value: readString(paramsRecord, "value"),
    };
  } else if (operation === "desktop_browser_list_tabs") {
    params = {};
  } else if (isFileOperation(operation)) {
    params = normalizeFileCommandParams(paramsRecord);
  } else if (Object.keys(paramsRecord).length > 0) {
    params = paramsRecord;
  }

  return {
    command_id: commandId,
    operation,
    params,
  };
}

export function canExecuteDesktopCommands(sessionStatus: SessionStatus): boolean {
  return sessionStatus === "accepted" || sessionStatus === "loopback";
}

export function isDesktopInputOperation(operation: string): boolean {
  return (DESKTOP_INPUT_OPERATIONS as readonly string[]).includes(operation);
}

export function isDesktopBrowserOperation(operation: string): boolean {
  return (DESKTOP_BROWSER_OPERATIONS as readonly string[]).includes(operation);
}

export function isDesktopStreamOperation(operation: string): boolean {
  return (DESKTOP_STREAM_OPERATIONS as readonly string[]).includes(operation);
}

export function isFileOperation(operation: string): operation is FileOperation {
  return FILE_OPERATIONS.includes(operation as FileOperation);
}

export function normalizeFileCommandParams(
  raw: Record<string, unknown>,
): FileCommandParams {
  return {
    root_id: readString(raw, "root_id", "rootId"),
    path: readString(raw, "path") ?? "",
    recursive: raw.recursive === true,
    encoding: raw.encoding === "utf-8" ? "utf-8" : undefined,
    content: readString(raw, "content"),
    expected_hash: readString(raw, "expected_hash", "expectedHash"),
    create_only: raw.create_only === true || raw.createOnly === true,
  };
}

export function requiresLocalDesktopApproval(
  operation: string,
  params?: unknown,
): boolean {
  if (operation === "desktop_browser_action" && isBrowserTabAction(params)) {
    return false;
  }
  return (DESKTOP_INPUT_OPERATIONS as readonly string[]).includes(operation);
}

export function requiresRemoteControlBanner(
  operation: string,
  params?: unknown,
): boolean {
  if (operation === "desktop_browser_action" && isBrowserTabAction(params)) {
    return false;
  }
  return (
    (DESKTOP_INPUT_OPERATIONS as readonly string[]).includes(operation) ||
    operation === "desktop_permission_request"
  );
}

export interface CertificateProbeResult {
  origin: string;
  subject: string;
  issuer: string;
  not_before: string;
  not_after: string;
  san: string[];
  sha256_fingerprint: string;
  trusted_by_os: boolean;
  validation_error?: string;
}

export interface TrustedCertificateEntry {
  sha256_fingerprint: string;
  trusted_at: string;
  subject: string;
}

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  timestamp: string;
  requestId?: string;
  /** True while chat.response.chunk stream is in progress. */
  streaming?: boolean;
  /** i18n key for system messages (re-translated on locale change). */
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  tone?: "info" | "success" | "error";
}

export type ThemeMode = "system" | "light" | "dark";

export type UiSoundTheme = "soft" | "classic" | "modern" | "warm";

export type UiSoundEvent = "send" | "receive" | "success" | "error" | "notice";

export interface UiSoundSettings {
  enabled: boolean;
  theme: UiSoundTheme;
  /** 0–1, Default ~0.2 für dezente Wirkung */
  volume: number;
}

/** Speech pipeline backend: cloud Gemini, hybrid local ASR + online TTS, or fully offline. */
export type SpeechProvider = "gemini_live" | "hybrid" | "offline";

export const SPEECH_PROVIDERS: readonly SpeechProvider[] = [
  "gemini_live",
  "hybrid",
  "offline",
] as const;

export type LocalAsrModel = "omnilingual_ctc_int8" | "whisper_small_de";

export type HybridTtsBackend = "edge_tts" | "azure";

export interface SpeechSettings {
  enabled: boolean;
  /** Which speech stack to use (Google / hybrid / offline). */
  provider: SpeechProvider;
  modelId: string;
  language: string;
  autoSendToAuraGo: boolean;
  agentMode: boolean;
  voiceResponses: boolean;
  voiceName: string;
  /** Local ASR model for hybrid and offline modes. */
  localAsrModel: LocalAsrModel;
  /** Online TTS backend for hybrid mode. */
  hybridTtsBackend: HybridTtsBackend;
  /** Voice id for hybrid online TTS (e.g. de-DE-KatjaNeural). */
  hybridTtsVoice: string;
  /** Piper voice id for offline TTS (e.g. de_DE-thorsten-high). */
  offlineTtsVoice: string;
  /** Barge-in (user interruption while AI speaks) detection mode. */
  bargeInMode: "energy" | "silero" | "auto";
}

export const DEFAULT_HYBRID_TTS_VOICE = "de-DE-KatjaNeural";
export const DEFAULT_OFFLINE_TTS_VOICE = "de_DE-thorsten-high";

export const DEFAULT_SPEECH_SETTINGS: SpeechSettings = {
  enabled: true,
  provider: "gemini_live",
  modelId: "gemini-2.5-flash-native-audio-preview-12-2025",
  language: "de-DE",
  autoSendToAuraGo: false,
  agentMode: false,
  voiceResponses: true,
  voiceName: "Zephyr",
  localAsrModel: "whisper_small_de",
  hybridTtsBackend: "edge_tts",
  hybridTtsVoice: DEFAULT_HYBRID_TTS_VOICE,
  offlineTtsVoice: DEFAULT_OFFLINE_TTS_VOICE,
  bargeInMode: "auto",
};

export function normalizeSpeechProvider(value: unknown): SpeechProvider {
  if (value === "hybrid" || value === "offline" || value === "gemini_live") {
    return value;
  }
  return DEFAULT_SPEECH_SETTINGS.provider;
}

export function isGeminiSpeechProvider(provider: SpeechProvider): boolean {
  return provider === "gemini_live";
}

export function speechProviderRequiresGeminiApiKey(provider: SpeechProvider): boolean {
  return provider === "gemini_live";
}

export const DEFAULT_UI_SOUND_SETTINGS: UiSoundSettings = {
  enabled: true,
  theme: "soft",
  volume: 0.2,
};

export const UI_SOUND_THEMES: readonly UiSoundTheme[] = [
  "soft",
  "classic",
  "modern",
  "warm",
] as const;

export const UI_SOUND_THEME_LABELS: Record<UiSoundTheme, string> = {
  soft: "Soft",
  classic: "Classic",
  modern: "Modern",
  warm: "Warm",
};

export type FileAccessPermission = "read" | "write";

export interface FileAccessRoot {
  rootId: string;
  label: string;
  canonicalPath: string;
  pathDisplay: string;
  readEnabled: boolean;
  writeEnabled: boolean;
}

export interface FileAccessSettings {
  enabled: boolean;
  maxReadBytes: number;
  maxWriteBytes: number;
  roots: FileAccessRoot[];
}

export interface FileAccessSessionRoot {
  root_id: string;
  label: string;
  path_display: string;
  permissions: FileAccessPermission[];
}

export interface FileAccessSessionPayload {
  enabled: boolean;
  max_read_bytes: number;
  max_write_bytes: number;
  roots: FileAccessSessionRoot[];
}

export const DEFAULT_FILE_ACCESS_SETTINGS: FileAccessSettings = {
  enabled: false,
  maxReadBytes: 8_388_608,
  maxWriteBytes: 8_388_608,
  roots: [],
};

export interface AppSettings {
  serverUrl: string;
  theme: ThemeMode;
  /** UI-Sprache (`system` folgt der Betriebssystem-Sprache). */
  locale: UiLocaleSetting;
  speech: SpeechSettings;
  /** Dezente UI-Sounds (Nachrichten, Verbindung). */
  uiSounds: UiSoundSettings;
  /** Fenster in den Infobereich minimieren statt beenden. */
  minimizeToTray: boolean;
  /** Screenshots und Remote-Eingaben über desktop.command erlauben. */
  desktopControlEnabled: boolean;
  /** Browser-Automatisierung (CDP) separat freigeben. */
  browserControlEnabled: boolean;
  /** Lokale Ordnerfreigaben für Remote-Dateizugriff. */
  fileAccess: FileAccessSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  serverUrl: "ws://127.0.0.1:8080/api/agodesk/ws?insecure_loopback=1",
  theme: "system",
  locale: "system",
  speech: { ...DEFAULT_SPEECH_SETTINGS },
  uiSounds: { ...DEFAULT_UI_SOUND_SETTINGS },
  minimizeToTray: false,
  desktopControlEnabled: true,
  browserControlEnabled: true,
  fileAccess: { ...DEFAULT_FILE_ACCESS_SETTINGS },
};

export const PROTOCOL_VERSION = "agodesk.v1";

export const AGODESK_CLIENT_VERSION = "0.1.0";

export const AGODESK_BASE_CAPABILITIES = [
  "chat.full_response",
  "chat.agent_metadata",
  "chat.plan_updates",
  "persona.assets",
] as const;

export const AGODESK_AGENT_METADATA_CAPABILITY = "chat.agent_metadata";
export const AGODESK_PLAN_UPDATES_CAPABILITY = "chat.plan_updates";

export const AGODESK_DESKTOP_CAPABILITIES = [
  "remote.desktop.capture",
  "remote.desktop.stream",
  "remote.desktop.permission_request",
  "remote.desktop.input",
  "remote.desktop.discovery",
  "remote.desktop.ui_automation",
] as const;

export const AGODESK_BROWSER_CAPABILITY = "remote.desktop.browser";

/** Capabilities advertised to AuraGo when desktop control is fully enabled. */
export const AGODESK_CLIENT_CAPABILITIES = [
  "chat.full_response",
  "chat.agent_metadata",
  "chat.plan_updates",
  ...AGODESK_DESKTOP_CAPABILITIES,
  "persona.assets",
] as const;

export const AGODESK_FILE_READ_CAPABILITY = "remote.files.read";
export const AGODESK_FILE_WRITE_CAPABILITY = "remote.files.write";

export function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

export function isInsecureLoopbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      isLoopbackHost(parsed.hostname) &&
      parsed.searchParams.get("insecure_loopback") === "1"
    );
  } catch {
    return false;
  }
}

export function appendInsecureLoopbackIfNeeded(url: string): string {
  try {
    const parsed = new URL(url);
    if (!isLoopbackHost(parsed.hostname)) {
      return url;
    }
    if (parsed.searchParams.get("insecure_loopback") === "1") {
      return url;
    }
    parsed.searchParams.set("insecure_loopback", "1");
    return parsed.toString();
  } catch {
    return url;
  }
}

export function getWsOrigin(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

/** HTTP(S)-Origin for asset fetches — maps ws/wss server URLs to http/https. */
export function getHttpOrigin(url: string): string {
  const parsed = new URL(url);
  const protocol =
    parsed.protocol === "wss:"
      ? "https:"
      : parsed.protocol === "ws:"
        ? "http:"
        : parsed.protocol;
  return `${protocol}//${parsed.host}`;
}

export function isPairingRequired(payload: SystemConnectedPayload): boolean {
  return payload.pairing_required ?? payload.requires_pairing ?? payload.auth_required ?? false;
}

export function canSendChat(
  sessionStatus: SessionStatus,
  connectionStatus: ConnectionStatus,
  sessionId = "",
): boolean {
  if (connectionStatus !== "connected") {
    return false;
  }
  if (sessionStatus === "loopback") {
    return true;
  }
  if (sessionStatus === "accepted") {
    return sessionId.trim().length > 0;
  }
  return false;
}

export function isTlsFatalError(code: string): boolean {
  return (
    code === "TLS_UNTRUSTED_CERTIFICATE" ||
    code === "CERTIFICATE_PIN_MISMATCH" ||
    code === "CERTIFICATE_EXPIRED"
  );
}

export interface PersonaAssetsRequestPayload {
  session_id: string;
}

export interface PersonaAssetsPayload {
  session_id: string;
  persona: string;
  icon_key: string;
  avatar_image_url: string;
  icon_url: string;
  asset_version: string;
  persona_prompt?: string;
}

export function normalizePersonaAssetsPayload(
  payload: unknown,
): PersonaAssetsPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const sessionId = record.session_id ?? record.sessionId;
  const persona = record.persona;
  const iconKey = record.icon_key ?? record.iconKey;
  const avatarImageUrl = record.avatar_image_url ?? record.avatarImageUrl;
  const iconUrl = record.icon_url ?? record.iconUrl;
  const assetVersion = record.asset_version ?? record.assetVersion;
  const personaPromptRaw = record.persona_prompt ?? record.personaPrompt;

  if (
    typeof sessionId !== "string" ||
    typeof persona !== "string" ||
    typeof iconKey !== "string" ||
    typeof avatarImageUrl !== "string" ||
    typeof iconUrl !== "string" ||
    typeof assetVersion !== "string"
  ) {
    return null;
  }

  const personaPrompt =
    typeof personaPromptRaw === "string" && personaPromptRaw.length > 0
      ? personaPromptRaw
      : undefined;

  return {
    session_id: sessionId,
    persona,
    icon_key: iconKey,
    avatar_image_url: avatarImageUrl,
    icon_url: iconUrl,
    asset_version: assetVersion,
    persona_prompt: personaPrompt,
  };
}

export function resolvePersonaAssetUrl(serverUrl: string, assetUrl: string): string {
  const trimmed = assetUrl.trim();
  if (!trimmed) {
    return "";
  }
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }
  try {
    const origin = getHttpOrigin(serverUrl);
    const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return `${origin}${path}`;
  } catch {
    return trimmed;
  }
}

export function hasAdvertisedRemoteDesktopCapture(
  capabilities: readonly string[],
): boolean {
  return capabilities.includes("remote.desktop.capture");
}

export function hasAdvertisedCapability(
  capabilities: readonly string[],
  capability: string,
): boolean {
  return capabilities.includes(capability);
}

export function hasAdvertisedAgentMetadata(capabilities: readonly string[]): boolean {
  return hasAdvertisedCapability(capabilities, AGODESK_AGENT_METADATA_CAPABILITY);
}

export function hasAdvertisedPlanUpdates(capabilities: readonly string[]): boolean {
  return hasAdvertisedCapability(capabilities, AGODESK_PLAN_UPDATES_CAPABILITY);
}

export function buildFileAccessSessionPayload(
  fileAccess: FileAccessSettings,
): FileAccessSessionPayload | undefined {
  if (!fileAccess.enabled) {
    return undefined;
  }

  const roots = fileAccess.roots
    .filter((root) => root.readEnabled || root.writeEnabled)
    .map((root) => ({
      root_id: root.rootId,
      label: root.label,
      path_display: root.pathDisplay,
      permissions: [
        ...(root.readEnabled ? (["read"] as const) : []),
        ...(root.writeEnabled ? (["write"] as const) : []),
      ],
    }));

  if (roots.length === 0) {
    return undefined;
  }

  return {
    enabled: true,
    max_read_bytes: fileAccess.maxReadBytes,
    max_write_bytes: fileAccess.maxWriteBytes,
    roots,
  };
}

export function agodeskClientCapabilities(
  desktopControlEnabled = true,
  fileAccess: FileAccessSettings = DEFAULT_FILE_ACCESS_SETTINGS,
  browserControlEnabled = false,
): string[] {
  const caps: string[] = [
    "chat.full_response",
    AGODESK_AGENT_METADATA_CAPABILITY,
    AGODESK_PLAN_UPDATES_CAPABILITY,
  ];

  if (desktopControlEnabled) {
    caps.push(...AGODESK_DESKTOP_CAPABILITIES);
  }

  if (desktopControlEnabled && browserControlEnabled) {
    caps.push(AGODESK_BROWSER_CAPABILITY);
  }

  const filePayload = buildFileAccessSessionPayload(fileAccess);
  if (filePayload) {
    const hasRead = filePayload.roots.some((root) => root.permissions.includes("read"));
    const hasWrite = filePayload.roots.some((root) => root.permissions.includes("write"));
    if (hasRead) {
      caps.push(AGODESK_FILE_READ_CAPABILITY);
    }
    if (hasWrite) {
      caps.push(AGODESK_FILE_WRITE_CAPABILITY);
    }
  }

  caps.push("persona.assets");
  return caps;
}
