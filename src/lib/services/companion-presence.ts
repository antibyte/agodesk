import type { MessageKey } from "../i18n/types";
import type { ConnectionStatus, SessionStatus } from "../types/protocol";

export type CompanionPresenceTone = "ready" | "listening" | "thinking" | "blocked" | "error";

export interface CompanionPresenceInput {
  connectionStatus: ConnectionStatus;
  sessionStatus: SessionStatus;
  requestInFlight: boolean;
  speechActive: boolean;
  speechErrorMessage?: string;
}

export interface CompanionPresenceState {
  tone: CompanionPresenceTone;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
}

export function deriveCompanionPresence(input: CompanionPresenceInput): CompanionPresenceState {
  const speechError = input.speechErrorMessage?.trim();
  if (speechError || input.sessionStatus === "error" || input.connectionStatus === "error") {
    return {
      tone: "error",
      labelKey: "companionPresence.label.error",
      descriptionKey: "companionPresence.description.error",
    };
  }

  if (input.sessionStatus === "awaiting_pairing" || input.sessionStatus === "pairing") {
    return {
      tone: "blocked",
      labelKey: "companionPresence.label.pairing",
      descriptionKey: "companionPresence.description.pairing",
    };
  }

  if (input.requestInFlight) {
    return {
      tone: "thinking",
      labelKey: "companionPresence.label.thinking",
      descriptionKey: "companionPresence.description.thinking",
    };
  }

  if (input.speechActive) {
    return {
      tone: "listening",
      labelKey: "companionPresence.label.listening",
      descriptionKey: "companionPresence.description.listening",
    };
  }

  if (input.connectionStatus !== "connected") {
    return {
      tone: "blocked",
      labelKey: "companionPresence.label.offline",
      descriptionKey: "companionPresence.description.offline",
    };
  }

  return {
    tone: "ready",
    labelKey: "companionPresence.label.ready",
    descriptionKey: "companionPresence.description.ready",
  };
}
