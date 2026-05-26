import { invoke } from "@tauri-apps/api/core";
import type {
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
  HostInfo,
  WindowInfo,
  WsMessage,
} from "../types/protocol";
import { DESKTOP_STREAM_OPERATIONS } from "../types/protocol";

export type {
  CaptureScreenshotParams,
  CaptureScreenshotResult,
  ControlPermissionStatus,
  DesktopInputEvent,
  DisplayInfo,
  HostInfo,
  WindowInfo,
};

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
  return invoke<CaptureScreenshotResult>("capture_screen", { options });
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

export type DesktopResultSender = (
  message: WsMessage<DesktopResultPayload>,
) => void | Promise<void>;

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
  result.error_code = code;
  result.error = message;
  return result;
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
    if (DESKTOP_STREAM_OPERATIONS.includes(command.operation)) {
      desktopFailure(
        result,
        "DESKTOP_STREAM_UNSUPPORTED",
        "Desktop-Streaming ist in agodesk v1 nicht implementiert.",
      );
      await sendDesktopResult(wsSend, result, context);
      return;
    }

    const params = (command.params ?? {}) as DesktopInputParams &
      CaptureScreenshotParams &
      Record<string, unknown>;

    switch (command.operation) {
      case "desktop_screenshot": {
        const status = await controlPermissionStatus();
        if (!status.approved_session) {
          desktopFailure(
            result,
            "DESKTOP_SESSION_NOT_APPROVED",
            "Bitte Remote Control im agodesk-Banner freigeben.",
          );
          break;
        }
        const capture = await captureScreen({
          display_id: params.display_id,
          window_id: params.window_id,
          format: params.format ?? "jpeg",
          quality: params.quality ?? 75,
        });
        result.success = true;
        result.data = capture as unknown as Record<string, unknown>;
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
        if (!status.approved_session || !status.input_injection) {
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
      default:
        desktopFailure(
          result,
          "DESKTOP_OPERATION_UNSUPPORTED",
          `Unbekannte Desktop-Operation: ${command.operation}`,
        );
    }
  } catch (error) {
    result.error =
      error instanceof Error ? error.message : "Desktop command failed.";
  }

  await sendDesktopResult(wsSend, result, context);
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
