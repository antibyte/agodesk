import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toString } from "mdast-util-to-string";
import { gfm } from "micromark-extension-gfm";
import type { Content, ListItem, PhrasingContent, Root } from "mdast";
import type { ChatContentBlock, ChatListItem, ChatTextSegment } from "./chat-format-types";

export function sanitizeChatLinkHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.includes("<") || trimmed.includes(">")) {
    return null;
  }
  if (!/^(https?:|mailto:)/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function parseMarkdownTree(text: string): Root {
  return fromMarkdown(text, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
}

function segmentsToPlainText(segments: ChatTextSegment[]): string {
  return segments
    .map((segment) => {
      switch (segment.type) {
        case "link":
          return segment.label;
        default:
          return segment.value;
      }
    })
    .join("");
}

function blocksToPlainText(blocks: ChatContentBlock[]): string[] {
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "codeblock":
      case "hr":
        break;
      case "table":
        for (const cell of block.headerRow) {
          parts.push(segmentsToPlainText(cell));
        }
        for (const row of block.rows) {
          for (const cell of row) {
            parts.push(segmentsToPlainText(cell));
          }
        }
        break;
      case "list":
        for (const item of block.items) {
          parts.push(segmentsToPlainText(item.segments));
          if (item.nested?.length) {
            parts.push(...blocksToPlainText(item.nested));
          }
        }
        break;
      default:
        parts.push(segmentsToPlainText(block.segments));
        break;
    }
  }

  return parts.filter((part) => part.trim().length > 0);
}

function mergeAdjacentText(segments: ChatTextSegment[]): ChatTextSegment[] {
  const merged: ChatTextSegment[] = [];
  for (const segment of segments) {
    const previous = merged.length > 0 ? merged[merged.length - 1] : undefined;
    if (segment.type === "text" && previous?.type === "text") {
      previous.value += segment.value;
      continue;
    }
    merged.push(segment);
  }
  return merged;
}

function phrasingToSegments(
  nodes: PhrasingContent[],
  style?: "bold" | "italic" | "strike",
): ChatTextSegment[] {
  const segments: ChatTextSegment[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        if (!node.value) {
          break;
        }
        if (style === "bold") {
          segments.push({ type: "bold", value: node.value });
        } else if (style === "italic") {
          segments.push({ type: "italic", value: node.value });
        } else if (style === "strike") {
          segments.push({ type: "strike", value: node.value });
        } else {
          segments.push({ type: "text", value: node.value });
        }
        break;
      }
      case "strong":
        segments.push(...phrasingToSegments(node.children, "bold"));
        break;
      case "emphasis":
        segments.push(...phrasingToSegments(node.children, "italic"));
        break;
      case "delete":
        segments.push(...phrasingToSegments(node.children, "strike"));
        break;
      case "inlineCode":
        segments.push({ type: "code", value: node.value });
        break;
      case "link": {
        const href = sanitizeChatLinkHref(node.url);
        const label = toString(node).trim() || node.url;
        if (href) {
          segments.push({ type: "link", label, href });
        } else {
          segments.push({ type: "text", value: label });
        }
        break;
      }
      case "break":
        segments.push({ type: "text", value: "\n" });
        break;
      case "image":
        segments.push({ type: "text", value: node.alt?.trim() || "" });
        break;
      default:
        break;
    }
  }

  return mergeAdjacentText(segments);
}

function listItemToChatItem(item: ListItem): ChatListItem {
  const segments: ChatTextSegment[] = [];
  const nested: ChatContentBlock[] = [];

  for (const child of item.children) {
    if (child.type === "paragraph") {
      segments.push(...phrasingToSegments(child.children));
    } else {
      nested.push(...contentToBlocks(child));
    }
  }

  return {
    segments: mergeAdjacentText(segments),
    ...(nested.length > 0 ? { nested } : {}),
    ...(typeof item.checked === "boolean" ? { checked: item.checked } : {}),
  };
}

function contentToBlocks(node: Content): ChatContentBlock[] {
  switch (node.type) {
    case "paragraph":
      return [{ type: "paragraph", segments: phrasingToSegments(node.children) }];
    case "heading":
      return [
        {
          type: "heading",
          level: node.depth,
          segments: phrasingToSegments(node.children),
        },
      ];
    case "blockquote": {
      const segments: ChatTextSegment[] = [];
      for (const child of node.children) {
        if (child.type === "paragraph") {
          if (segments.length > 0) {
            segments.push({ type: "text", value: "\n\n" });
          }
          segments.push(...phrasingToSegments(child.children));
        } else {
          return node.children.flatMap(contentToBlocks);
        }
      }
      return [{ type: "blockquote", segments: mergeAdjacentText(segments) }];
    }
    case "list":
      return [
        {
          type: "list",
          ordered: node.ordered ?? false,
          items: node.children.map(listItemToChatItem),
        },
      ];
    case "code":
      return [{ type: "codeblock", language: node.lang ?? "", value: node.value }];
    case "table": {
      const rows = node.children.map((row) =>
        row.children.map((cell) => phrasingToSegments(cell.children)),
      );
      return [
        {
          type: "table",
          headerRow: rows[0] ?? [],
          rows: rows.slice(1),
        },
      ];
    }
    case "thematicBreak":
      return [{ type: "hr" }];
    default:
      return [];
  }
}

export function parseInlineSegments(text: string): ChatTextSegment[] {
  const tree = parseMarkdownTree(text);
  const first = tree.children[0];
  if (first?.type === "paragraph") {
    return phrasingToSegments(first.children);
  }
  return [{ type: "text", value: text }];
}

export function parseChatContent(text: string): ChatContentBlock[] {
  if (!text.trim()) {
    return [{ type: "paragraph", segments: [{ type: "text", value: text }] }];
  }

  const blocks = parseMarkdownTree(text).children.flatMap(contentToBlocks);
  if (blocks.length === 0) {
    return [{ type: "paragraph", segments: [{ type: "text", value: text }] }];
  }
  return blocks;
}

export function plainTextFromMarkdown(text: string): string {
  if (!text.trim()) {
    return "";
  }
  return blocksToPlainText(parseChatContent(text)).join(" ").replace(/\s+/g, " ").trim();
}
