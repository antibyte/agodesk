import { chatMessages, type AppendStreamingChunkResult } from "../stores/chat";
import {
  normalizeChatResponseChunkPayload,
  type ChatResponseChunkPayload,
} from "../types/protocol";

export function handleChatResponseChunk(
  payload: unknown,
  timestamp: string,
): AppendStreamingChunkResult | null {
  const normalized = normalizeChatResponseChunkPayload(payload);
  if (!normalized) {
    return null;
  }

  return applyChatResponseChunk(normalized, timestamp);
}

export function applyChatResponseChunk(
  chunk: ChatResponseChunkPayload,
  timestamp: string,
): AppendStreamingChunkResult {
  return chatMessages.appendStreamingChunk({
    requestId: chunk.request_id,
    delta: chunk.delta,
    done: chunk.done,
    timestamp,
  });
}
