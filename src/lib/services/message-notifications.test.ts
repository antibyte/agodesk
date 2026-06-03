import test from "node:test";
import assert from "node:assert/strict";
import { initLocale } from "../i18n/store.ts";
import { formatNotificationPreview } from "./message-notifications.ts";

await initLocale("de");

test("formatNotificationPreview kuerzt lange Antworten", () => {
  const preview = formatNotificationPreview("a".repeat(300), 100);
  assert.equal(preview.length, 100);
  assert.match(preview, /…$/);
});

test("formatNotificationPreview entfernt Codebloecke", () => {
  assert.equal(
    formatNotificationPreview("Hallo ```js\nconsole.log(1)\n``` Welt"),
    "Hallo [Code] Welt",
  );
});

test("formatNotificationPreview liefert Fallback bei leerem Text", () => {
  assert.equal(formatNotificationPreview("   "), "Neue Antwort von AuraGo");
});
