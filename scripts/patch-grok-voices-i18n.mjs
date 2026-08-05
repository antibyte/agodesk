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
  "settings.speech.grokVoiceHelp":
    "Built-in and console voices for Grok Voice Agent. Use Refresh to load the full catalog from xAI (GET /v1/tts/voices). Custom voice IDs from the xAI console also work.",
  "settings.speech.grokVoiceCustomId": "Voice ID (or custom)",
  "settings.speech.grokVoiceCustomIdPlaceholder": "e.g. leo, lumen, or console custom id",
  "settings.speech.grokVoices.refresh": "Load voices from xAI",
  "settings.speech.grokVoices.loading": "Loading voices…",
  "settings.speech.grokVoices.loaded": "Loaded {count} voices from xAI / local catalog.",
  "settings.speech.grokVoices.loadFailed": "Could not load full catalog; showing built-in list.",
  "settings.speech.grokVoices.needKey": "Save an xAI API key to load the full voice catalog.",
};

const de = {
  "settings.speech.grokVoiceHelp":
    "Eingebaute und Console-Stimmen für Grok Voice Agent. Mit „Stimmen laden“ holst du den vollen Katalog von xAI (GET /v1/tts/voices). Custom-Voice-IDs aus der xAI-Console funktionieren ebenfalls.",
  "settings.speech.grokVoiceCustomId": "Voice-ID (oder Custom)",
  "settings.speech.grokVoiceCustomIdPlaceholder": "z. B. leo, lumen oder Console-Custom-ID",
  "settings.speech.grokVoices.refresh": "Stimmen von xAI laden",
  "settings.speech.grokVoices.loading": "Stimmen werden geladen…",
  "settings.speech.grokVoices.loaded": "{count} Stimmen aus xAI / lokalem Katalog.",
  "settings.speech.grokVoices.loadFailed": "Voller Katalog nicht geladen; zeige eingebaute Liste.",
  "settings.speech.grokVoices.needKey":
    "xAI API-Key speichern, um den vollen Stimmenkatalog zu laden.",
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
