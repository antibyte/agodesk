#!/usr/bin/env node
/** Apply llmProviders locale translations from i18n-llmproviders-translations.json */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../src/lib/i18n/messages");
const patchesPath = path.join(__dirname, "i18n-llmproviders-translations.json");

const patches = JSON.parse(fs.readFileSync(patchesPath, "utf8"));

function writeJson(filePath, data) {
  const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
  const lines = Object.entries(sorted).map(([key, value]) => `  "${key}": ${JSON.stringify(value)}`);
  fs.writeFileSync(filePath, `{\n${lines.join(",\n")}\n}\n`, "utf8");
}

for (const [locale, translations] of Object.entries(patches)) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let updated = 0;

  for (const [key, value] of Object.entries(translations)) {
    if (data[key] !== value) {
      data[key] = value;
      updated += 1;
    }
  }

  writeJson(filePath, data);
  console.log(`Updated ${locale}.json (${updated} keys)`);
}

console.log("Done.");
