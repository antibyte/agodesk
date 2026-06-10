import test from "node:test";
import assert from "node:assert/strict";
import { initLocale } from "../i18n/store.ts";
import {
  formatDayLabel,
  messageGroupMeta,
  parseChatContent,
  parseInlineSegments,
  plainTextForSpeech,
  systemMessageTone,
} from "./chat-format.ts";

await initLocale("de");

test("parseInlineSegments erkennt code und bold", () => {
  assert.deepEqual(parseInlineSegments("Hallo `welt` und **fett**"), [
    { type: "text", value: "Hallo " },
    { type: "code", value: "welt" },
    { type: "text", value: " und " },
    { type: "bold", value: "fett" },
  ]);
});

test("parseInlineSegments erkennt links und kursiv", () => {
  assert.deepEqual(parseInlineSegments("Siehe [Docs](https://example.com) und *kursiv*"), [
    { type: "text", value: "Siehe " },
    { type: "link", label: "Docs", href: "https://example.com" },
    { type: "text", value: " und " },
    { type: "italic", value: "kursiv" },
  ]);
});

test("parseChatContent erkennt Ueberschriften und Listen", () => {
  const blocks = parseChatContent("## Titel\n\n- Punkt eins\n- Punkt zwei");
  assert.equal(blocks[0]?.type, "heading");
  assert.equal(blocks[1]?.type, "list");
  if (blocks[0]?.type === "heading") {
    assert.equal(blocks[0].level, 2);
  }
  if (blocks[1]?.type === "list") {
    assert.equal(blocks[1].ordered, false);
    assert.equal(blocks[1].items.length, 2);
  }
});

test("parseChatContent erkennt Tabellen", () => {
  const blocks = parseChatContent("| A | B |\n| --- | --- |\n| 1 | 2 |");
  assert.equal(blocks[0]?.type, "table");
  if (blocks[0]?.type === "table") {
    assert.equal(blocks[0].headerRow.length, 2);
    assert.equal(blocks[0].rows.length, 1);
  }
});

test("parseChatContent erkennt verschachtelte Listen", () => {
  const blocks = parseChatContent("- eins\n  - zwei\n- drei");
  assert.equal(blocks[0]?.type, "list");
  if (blocks[0]?.type === "list") {
    assert.equal(blocks[0].items.length, 2);
    assert.ok(blocks[0].items[0]?.nested?.[0]?.type === "list");
  }
});

test("parseChatContent erkennt Codebloecke", () => {
  const blocks = parseChatContent("Text\n\n```js\nconsole.log(1)\n```");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, "paragraph");
  assert.equal(blocks[1].type, "codeblock");
  if (blocks[1].type === "codeblock") {
    assert.equal(blocks[1].language, "js");
    assert.equal(blocks[1].value, "console.log(1)");
  }
});

test("plainTextForSpeech entfernt Markdown fuer TTS", () => {
  assert.equal(
    plainTextForSpeech("Hallo **Welt** und `code`"),
    "Hallo Welt und code",
  );
  assert.equal(
    plainTextForSpeech("## Titel\n\nText mit [Link](https://example.com)."),
    "Titel Text mit Link.",
  );
  assert.equal(
    plainTextForSpeech("Text\n\n```js\nconsole.log(1)\n```"),
    "Text",
  );
});

test("messageGroupMeta gruppiert gleiche Rolle", () => {
  const messages = [
    { role: "assistant", timestamp: "2026-05-30T12:00:00Z" },
    { role: "assistant", timestamp: "2026-05-30T12:01:00Z" },
    { role: "user", timestamp: "2026-05-30T12:02:00Z" },
  ];
  assert.deepEqual(messageGroupMeta(messages, 0), {
    groupWithPrevious: false,
    groupWithNext: true,
  });
  assert.deepEqual(messageGroupMeta(messages, 1), {
    groupWithPrevious: true,
    groupWithNext: false,
  });
});

test("systemMessageTone klassifiziert Meldungen", () => {
  assert.equal(systemMessageTone("Remote Control freigegeben."), "success");
  assert.equal(systemMessageTone("Verbindung unterbrochen"), "error");
  assert.equal(systemMessageTone("Remote Control angefragt"), "info");
});

test("formatDayLabel zeigt Heute", () => {
  const now = new Date("2026-05-30T15:00:00Z");
  assert.equal(formatDayLabel("2026-05-30T10:00:00Z", now), "Heute");
});
