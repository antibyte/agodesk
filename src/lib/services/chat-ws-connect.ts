import { sessionState } from "../stores/session";
import { clearPersonaAssets } from "./persona-flow";
import {
  clearRemoteControlState,
  resetDesktopCommandState,
} from "./desktop-flow";
import { resetDesktopSession } from "./desktop";
import { stopSpeechSession } from "./speech-flow";
import { chatPlanState } from "../stores/chat-plan";
import { agentMoodState } from "../stores/agent-mood";
import { resetChatConversationRuntimeState } from "./chat-conversation-flow";
import {
  WebSocketService,
  type ErrorHandler,
} from "./websocket";
import type { ClientErrorCode, WsMessage } from "../types/protocol";
import { isTlsFatalError } from "../types/protocol";

export interface ChatConnectOptions {
  url: string;
  pinnedFingerprint?: string;
  onMessage: (message: WsMessage) => void | Promise<void>;
  onTlsError: (code: ClientErrorCode) => void;
  onConnectionError: (message: string) => void;
}

export async function resetChatSessionState(): Promise<void> {
  await stopSpeechSession().catch(() => {});
  await resetDesktopSession().catch(() => {});
  resetDesktopCommandState();
  clearRemoteControlState();
  clearPersonaAssets();
  sessionState.reset();
  chatPlanState.reset();
  agentMoodState.reset();
  resetChatConversationRuntimeState();
}

export async function connectChatWebSocket(
  wsService: WebSocketService,
  options: ChatConnectOptions,
): Promise<void> {
  await wsService.disconnect().catch(() => {});
  await resetChatSessionState();

  wsService.onMessage((message) => {
    void options.onMessage(message);
  });

  const onError: ErrorHandler = (code, message) => {
    if (isTlsFatalError(code)) {
      options.onTlsError(code);
      return;
    }
    options.onConnectionError(message);
  };
  wsService.onError(onError);

  await wsService.connect(options.url, {
    pinnedFingerprint: options.pinnedFingerprint,
  });
}

export function createWebSocketService(): WebSocketService {
  return new WebSocketService();
}
