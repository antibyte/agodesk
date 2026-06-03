import { buildChatMessage, sendChatMessage } from "./chat-outbound";
import type { WsMessage } from "../types/protocol";

export interface SpeechDeliveryContext {
  autoSendToAuraGo: boolean;
  canSendChat: boolean;
  sessionId: string;
  sendMessage: (message: WsMessage) => Promise<void>;
  onComposerDraft: (text: string) => void;
  onSystemNotice: (text: string) => void;
  onPending: () => void;
}

export interface SpeechDeliveryResult {
  mode: "sent" | "composer" | "skipped";
}

export async function deliverSpeechTranscript(
  text: string,
  context: SpeechDeliveryContext,
): Promise<SpeechDeliveryResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { mode: "skipped" };
  }

  if (context.autoSendToAuraGo) {
    if (context.canSendChat) {
      await sendChatMessage(context.sendMessage, context.sessionId, trimmed, {
        source: "speech",
      });
      context.onPending();
      return { mode: "sent" };
    }

    context.onComposerDraft(trimmed);
    context.onSystemNotice(
      "Sprachtranskript in die Eingabe übernommen — Chat ist derzeit nicht verfügbar.",
    );
    return { mode: "composer" };
  }

  context.onComposerDraft(trimmed);
  context.onSystemNotice(`Sprache erkannt: „${trimmed}“`);
  return { mode: "composer" };
}

export { buildChatMessage };
