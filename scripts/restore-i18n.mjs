#!/usr/bin/env node
/**
 * Restore corrupted locale JSON files from git HEAD and merge uncommitted
 * speech/TTS key updates from de.json + en.json.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../src/lib/i18n/messages");

const LOCALES = [
  "fr",
  "es",
  "zh",
  "ja",
  "nl",
  "pt",
  "pl",
  "cs",
  "it",
  "sv",
  "no",
  "da",
  "el",
  "hi",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readHeadJson(locale) {
  const raw = execSync(`git show HEAD:src/lib/i18n/messages/${locale}.json`, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

function writeJson(filePath, data) {
  const lines = Object.entries(data).map(([key, value]) => `  "${key}": ${JSON.stringify(value)}`);
  const content = `{\n${lines.join(",\n")}\n}\n`;
  fs.writeFileSync(filePath, content, "utf8");
}

const headDe = readHeadJson("de");
const curDe = readJson(path.join(messagesDir, "de.json"));
const curEn = readJson(path.join(messagesDir, "en.json"));

/** Keys added or changed in uncommitted de.json vs HEAD */
const patchKeys = [];
for (const key of Object.keys(curDe)) {
  if (!(key in headDe) || headDe[key] !== curDe[key]) {
    patchKeys.push(key);
  }
}

/** Keys removed in uncommitted de.json */
const removeKeys = Object.keys(headDe).filter((k) => !(k in curDe));

console.log(`Patch keys: ${patchKeys.length}, remove keys: ${removeKeys.length}`);

for (const locale of LOCALES) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const restored = readHeadJson(locale);

  for (const key of removeKeys) {
    delete restored[key];
  }

  for (const key of patchKeys) {
    // Use English for non-de/en locales (loader merges de+en+locale anyway,
    // but tests require every key present in each locale file).
    restored[key] = curEn[key] ?? curDe[key];
  }

  writeJson(filePath, restored);
  console.log(`Restored ${locale}.json (${Object.keys(restored).length} keys)`);
}

console.log("Done. de.json and en.json left unchanged.");
