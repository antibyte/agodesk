#!/usr/bin/env node
/** Apply missing locale translations from i18n-missing-translations.json */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../src/lib/i18n/messages");
const patchesPath = path.join(__dirname, "i18n-missing-translations.json");

const patches = JSON.parse(fs.readFileSync(patchesPath, "utf8"));

function writeJson(filePath, data) {
  const lines = Object.entries(data).map(([key, value]) => `  "${key}": ${JSON.stringify(value)}`);
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
