import { get } from "svelte/store";
import { chatConversationState } from "../stores/chat-conversation";
import { chatMediaState } from "../stores/chat-media-state";
import type { ChatMediaItem, ChatMediaPayload } from "../types/protocol";
import { normalizeChatMediaPayload } from "../types/protocol";

export function handleChatMediaMessage(
  payload: unknown,
  envelopeId?: string,
  envelopeTimestamp?: string,
): ChatMediaPayload | null {
  const normalized = normalizeChatMediaPayload(payload, envelopeId, envelopeTimestamp);
  if (!normalized) {
    return null;
  }

  const convo = get(chatConversationState);
  if (
    convo.stoppedRequestIds.includes(normalized.request_id ?? "") ||
    (normalized.request_id &&
      convo.requestInFlight &&
      convo.activeRequestId &&
      convo.activeRequestId !== normalized.request_id)
  ) {
    return normalized;
  }

  chatMediaState.appendMediaItem(normalized.conversation_id, normalized.item);
  return normalized;
}

export function mediaItemsForConversation(conversationId: string | null): ChatMediaItem[] {
  if (!conversationId) {
    return [];
  }
  return get(chatMediaState).mediaByConversation.get(conversationId) ?? [];
}

export function clearConversationMedia(conversationId: string): void {
  chatMediaState.clearConversationMedia(conversationId);
}
