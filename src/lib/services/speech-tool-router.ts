import type { ConnectionStatus, SessionStatus } from "../types/protocol";
import type { GeminiFunctionCall, GeminiFunctionResponse } from "./speech-tools";

export interface SpeechToolContext {
  sessionId: string;
  connectionStatus: ConnectionStatus;
  sessionStatus: SessionStatus;
  remoteControlActive: boolean;
  remoteControlPending: boolean;
  canSendChat: boolean;
  desktopControlEnabled?: boolean;
  browserControlEnabled?: boolean;
  getDesktopPermissionStatus?: () => Promise<Record<string, unknown>>;
  sendToAuraGo: (message: string) => Promise<void>;
  onStopListening: () => void | Promise<void>;
  onSystemNotice: (text: string) => void;
}

export async function executeSpeechTool(
  call: GeminiFunctionCall,
  context: SpeechToolContext,
): Promise<Record<string, unknown>> {
  switch (call.name) {
    case "send_message_to_aurago": {
      const message = String(call.args.message ?? "").trim();
      if (!message) {
        return { success: false, error: "message ist erforderlich." };
      }

      if (!context.canSendChat) {
        context.onSystemNotice(`AuraGo nicht erreichbar — Befehl nicht gesendet: ${message}`);
        return {
          success: false,
          error: "Chat ist derzeit nicht verfügbar.",
          message,
        };
      }

      try {
        await context.sendToAuraGo(message);
        context.onSystemNotice(`Sprachbefehl an AuraGo gesendet.`);
        return { success: true, sent: true, message };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Senden fehlgeschlagen.";
        return { success: false, error: errorMessage, message };
      }
    }

    case "get_client_status": {
      const status: Record<string, unknown> = {
        success: true,
        connectionStatus: context.connectionStatus,
        sessionStatus: context.sessionStatus,
        sessionId: context.sessionId || null,
        remoteControlActive: context.remoteControlActive,
        remoteControlPending: context.remoteControlPending,
        canSendChat: context.canSendChat,
        desktopControlEnabled: context.desktopControlEnabled ?? null,
        browserControlEnabled: context.browserControlEnabled ?? null,
      };
      if (context.getDesktopPermissionStatus) {
        try {
          status.desktopPermissions = await context.getDesktopPermissionStatus();
        } catch (error) {
          status.desktopPermissionError = error instanceof Error ? error.message : String(error);
        }
      }
      return status;
    }

    case "stop_listening": {
      void Promise.resolve(context.onStopListening());
      return { success: true, stopped: true };
    }

    default:
      return {
        success: false,
        error: `Unbekanntes Tool: ${call.name}`,
      };
  }
}

export async function executeSpeechToolCalls(
  calls: GeminiFunctionCall[],
  context: SpeechToolContext,
): Promise<GeminiFunctionResponse[]> {
  const responses: GeminiFunctionResponse[] = [];

  for (const call of calls) {
    const response = await executeSpeechTool(call, context);
    responses.push({
      id: call.id,
      name: call.name,
      response,
    });
  }

  return responses;
}
