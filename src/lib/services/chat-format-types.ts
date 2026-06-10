export type ChatTextSegment =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "strike"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; label: string; href: string };

export interface ChatListItem {
  segments: ChatTextSegment[];
  nested?: ChatContentBlock[];
  checked?: boolean;
}

export type ChatTableCell = ChatTextSegment[];
export type ChatTableRow = ChatTableCell[];

export type ChatContentBlock =
  | { type: "paragraph"; segments: ChatTextSegment[] }
  | { type: "heading"; level: number; segments: ChatTextSegment[] }
  | { type: "list"; ordered: boolean; items: ChatListItem[] }
  | { type: "blockquote"; segments: ChatTextSegment[] }
  | { type: "codeblock"; language: string; value: string }
  | { type: "table"; headerRow: ChatTableRow; rows: ChatTableRow[] }
  | { type: "hr" };
