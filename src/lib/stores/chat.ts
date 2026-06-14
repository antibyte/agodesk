import { writable } from "svelte/store";
import type { ChatMediaKind, ChatMessage } from "../types/protocol";

/** Maximum chat messages kept in memory (older entries are dropped). */
export const MAX_CHAT_MESSAGES = 500;

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

function trimMessageHistory(messages: ChatMessage[], seenIds: Set<string>): ChatMessage[] {
  if (messages.length <= MAX_CHAT_MESSAGES) {
    return messages;
  }
  const overflow = messages.length - MAX_CHAT_MESSAGES;
  for (const message of messages.slice(0, overflow)) {
    seenIds.delete(message.id);
  }
  return messages.slice(overflow);
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
      update((messages) => trimMessageHistory([...messages, message], seenIds));
    },
    appendStreamingChunk(options: AppendStreamingChunkOptions): AppendStreamingChunkResult {
      const messageId =
        streamingByRequestId.get(options.requestId) ?? `stream-${options.requestId}`;
      let created = false;
      let finalText = options.delta;

      update((messages) => {
        const existing = messages.find((message) => message.id === messageId);
        if (!existing) {
          created = true;
          streamingByRequestId.set(options.requestId, messageId);
          seenIds.add(messageId);
          finalText = options.delta;
          return trimMessageHistory(
            [
              ...messages,
              {
                id: messageId,
                role: "assistant",
                text: options.delta,
                timestamp: options.timestamp,
                requestId: options.requestId,
                streaming: !options.done,
              },
            ],
            seenIds,
          );
        }

        finalText = existing.text + options.delta;
        return messages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                text: finalText,
                streaming: !options.done,
                timestamp: options.done ? options.timestamp : message.timestamp,
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
    updateMessageAttachments(
      messageId: string,
      accepted: Array<{
        attachment_id: string;
        path?: string;
        agent_path?: string;
        kind?: string;
        status?: string;
        metadata?: { storage_filename?: string };
      }>,
    ): void {
      update((messages) =>
        messages.map((message) => {
          if (message.id !== messageId || !message.attachments?.length) {
            return message;
          }
          const nextAttachments = message.attachments.map((attachment) => {
            const match = accepted.find(
              (entry) => entry.attachment_id === attachment.attachment_id,
            );
            if (!match) {
              return attachment;
            }
            const path = match.path ?? match.agent_path;
            const storageFilename = match.metadata?.storage_filename;
            return {
              ...attachment,
              ...(path ? { path } : {}),
              ...(storageFilename ? { storage_filename: storageFilename } : {}),
              ...(match.kind ? { kind: match.kind as ChatMediaKind } : {}),
            };
          });
          return { ...message, attachments: nextAttachments };
        }),
      );
    },
  };
}

export const chatMessages = createChatStore();
