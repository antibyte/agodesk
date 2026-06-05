import { writable } from "svelte/store";
import type { ChatMessage } from "../types/protocol";

export interface AppendStreamingChunkOptions {
  requestId: string;
  delta: string;
  done: boolean;
  timestamp: string;
}

export interface AppendStreamingChunkResult {
  messageId: string;
  created: boolean;
  completed: boolean;
  text: string;
}

function createChatStore() {
  const { subscribe, update, set } = writable<ChatMessage[]>([]);
  const seenIds = new Set<string>();
  const streamingByRequestId = new Map<string, string>();

  return {
    subscribe,
    addMessage(message: ChatMessage): void {
      if (seenIds.has(message.id)) {
        return;
      }
      seenIds.add(message.id);
      update((messages) => [...messages, message]);
    },
    appendStreamingChunk(
      options: AppendStreamingChunkOptions,
    ): AppendStreamingChunkResult {
      const messageId =
        streamingByRequestId.get(options.requestId) ??
        `stream-${options.requestId}`;
      let created = false;
      let finalText = options.delta;

      update((messages) => {
        const existing = messages.find((message) => message.id === messageId);
        if (!existing) {
          created = true;
          streamingByRequestId.set(options.requestId, messageId);
          seenIds.add(messageId);
          finalText = options.delta;
          return [
            ...messages,
            {
              id: messageId,
              role: "assistant",
              text: options.delta,
              timestamp: options.timestamp,
              requestId: options.requestId,
              streaming: !options.done,
            },
          ];
        }

        finalText = existing.text + options.delta;
        return messages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                text: finalText,
                streaming: !options.done,
                timestamp: options.done
                  ? options.timestamp
                  : message.timestamp,
              }
            : message,
        );
      });

      if (options.done) {
        streamingByRequestId.delete(options.requestId);
      }

      return {
        messageId,
        created,
        completed: options.done,
        text: finalText,
      };
    },
    finalizeStreamingResponse(
      requestId: string,
      text: string,
      timestamp: string,
      envelopeId: string,
    ): boolean {
      const existingId = streamingByRequestId.get(requestId);
      if (existingId) {
        streamingByRequestId.delete(requestId);
        update((messages) =>
          messages.map((message) =>
            message.id === existingId
              ? {
                  ...message,
                  text,
                  streaming: false,
                  timestamp,
                }
              : message,
          ),
        );
        return true;
      }

      if (seenIds.has(envelopeId)) {
        return true;
      }

      return false;
    },
    clearMessages(): void {
      seenIds.clear();
      streamingByRequestId.clear();
      set([]);
    },
  };
}

export const chatMessages = createChatStore();
