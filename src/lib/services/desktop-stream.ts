import type {
  CaptureScreenshotParams,
  DesktopCommandContext,
  DesktopStreamFramePayload,
  DesktopStreamStartParams,
  DesktopStreamStartResult,
  DesktopStreamStopParams,
  DesktopStreamStopResult,
  WsMessage,
} from "../types/protocol";
import { captureScreen, normalizeCaptureResultForWire, type DesktopResultSender } from "./desktop";

const MIN_FPS = 1;
const MAX_FPS = 10;
const DEFAULT_FPS = 2;
const DEFAULT_QUALITY = 60;

interface ActiveDesktopStream {
  streamId: string;
  timer: ReturnType<typeof setInterval>;
  sequence: number;
  framesSent: number;
  capturing: boolean;
  wsSend: DesktopResultSender;
  context?: DesktopCommandContext;
  captureParams: CaptureScreenshotParams;
}

let activeStream: ActiveDesktopStream | null = null;

function clampFps(fps: number | undefined): number {
  const value = fps ?? DEFAULT_FPS;
  return Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(value)));
}

function buildStreamFrameMessage(
  payload: DesktopStreamFramePayload,
): WsMessage<DesktopStreamFramePayload> {
  return {
    id: crypto.randomUUID(),
    type: "desktop.stream.frame",
    timestamp: new Date().toISOString(),
    payload,
  };
}

async function captureAndSendFrame(stream: ActiveDesktopStream): Promise<void> {
  if (stream.capturing) {
    return;
  }
  stream.capturing = true;
  try {
    const capture = await captureScreen({
      display_id: stream.captureParams.display_id,
      window_id: stream.captureParams.window_id,
      format: stream.captureParams.format ?? "jpeg",
      quality: stream.captureParams.quality ?? DEFAULT_QUALITY,
    });
    const frame = normalizeCaptureResultForWire(capture);
    if (!frame.data_base64) {
      return;
    }

    stream.sequence += 1;
    stream.framesSent += 1;

    const payload: DesktopStreamFramePayload = {
      stream_id: stream.streamId,
      sequence: stream.sequence,
      timestamp: new Date().toISOString(),
      ...(stream.context?.sessionId ? { session_id: stream.context.sessionId } : {}),
      ...(stream.context?.deviceId ? { device_id: stream.context.deviceId } : {}),
      frame: {
        source: String(frame.source ?? "display"),
        display_id: typeof frame.display_id === "string" ? frame.display_id : null,
        window_id: typeof frame.window_id === "string" ? frame.window_id : null,
        format: String(frame.format ?? "jpeg"),
        width: typeof frame.width === "number" ? frame.width : 0,
        height: typeof frame.height === "number" ? frame.height : 0,
        scale_factor: typeof frame.scale_factor === "number" ? frame.scale_factor : 1,
        mime: String(frame.mime ?? "image/jpeg"),
        data_base64: String(frame.data_base64),
      },
    };

    await Promise.resolve(stream.wsSend(buildStreamFrameMessage(payload)));
  } catch {
    // Skip failed frames; the next tick retries.
  } finally {
    stream.capturing = false;
  }
}

export function isDesktopStreamActive(): boolean {
  return activeStream !== null;
}

export function getActiveDesktopStreamId(): string | null {
  return activeStream?.streamId ?? null;
}

export async function startDesktopStream(
  wsSend: DesktopResultSender,
  params: DesktopStreamStartParams = {},
  context?: DesktopCommandContext,
): Promise<DesktopStreamStartResult> {
  stopDesktopStream();

  const fps = clampFps(params.fps);
  const format = params.format === "png" ? "png" : "jpeg";
  const quality =
    typeof params.quality === "number"
      ? Math.min(90, Math.max(40, Math.round(params.quality)))
      : DEFAULT_QUALITY;
  const streamId = crypto.randomUUID();
  const captureParams: CaptureScreenshotParams = {
    display_id: params.display_id,
    window_id: params.window_id,
    format,
    quality,
  };

  const stream: ActiveDesktopStream = {
    streamId,
    timer: setInterval(
      () => {
        void captureAndSendFrame(stream);
      },
      Math.round(1000 / fps),
    ),
    sequence: 0,
    framesSent: 0,
    capturing: false,
    wsSend,
    context,
    captureParams,
  };

  activeStream = stream;
  await captureAndSendFrame(stream);

  return {
    stream_id: streamId,
    active: true,
    fps,
    format,
    display_id: params.display_id,
    window_id: params.window_id,
  };
}

export function stopDesktopStream(
  params: DesktopStreamStopParams = {},
): DesktopStreamStopResult | null {
  if (!activeStream) {
    return null;
  }

  const requestedId = params.stream_id;
  if (requestedId && requestedId !== activeStream.streamId) {
    return null;
  }

  clearInterval(activeStream.timer);
  const result: DesktopStreamStopResult = {
    stream_id: activeStream.streamId,
    active: false,
    frames_sent: activeStream.framesSent,
  };
  activeStream = null;
  return result;
}

export function resetDesktopStreamState(): void {
  stopDesktopStream();
}
