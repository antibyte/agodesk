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
  | "desktop.result";

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

export interface ChatResponsePayload {
  session_id: string;
  request_id: string;
  text: string;
  role: "assistant";
  metadata?: Record<string, unknown>;
}

export interface ChatResponseChunkPayload {
  session_id: string;
  request_id: string;
  delta: string;
  done: boolean;
}

export interface ChatErrorPayload {
  request_id?: string;
  code: string;
  message: string;
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
}

export interface HostInfo {
  hostname: string;
  platform: string;
  arch: string;
}

export type DesktopInputKind =
  | "mouse_move"
  | "mouse_click"
  | "key_down"
  | "key_up"
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

export interface DesktopInputParams {
  kind: DesktopInputKind | string;
  x?: number;
  y?: number;
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
  | "file_list"
  | "file_read"
  | "file_write";

export const FILE_OPERATIONS = ["file_list", "file_read", "file_write"] as const;

export type FileOperation = (typeof FILE_OPERATIONS)[number];

export const DESKTOP_V1_OPERATIONS: DesktopOperation[] = [
  "desktop_screenshot",
  "desktop_permission_request",
  "desktop_input",
];

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
  | "DESKTOP_OPERATION_UNSUPPORTED"
  | "DESKTOP_COMMAND_INVALID"
  | "DESKTOP_CONTROL_DISABLED"
  | "FILE_ACCESS_DISABLED"
  | "FILE_ROOT_UNKNOWN"
  | "FILE_PATH_DENIED"
  | "FILE_NOT_FOUND"
  | "FILE_TOO_LARGE"
  | "FILE_WRITE_DENIED"
  | "FILE_HASH_MISMATCH";

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
    | DesktopInputParams
    | FileCommandParams
    | Record<string, unknown>;
}

export interface DesktopResultPayload {
  command_id: string;
  success: boolean;
  session_id?: string;
  device_id?: string;
  data?: Record<string, unknown>;
  error?: string;
  error_code?: DesktopErrorCode;
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
  } else if (operation === "desktop_input") {
    params = normalizeDesktopInputParams(paramsRecord);
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
  return operation === "desktop_input";
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

export function requiresLocalDesktopApproval(operation: string): boolean {
  return operation === "desktop_screenshot" || operation === "desktop_input";
}

export function requiresRemoteControlBanner(operation: string): boolean {
  return (
    requiresLocalDesktopApproval(operation) ||
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

export interface SpeechSettings {
  enabled: boolean;
  modelId: string;
  language: string;
  autoSendToAuraGo: boolean;
  agentMode: boolean;
  voiceResponses: boolean;
  voiceName: string;
}

export const DEFAULT_SPEECH_SETTINGS: SpeechSettings = {
  enabled: true,
  modelId: "gemini-2.5-flash-native-audio-preview-12-2025",
  language: "de-DE",
  autoSendToAuraGo: false,
  agentMode: false,
  voiceResponses: true,
  voiceName: "Zephyr",
};

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
  fileAccess: { ...DEFAULT_FILE_ACCESS_SETTINGS },
};

export const PROTOCOL_VERSION = "agodesk.v1";

export const AGODESK_CLIENT_VERSION = "0.1.0";

export const AGODESK_BASE_CAPABILITIES = [
  "chat.full_response",
  "persona.assets",
] as const;

export const AGODESK_DESKTOP_CAPABILITIES = [
  "remote.desktop.capture",
  "remote.desktop.permission_request",
  "remote.desktop.input",
] as const;

/** Capabilities advertised to AuraGo when desktop control is fully enabled. */
export const AGODESK_CLIENT_CAPABILITIES = [
  "chat.full_response",
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
  if (!assetUrl.trim()) {
    return "";
  }
  if (assetUrl.startsWith("http://") || assetUrl.startsWith("https://")) {
    return assetUrl;
  }
  try {
    const origin = getWsOrigin(serverUrl);
    const path = assetUrl.startsWith("/") ? assetUrl : `/${assetUrl}`;
    return `${origin}${path}`;
  } catch {
    return assetUrl;
  }
}

export function hasAdvertisedRemoteDesktopCapture(
  capabilities: readonly string[],
): boolean {
  return capabilities.includes("remote.desktop.capture");
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
): string[] {
  const caps: string[] = ["chat.full_response"];

  if (desktopControlEnabled) {
    caps.push(...AGODESK_DESKTOP_CAPABILITIES);
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
