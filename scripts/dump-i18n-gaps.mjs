#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const messagesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/lib/i18n/messages",
);
const en = JSON.parse(fs.readFileSync(path.join(messagesDir, "en.json"), "utf8"));
const de = JSON.parse(fs.readFileSync(path.join(messagesDir, "de.json"), "utf8"));
const gaps = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "i18n-remaining-gaps.json"),
    "utf8",
  ),
);
const keys = [...new Set(Object.values(gaps).flat())].sort();
const out = {};
for (const k of keys) {
  out[k] = { en: en[k], de: de[k] ?? null };
}
fs.writeFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "i18n-gap-source.json"),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log("keys", keys.length);
