import { get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import type {
  ActiveWindowInfo,
  BrowserActionParams,
  BrowserConnectParams,
  BrowserSnapshotParams,
  CaptureScreenshotParams,
  CaptureScreenshotResult,
  ControlPermissionStatus,
  DesktopCommandContext,
  DesktopCommandPayload,
  DesktopErrorCode,
  DesktopInputEvent,
  DesktopInputParams,
  DesktopResultPayload,
  DisplayInfo,
  FileCommandParams,
  HostInfo,
  UiActionParams,
  UiTreeResult,
  WindowInfo,
  WsMessage,
} from "../types/protocol";
import type { DesktopStreamStartParams, DesktopStreamStopParams } from "../types/protocol";
import { settings } from "../stores/settings";
import {
  resetDesktopStreamState,
  startDesktopStream,
  stopDesktopStream,
} from "./desktop-stream";
import {
  listRemoteFiles,
  readRemoteFile,
  writeRemoteFile,
} from "./file-commands";
import { fileAccessIsConfigured } from "./file-access";

export type {
  ActiveWindowInfo,
  CaptureScreenshotParams,
  CaptureScreenshotResult,
  ControlPermissionStatus,
  DesktopInputEvent,
  DisplayInfo,
  HostInfo,
  UiTreeResult,
  WindowInfo,
};

export async function getActiveWindowInfo(): Promise<ActiveWindowInfo> {
  return invoke<ActiveWindowInfo>("get_active_window");
}

export async function getUiTree(windowId?: string): Promise<UiTreeResult> {
  return invoke<UiTreeResult>("get_ui_tree", {
    windowId: windowId ?? null,
  });
}

export async function runUiAction(params: UiActionParams): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>("perform_ui_action", { params });
}

export async function browserListTabs(): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>("browser_list_tabs");
}

export async function browserConnect(params: BrowserConnectParams = {}): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>("browser_connect", { params });
}

export async function browserSnapshot(
  params: BrowserSnapshotParams = {},
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>("browser_snapshot", { params });
}

export async function browserAction(params: BrowserActionParams): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>("browser_action", { params });
}

export async function browserDisconnect(): Promise<void> {
  await invoke("browser_disconnect");
}

export interface BrowserProbeResult {
  success: boolean;
  message: string;
  endpoint?: string;
  launched?: boolean;
}

export async function probeBrowserConnection(
  params: BrowserConnectParams = {},
): Promise<BrowserProbeResult> {
  try {
    const session = await browserConnect({
      port: params.port ?? 9222,
      auto_launch: params.auto_launch ?? true,
      endpoint: params.endpoint,
      url: params.url ?? "about:blank",
    });
    await browserDisconnect();
    const endpoint =
      typeof session.endpoint === "string" ? session.endpoint : undefined;
    return {
      success: true,
      message: endpoint ?? "",
      endpoint,
      launched: session.launched === true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const mapped = mapBrowserInvokeError(message);
    return {
      success: false,
      message: mapped.message,
    };
  }
}

export async function collectHostInfo(): Promise<HostInfo> {
  return invoke<HostInfo>("collect_host_info");
}

export async function listDisplays(): Promise<DisplayInfo[]> {
  return invoke<DisplayInfo[]>("list_displays");
}

export async function listWindows(): Promise<WindowInfo[]> {
  return invoke<WindowInfo[]>("list_windows");
}

export async function listWindowsOnDisplay(displayId: string): Promise<WindowInfo[]> {
  const windows = await listWindows();
  return windows.filter((window) => window.display_id === displayId);
}

export async function captureScreen(
  options: CaptureScreenshotParams = {},
): Promise<CaptureScreenshotResult> {
  return invoke<CaptureScreenshotResult>("capture_screen", {
    options: {
      displayId: options.display_id,
      windowId: options.window_id,
      format: options.format,
      quality: options.quality,
    },
  });
}

export async function captureDisplay(
  displayId?: string,
  format: "png" | "jpeg" = "png",
  quality = 80,
): Promise<CaptureScreenshotResult> {
  return captureScreen({
    display_id: displayId,
    format,
    quality,
  });
}

export async function captureWindow(
  windowId: string,
  format: "png" | "jpeg" = "png",
  quality = 80,
): Promise<CaptureScreenshotResult> {
  return captureScreen({
    window_id: windowId,
    format,
    quality,
  });
}

export async function controlPermissionStatus(): Promise<ControlPermissionStatus> {
  return invoke<ControlPermissionStatus>("control_permission_status");
}

export async function setInputApproval(approved: boolean): Promise<void> {
  await invoke("set_input_approval", { approved });
}

export async function resetDesktopSession(): Promise<void> {
  resetDesktopStreamState();
  await invoke("reset_desktop_session");
}

export async function injectInput(event: DesktopInputEvent): Promise<void> {
  await invoke("inject_input", { event });
}

export async function moveMouse(
  x: number,
  y: number,
  absolute = true,
): Promise<void> {
  await injectInput({
    kind: "mouse_move",
    payload: { x, y, absolute },
  });
}

export async function clickMouse(
  x: number,
  y: number,
  button: "left" | "right" | "middle" = "left",
  action: "click" | "down" | "up" = "click",
): Promise<void> {
  await injectInput({
    kind: "mouse_click",
    payload: { x, y, button, action },
  });
}

export async function pressKey(
  key: string,
  action: "down" | "up" = "down",
): Promise<void> {
  await injectInput({
    kind: action === "up" ? "key_up" : "key_down",
    payload: { key },
  });
}

export async function typeText(text: string): Promise<void> {
  await injectInput({
    kind: "text",
    payload: { text },
  });
}

export function screenshotDataUrl(result: CaptureScreenshotResult): string {
  return `data:${result.mime};base64,${result.data_base64}`;
}

export interface ExecuteDesktopCommandOptions {
  context?: DesktopCommandContext;
  forcedError?: {
    code: DesktopErrorCode;
    message: string;
  };
}

export type DesktopResultSender = (message: WsMessage) => void | Promise<void>;

function enrichDesktopResult(
  payload: DesktopResultPayload,
  context?: DesktopCommandContext,
): DesktopResultPayload {
  if (!context?.sessionId && !context?.deviceId) {
    return payload;
  }
  return {
    ...payload,
    ...(context.sessionId ? { session_id: context.sessionId } : {}),
    ...(context.deviceId ? { device_id: context.deviceId } : {}),
  };
}

async function sendDesktopResult(
  wsSend: DesktopResultSender,
  payload: DesktopResultPayload,
  context?: DesktopCommandContext,
): Promise<void> {
  await Promise.resolve(
    wsSend(buildDesktopResultMessage(enrichDesktopResult(payload, context))),
  );
}

function desktopFailure(
  result: DesktopResultPayload,
  code: DesktopErrorCode,
  message: string,
): DesktopResultPayload {
  result.success = false;
  result.status = "error";
  result.error_code = code;
  result.error = message;
  result.data = null;
  return result;
}

const BROWSER_ERROR_CODES: DesktopErrorCode[] = [
  "DESKTOP_BROWSER_UNAVAILABLE",
  "DESKTOP_ELEMENT_NOT_FOUND",
  "DESKTOP_INPUT_NOT_APPROVED",
];

function mapBrowserInvokeError(message: string): {
  code: DesktopErrorCode;
  message: string;
} {
  for (const code of BROWSER_ERROR_CODES) {
    if (message.startsWith(code)) {
      const detail = message.slice(code.length).replace(/^:\s*/, "");
      return { code, message: detail || message };
    }
  }
  return { code: "DESKTOP_BROWSER_UNAVAILABLE", message };
}

export function normalizeCaptureResultForWire(
  capture: CaptureScreenshotResult | Record<string, unknown>,
): Record<string, unknown> {
  const raw = capture as Record<string, unknown>;
  const dataBase64 =
    (typeof raw.data_base64 === "string" && raw.data_base64) ||
    (typeof raw.dataBase64 === "string" && raw.dataBase64) ||
    "";

  return {
    source: typeof raw.source === "string" ? raw.source : "display",
    display_id:
      typeof raw.display_id === "string"
        ? raw.display_id
        : typeof raw.displayId === "string"
          ? raw.displayId
          : null,
    window_id:
      typeof raw.window_id === "string"
        ? raw.window_id
        : typeof raw.windowId === "string"
          ? raw.windowId
          : null,
    format: typeof raw.format === "string" ? raw.format : "jpeg",
    width: typeof raw.width === "number" ? raw.width : 0,
    height: typeof raw.height === "number" ? raw.height : 0,
    scale_factor:
      typeof raw.scale_factor === "number"
        ? raw.scale_factor
        : typeof raw.scaleFactor === "number"
          ? raw.scaleFactor
          : 1,
    mime: typeof raw.mime === "string" ? raw.mime : "image/jpeg",
    data_base64: dataBase64,
  };
}

function finalizeDesktopResult(payload: DesktopResultPayload): DesktopResultPayload {
  if (payload.success) {
    return {
      ...payload,
      status: "ok",
      error: null,
      error_code: null,
    };
  }

  return {
    ...payload,
    status: "error",
    data: payload.data ?? null,
    error: payload.error ?? "Desktop command failed.",
    error_code: payload.error_code ?? "DESKTOP_OPERATION_UNSUPPORTED",
  };
}

export async function executeDesktopCommand(
  wsSend: DesktopResultSender,
  command: DesktopCommandPayload,
  options: ExecuteDesktopCommandOptions = {},
): Promise<void> {
  const result: DesktopResultPayload = {
    command_id: command.command_id,
    success: false,
  };
  const context = options.context;

  if (options.forcedError) {
    desktopFailure(result, options.forcedError.code, options.forcedError.message);
    await sendDesktopResult(wsSend, result, context);
    return;
  }

  try {
    const params = (command.params ?? {}) as DesktopInputParams &
      CaptureScreenshotParams &
      DesktopStreamStartParams &
      DesktopStreamStopParams &
      Record<string, unknown>;

    switch (command.operation) {
      case "desktop_screenshot": {
        const status = await controlPermissionStatus();
        if (!status.screen_capture) {
          desktopFailure(
            result,
            "DESKTOP_OPERATION_UNSUPPORTED",
            "Screenshot-Capture ist auf diesem System nicht verfügbar.",
          );
          break;
        }
        const capture = await captureScreen({
          display_id: params.display_id,
          window_id: params.window_id,
          format: params.format ?? "jpeg",
          quality: params.quality ?? 75,
        });
        const screenshotData = normalizeCaptureResultForWire(capture);
        if (!screenshotData.data_base64) {
          desktopFailure(
            result,
            "DESKTOP_OPERATION_UNSUPPORTED",
            "Screenshot-Capture lieferte keine Bilddaten.",
          );
          break;
        }
        result.success = true;
        result.data = screenshotData;
        break;
      }
      case "desktop_stream_start": {
        const status = await controlPermissionStatus();
        if (!status.screen_capture) {
          desktopFailure(
            result,
            "DESKTOP_OPERATION_UNSUPPORTED",
            "Screen-Capture ist auf diesem System nicht verfügbar.",
          );
          break;
        }
        const stream = await startDesktopStream(
          wsSend,
          {
            display_id: params.display_id,
            window_id: params.window_id,
            format: params.format === "png" ? "png" : "jpeg",
            quality: params.quality,
            fps: params.fps,
          },
          context,
        );
        result.success = true;
        result.data = stream as unknown as Record<string, unknown>;
        break;
      }
      case "desktop_stream_stop": {
        const stopped = stopDesktopStream({
          stream_id:
            typeof params.stream_id === "string" ? params.stream_id : undefined,
        });
        if (!stopped) {
          desktopFailure(
            result,
            "DESKTOP_STREAM_NOT_ACTIVE",
            params.stream_id
              ? "Kein aktiver Desktop-Stream mit dieser stream_id."
              : "Kein aktiver Desktop-Stream.",
          );
          break;
        }
        result.success = true;
        result.data = stopped as unknown as Record<string, unknown>;
        break;
      }
      case "desktop_permission_request": {
        const status = await controlPermissionStatus();
        result.success = true;
        result.data = status as unknown as Record<string, unknown>;
        break;
      }
      case "desktop_input": {
        const status = await controlPermissionStatus();
        if (!status.input_injection) {
          desktopFailure(
            result,
            "DESKTOP_OPERATION_UNSUPPORTED",
            "Input-Injektion ist auf diesem System nicht verfügbar.",
          );
          break;
        }
        if (!status.approved_session) {
          desktopFailure(
            result,
            "DESKTOP_INPUT_NOT_APPROVED",
            "Input-Injektion ist lokal noch nicht freigegeben.",
          );
          break;
        }
        await injectInput({
          kind: String(params.kind ?? "unknown"),
          payload: params,
        });
        result.success = true;
        break;
      }
      case "desktop_list_displays": {
        const displays = await listDisplays();
        result.success = true;
        result.data = { displays: displays as unknown as Record<string, unknown>[] };
        break;
      }
      case "desktop_list_windows": {
        const windows = await listWindows();
        result.success = true;
        result.data = { windows: windows as unknown as Record<string, unknown>[] };
        break;
      }
      case "desktop_active_window": {
        const active = await getActiveWindowInfo();
        result.success = true;
        result.data = active as unknown as Record<string, unknown>;
        break;
      }
      case "desktop_host_info": {
        const host = await collectHostInfo();
        result.success = true;
        result.data = host as unknown as Record<string, unknown>;
        break;
      }
      case "desktop_ui_tree": {
        const status = await controlPermissionStatus();
        if (status.ui_automation === false) {
          desktopFailure(
            result,
            "DESKTOP_UI_UNAVAILABLE",
            "UI-Automation ist auf diesem System nicht verfügbar.",
          );
          break;
        }
        const tree = await getUiTree(
          typeof params.window_id === "string" ? params.window_id : undefined,
        );
        result.success = true;
        result.data = tree as unknown as Record<string, unknown>;
        break;
      }
      case "desktop_ui_action": {
        const status = await controlPermissionStatus();
        if (!status.input_injection) {
          desktopFailure(
            result,
            "DESKTOP_OPERATION_UNSUPPORTED",
            "UI-Aktionen sind auf diesem System nicht verfügbar.",
          );
          break;
        }
        if (!status.approved_session) {
          desktopFailure(
            result,
            "DESKTOP_INPUT_NOT_APPROVED",
            "UI-Aktionen sind lokal noch nicht freigegeben.",
          );
          break;
        }
        const actionResult = await runUiAction({
          action: String(params.action ?? "click"),
          element_id: String(params.element_id ?? ""),
          value: typeof params.value === "string" ? params.value : undefined,
          window_id:
            typeof params.window_id === "string" ? params.window_id : undefined,
        });
        result.success = true;
        result.data = actionResult;
        break;
      }
      case "desktop_browser_list_tabs": {
        try {
          const tabs = await browserListTabs();
          result.success = true;
          result.data = tabs;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const mapped = mapBrowserInvokeError(message);
          desktopFailure(result, mapped.code, mapped.message);
        }
        break;
      }
      case "desktop_browser_connect": {
        try {
          const session = await browserConnect({
            endpoint:
              typeof params.endpoint === "string" ? params.endpoint : undefined,
            port: typeof params.port === "number" ? params.port : undefined,
            auto_launch:
              typeof params.auto_launch === "boolean"
                ? params.auto_launch
                : typeof params.autoLaunch === "boolean"
                  ? params.autoLaunch
                  : undefined,
            url: typeof params.url === "string" ? params.url : undefined,
          });
          result.success = true;
          result.data = session;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const mapped = mapBrowserInvokeError(message);
          desktopFailure(result, mapped.code, mapped.message);
        }
        break;
      }
      case "desktop_browser_snapshot": {
        try {
          const snapshot = await browserSnapshot({
            selector: typeof params.selector === "string" ? params.selector : undefined,
            include_html:
              params.include_html === true || params.includeHtml === true,
            include_screenshot:
              params.include_screenshot === true ||
              params.includeScreenshot === true,
            screenshot_format:
              params.screenshot_format === "png" ||
              params.screenshot_format === "webp" ||
              params.screenshot_format === "jpeg"
                ? params.screenshot_format
                : params.screenshotFormat === "png" ||
                    params.screenshotFormat === "webp" ||
                    params.screenshotFormat === "jpeg"
                  ? params.screenshotFormat
                  : undefined,
            quality: typeof params.quality === "number" ? params.quality : undefined,
            full_page: params.full_page === true || params.fullPage === true,
            tab_id:
              typeof params.tab_id === "string"
                ? params.tab_id
                : typeof params.tabId === "string"
                  ? params.tabId
                  : undefined,
          });
          result.success = true;
          result.data = snapshot;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const mapped = mapBrowserInvokeError(message);
          desktopFailure(result, mapped.code, mapped.message);
        }
        break;
      }
      case "desktop_browser_action": {
        const action = String(params.action ?? "click");
        const tabOnly =
          action === "select_tab" ||
          action === "new_tab" ||
          action === "close_tab";
        if (!tabOnly) {
          const status = await controlPermissionStatus();
          if (!status.input_injection) {
            desktopFailure(
              result,
              "DESKTOP_OPERATION_UNSUPPORTED",
              "Browser-Aktionen sind auf diesem System nicht verfügbar.",
            );
            break;
          }
          if (!status.approved_session) {
            desktopFailure(
              result,
              "DESKTOP_INPUT_NOT_APPROVED",
              "Browser-Aktionen sind lokal noch nicht freigegeben.",
            );
            break;
          }
        }
        try {
          const browserResult = await browserAction({
            action: String(params.action ?? "click"),
            selector:
              typeof params.selector === "string" ? params.selector : undefined,
            tab_id:
              typeof params.tab_id === "string"
                ? params.tab_id
                : typeof params.tabId === "string"
                  ? params.tabId
                  : undefined,
            value: typeof params.value === "string" ? params.value : undefined,
          });
          result.success = true;
          result.data = browserResult;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const mapped = mapBrowserInvokeError(message);
          desktopFailure(result, mapped.code, mapped.message);
        }
        break;
      }
      case "desktop_browser_disconnect": {
        try {
          await browserDisconnect();
          result.success = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const mapped = mapBrowserInvokeError(message);
          desktopFailure(result, mapped.code, mapped.message);
        }
        break;
      }
      case "file_list":
      case "file_read":
      case "file_write": {
        const fileSettings = get(settings).fileAccess;
        const fileParams = params as unknown as FileCommandParams;
        if (!fileAccessIsConfigured(fileSettings)) {
          desktopFailure(
            result,
            "FILE_ACCESS_DISABLED",
            "Dateizugriff ist in den agodesk-Einstellungen deaktiviert.",
          );
          break;
        }
        try {
          if (command.operation === "file_list") {
            const listed = await listRemoteFiles(
              fileSettings,
              command.command_id,
              fileParams.root_id,
              fileParams.path,
              fileParams.recursive === true,
            );
            result.success = true;
            result.data = listed as unknown as Record<string, unknown>;
          } else if (command.operation === "file_read") {
            const read = await readRemoteFile(
              fileSettings,
              command.command_id,
              fileParams.root_id,
              fileParams.path,
              fileSettings.maxReadBytes,
            );
            result.success = true;
            result.data = read as unknown as Record<string, unknown>;
          } else {
            const content = fileParams.content ?? "";
            const written = await writeRemoteFile(
              fileSettings,
              command.command_id,
              fileParams.root_id,
              fileParams.path,
              content,
              fileSettings.maxWriteBytes,
              fileParams.expected_hash,
              fileParams.create_only === true,
            );
            result.success = true;
            result.data = written as unknown as Record<string, unknown>;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const code = message as DesktopErrorCode;
          desktopFailure(
            result,
            [
              "FILE_ROOT_UNKNOWN",
              "FILE_PATH_DENIED",
              "FILE_NOT_FOUND",
              "FILE_TOO_LARGE",
              "FILE_WRITE_DENIED",
              "FILE_HASH_MISMATCH",
            ].includes(code)
              ? code
              : "DESKTOP_OPERATION_UNSUPPORTED",
            message,
          );
        }
        break;
      }
      default:
        desktopFailure(
          result,
          "DESKTOP_OPERATION_UNSUPPORTED",
          `Unbekannte Desktop-Operation: ${command.operation}`,
        );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Desktop command failed.";
    result.error = message;
    if (!result.error_code) {
      result.error_code = "DESKTOP_OPERATION_UNSUPPORTED";
    }
  }

  await sendDesktopResult(wsSend, finalizeDesktopResult(result), context);
}

function buildDesktopResultMessage(
  payload: DesktopResultPayload,
): WsMessage<DesktopResultPayload> {
  return {
    id: crypto.randomUUID(),
    type: "desktop.result",
    timestamp: new Date().toISOString(),
    payload,
  };
}
