import { get } from "svelte/store";
import { activeLocale } from "../i18n/store";
import {
  formatDayLabel as formatDayLabelLocale,
  formatMessageTime as formatMessageTimeLocale,
  systemMessageTone as systemMessageToneLocale,
  type SystemMessageTone,
} from "../i18n/format";

export type ChatTextSegment =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "code"; value: string };

export type ChatContentBlock =
  | { type: "paragraph"; segments: ChatTextSegment[] }
  | { type: "codeblock"; language: string; value: string };

const INLINE_PATTERN =
  /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;

export function parseInlineSegments(text: string): ChatTextSegment[] {
  if (!text) {
    return [];
  }

  const segments: ChatTextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, index) });
    }

    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      segments.push({ type: "code", value: token.slice(1, -1) });
    } else if (token.startsWith("**") && token.endsWith("**")) {
      segments.push({ type: "bold", value: token.slice(2, -2) });
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", value: text }];
}

export function parseChatContent(text: string): ChatContentBlock[] {
  const blocks: ChatContentBlock[] = [];
  const parts = text.split(/(```[\s\S]*?```)/g);

  for (const part of parts) {
    if (!part) {
      continue;
    }

    if (part.startsWith("```") && part.endsWith("```")) {
      const inner = part.slice(3, -3);
      const newline = inner.indexOf("\n");
      if (newline === -1) {
        blocks.push({ type: "codeblock", language: "", value: inner.trim() });
      } else {
        const language = inner.slice(0, newline).trim();
        const value = inner.slice(newline + 1).replace(/\n$/, "");
        blocks.push({ type: "codeblock", language, value });
      }
      continue;
    }

    const paragraphs = part.split(/\n{2,}/);
    for (const paragraph of paragraphs) {
      const trimmed = paragraph.replace(/\n$/, "");
      if (!trimmed.trim()) {
        continue;
      }
      blocks.push({
        type: "paragraph",
        segments: parseInlineSegments(trimmed),
      });
    }
  }

  if (blocks.length === 0) {
    blocks.push({ type: "paragraph", segments: [{ type: "text", value: text }] });
  }

  return blocks;
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
      Math.abs(new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) <=
      GROUP_WINDOW_MS
    );
  };

  return {
    groupWithPrevious: canGroup(current, previous),
    groupWithNext: canGroup(current, next),
  };
}
