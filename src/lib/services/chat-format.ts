import { get } from "svelte/store";
import { activeLocale } from "../i18n/store";
import {
  formatDayLabel as formatDayLabelLocale,
  formatMessageTime as formatMessageTimeLocale,
  systemMessageTone as systemMessageToneLocale,
  type SystemMessageTone,
} from "../i18n/format";

export type { ChatContentBlock, ChatListItem, ChatTextSegment } from "./chat-format-types";

export {
  parseChatContent,
  parseInlineSegments,
  plainTextFromMarkdown,
  sanitizeChatLinkHref,
} from "./chat-markdown";

import { plainTextFromMarkdown } from "./chat-markdown";

/** Strip markdown/formatting so TTS reads natural spoken text. */
export function plainTextForSpeech(text: string): string {
  return plainTextFromMarkdown(text);
}

export function formatDayLabel(timestamp: string, now = new Date()): string {
  return formatDayLabelLocale(timestamp, get(activeLocale), now);
}

export function formatMessageTime(timestamp: string): string {
  return formatMessageTimeLocale(timestamp, get(activeLocale));
}

export function systemMessageTone(
  text: string,
  explicitTone?: SystemMessageTone,
): SystemMessageTone {
  return systemMessageToneLocale(text, explicitTone);
}

const GROUP_WINDOW_MS = 3 * 60 * 1000;

export interface MessageGroupMeta {
  groupWithPrevious: boolean;
  groupWithNext: boolean;
}

export function messageGroupMeta(
  messages: { role: string; timestamp: string }[],
  index: number,
): MessageGroupMeta {
  const current = messages[index];
  const previous = messages[index - 1];
  const next = messages[index + 1];

  const canGroup = (a: typeof current, b: typeof current | undefined): boolean => {
    if (!b || a.role !== b.role || a.role === "system") {
      return false;
    }
    return (
      Math.abs(new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) <= GROUP_WINDOW_MS
    );
  };

  return {
    groupWithPrevious: canGroup(current, previous),
    groupWithNext: canGroup(current, next),
  };
}
