import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "i18n",
  "messages",
);

const en = {
  "settings.speech.xaiApiKey.error.rateLimited":
    "xAI rate limit (HTTP 429). Wait 1-2 minutes, then try again. Your API key is usually valid.",
  "settings.speech.xaiApiKey.success.test":
    "xAI API key is valid (voice list reachable). Realtime speech may still be rate-limited if you just tested often.",
};

const de = {
  "settings.speech.xaiApiKey.error.rateLimited":
    "xAI Rate-Limit (HTTP 429). Bitte 1-2 Minuten warten, dann erneut versuchen. Der API-Key ist in der Regel gueltig.",
  "settings.speech.xaiApiKey.success.test":
    "xAI API-Key ist gueltig (Voice-Liste erreichbar). Realtime-Sprache kann nach vielen Tests noch kurz rate-limitiert sein.",
};

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const locale = path.basename(file, ".json");
  const full = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(full, "utf8"));
  Object.assign(data, locale === "de" ? de : en);
  const sorted = Object.fromEntries(
    Object.keys(data)
      .sort()
      .map((k) => [k, data[k]]),
  );
  fs.writeFileSync(full, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log("updated", file, Boolean(sorted["settings.speech.xaiApiKey.error.rateLimited"]));
}
