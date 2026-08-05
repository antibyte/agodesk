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
  "settings.speech.xaiApiKey.test": "Check key (local)",
  "settings.speech.xaiApiKey.testNetwork": "Network check",
  "settings.speech.xaiApiKey.testNetworkHelp":
    "Local check does not call xAI (avoids 429). Network check hits GET /v1/tts/voices once. Live speech uses wss://api.x.ai/v1/realtime with Bearer auth.",
  "settings.speech.xaiApiKey.success.test":
    "xAI API key is stored. Start the mic for a real Grok Voice session.",
};

const de = {
  "settings.speech.xaiApiKey.test": "Key prüfen (lokal)",
  "settings.speech.xaiApiKey.testNetwork": "Netzwerk-Check",
  "settings.speech.xaiApiKey.testNetworkHelp":
    "Lokaler Check ruft xAI nicht auf (kein 429). Netzwerk-Check: einmal GET /v1/tts/voices. Live-Sprache: wss://api.x.ai/v1/realtime mit Bearer-Auth.",
  "settings.speech.xaiApiKey.success.test":
    "xAI API-Key ist gespeichert. Mic starten für echte Grok-Voice-Session.",
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
  console.log("ok", file);
}
