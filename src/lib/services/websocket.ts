import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { ClientErrorCode, WsMessage } from "../types/protocol";
import {
  setConnected,
  setConnecting,
  setConnectionError,
  setDisconnected,
} from "../stores/connection";
import { prepareServerUrl } from "./server-url";
import { getPinnedFingerprint } from "./tls";
import { formatInvokeError } from "./errors";

export type MessageHandler = (message: WsMessage) => void;
export type ErrorHandler = (code: ClientErrorCode, message: string, origin?: string) => void;

export class NativeWebSocketService {
  private url = "";
  private messageHandler: MessageHandler | null = null;
  private errorHandler: ErrorHandler | null = null;
  private unlisteners: UnlistenFn[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  onError(handler: ErrorHandler): void {
    this.errorHandler = handler;
  }

  async connect(
    url: string,
    options?: { pinnedFingerprint?: string },
  ): Promise<void> {
    this.url = prepareServerUrl(url);
    await this.setupListeners();
    setConnecting();

    let pinnedFingerprint = options?.pinnedFingerprint ?? null;
    if (!pinnedFingerprint) {
      try {
        pinnedFingerprint = await getPinnedFingerprint(this.url);
      } catch {
        pinnedFingerprint = null;
      }
    }

    try {
      await invoke("agodesk_connect", {
        config: {
          serverUrl: this.url,
          ...(pinnedFingerprint ? { pinnedFingerprint } : {}),
        },
      });
    } catch (error) {
      setConnectionError();
      throw new Error(
        formatInvokeError(error, "Verbindung konnte nicht gestartet werden."),
      );
    }
  }

  async disconnect(): Promise<void> {
    this.clearPingTimer();
    await invoke("agodesk_disconnect");
    await this.teardownListeners();
    setDisconnected();
  }

  async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect(this.url);
  }

  async send(message: WsMessage): Promise<void> {
    await invoke("agodesk_send", {
      envelope: JSON.stringify(message),
    });
  }

  private async setupListeners(): Promise<void> {
    await this.teardownListeners();

    try {
      this.unlisteners.push(
        await listen<string>("agodesk:message", (event) => {
        try {
          const message = JSON.parse(event.payload) as WsMessage;
          this.messageHandler?.(message);
        } catch {
          // ignore invalid frames
        }
      }),
    );

    this.unlisteners.push(
      await listen<{ state: string }>("agodesk:connection-state", (event) => {
        switch (event.payload.state) {
          case "connecting":
            setConnecting();
            break;
          case "connected":
            setConnected();
            this.startPing();
            break;
          case "disconnected":
            this.clearPingTimer();
            setDisconnected();
            break;
          case "error":
            this.clearPingTimer();
            setConnectionError();
            break;
        }
      }),
    );

    this.unlisteners.push(
      await listen<{ code: ClientErrorCode; message: string; origin?: string }>(
        "agodesk:error",
        (event) => {
          this.clearPingTimer();
          setConnectionError();
          this.errorHandler?.(
            event.payload.code,
            event.payload.message,
            event.payload.origin,
          );
        },
      ),
    );
    } catch (error) {
      throw new Error(
        formatInvokeError(
          error,
          "Event-Listener konnten nicht registriert werden.",
        ),
      );
    }
  }

  private async teardownListeners(): Promise<void> {
    await Promise.all(this.unlisteners.map((unlisten) => unlisten()));
    this.unlisteners = [];
  }

  private startPing(): void {
    this.clearPingTimer();
    this.pingTimer = setInterval(() => {
      void this.send({
        id: crypto.randomUUID(),
        type: "system.ping",
        timestamp: new Date().toISOString(),
        payload: {},
      });
    }, 30000);
  }

  private clearPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

export function isSystemConnected(
  message: WsMessage,
): message is WsMessage<import("../types/protocol").SystemConnectedPayload> {
  return message.type === "system.connected";
}

export function isSessionAccepted(
  message: WsMessage,
): message is WsMessage<import("../types/protocol").SessionAcceptedPayload> {
  return message.type === "session.accepted";
}

export function isChatResponse(
  message: WsMessage,
): message is WsMessage<import("../types/protocol").ChatResponsePayload> {
  return message.type === "chat.response";
}

export function isChatResponseChunk(
  message: WsMessage,
): message is WsMessage<import("../types/protocol").ChatResponseChunkPayload> {
  return message.type === "chat.response.chunk";
}

export function isChatError(
  message: WsMessage,
): message is WsMessage<import("../types/protocol").ChatErrorPayload> {
  return message.type === "chat.error";
}

export function isDesktopCommand(
  message: WsMessage,
): message is WsMessage<import("../types/protocol").DesktopCommandPayload> {
  return message.type === "desktop.command";
}

export function isPersonaAssets(
  message: WsMessage,
): message is WsMessage<import("../types/protocol").PersonaAssetsPayload> {
  return message.type === "persona.assets";
}

export { NativeWebSocketService as WebSocketService };
