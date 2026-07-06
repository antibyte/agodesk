import { get } from "svelte/store";
import { chatConversationState } from "../stores/chat-conversation";
import { connectionStatus } from "../stores/connection";
import { sessionState } from "../stores/session";
import { speechState } from "../stores/speech";
import type { ConnectionStatus, SessionStatus } from "../types/protocol";
import type { SpeechState } from "../types/speech";

/** Global visual companion state driving Aurora accents across the shell. */
export type CompanionState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error"
  | "disconnected";

export interface CompanionStateInput {
  connectionStatus: ConnectionStatus;
  sessionStatus: SessionStatus;
  requestInFlight: boolean;
  speech: Pick<SpeechState, "status" | "isActive" | "errorMessage">;
}

export function deriveCompanionState(input: CompanionStateInput): CompanionState {
  const speechError = input.speech.errorMessage?.trim();
  if (
    speechError ||
    input.speech.status === "error" ||
    input.sessionStatus === "error" ||
    input.connectionStatus === "error"
  ) {
    return "error";
  }

  if (input.connectionStatus === "disconnected" || input.connectionStatus === "connecting") {
    return "disconnected";
  }

  if (input.requestInFlight) {
    return "thinking";
  }

  if (input.speech.status === "speaking") {
    return "speaking";
  }

  if (
    input.speech.isActive ||
    input.speech.status === "listening" ||
    input.speech.status === "processing"
  ) {
    return "listening";
  }

  return "idle";
}

const COMPANION_STATE_ATTR = "data-companion-state";

export function applyCompanionState(state: CompanionState): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.setAttribute(COMPANION_STATE_ATTR, state);
}

export function readCompanionStateFromDom(): CompanionState | null {
  if (typeof document === "undefined") {
    return null;
  }
  const value = document.documentElement.getAttribute(COMPANION_STATE_ATTR);
  if (
    value === "idle" ||
    value === "listening" ||
    value === "thinking" ||
    value === "speaking" ||
    value === "error" ||
    value === "disconnected"
  ) {
    return value;
  }
  return null;
}

/** Subscribe to stores and mirror companion state on `<html>`. */
export function initCompanionStateSync(): () => void {
  const unsubscribeConnection = connectionStatus.subscribe((conn) => {
    syncCompanionState(conn, get(sessionState).status, get(chatConversationState), get(speechState));
  });
  const unsubscribeSession = sessionState.subscribe((session) => {
    syncCompanionState(get(connectionStatus), session.status, get(chatConversationState), get(speechState));
  });
  const unsubscribeChat = chatConversationState.subscribe((chat) => {
    syncCompanionState(get(connectionStatus), get(sessionState).status, chat, get(speechState));
  });
  const unsubscribeSpeech = speechState.subscribe((speech) => {
    syncCompanionState(
      get(connectionStatus),
      get(sessionState).status,
      get(chatConversationState),
      speech,
    );
  });

  syncCompanionState(
    get(connectionStatus),
    get(sessionState).status,
    get(chatConversationState),
    get(speechState),
  );

  return () => {
    unsubscribeConnection();
    unsubscribeSession();
    unsubscribeChat();
    unsubscribeSpeech();
  };
}

function syncCompanionState(
  conn: ConnectionStatus,
  session: SessionStatus,
  chat: { requestInFlight: boolean },
  speech: SpeechState,
): void {
  applyCompanionState(
    deriveCompanionState({
      connectionStatus: conn,
      sessionStatus: session,
      requestInFlight: chat.requestInFlight,
      speech,
    }),
  );
}
