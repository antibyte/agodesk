import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "i18n", "messages");

const en = {
  "settings.speech.provider.grok_voice.title": "Grok Voice",
  "settings.speech.provider.grok_voice.hint": "xAI Grok Voice Agent · API key · Internet",
  "speechBanner.provider.grok_voice": "Grok",
  "settings.speech.grokVoiceHelp":
    "Built-in voices: eve, ara, rex, sal, leo. Custom voice IDs from the xAI console are supported.",
  "settings.speech.xaiApiKey.title": "xAI API key",
  "settings.speech.xaiApiKeyHelp":
    "The API key is stored in the OS keyring, not in app settings. Sessions use short-lived tokens so the key never appears in the WebSocket URL. Model: grok-voice-latest (or pin grok-voice-think-fast-1.0).",
  "settings.speech.xaiApiKey.error.empty": "Please enter an API key.",
  "settings.speech.xaiApiKey.error.removeFailed": "Could not remove API key.",
  "settings.speech.xaiApiKey.error.saveFailed": "Could not save API key.",
  "settings.speech.xaiApiKey.error.testFailed": "Connection test failed.",
  "settings.speech.xaiApiKey.error.testGrokOnly": "Connection test applies to Grok Voice only.",
  "settings.speech.xaiApiKey.error.testNoKey": "Please enter or save an API key first.",
  "settings.speech.xaiApiKey.fieldLabel": "xAI API key",
  "settings.speech.xaiApiKey.freeKeyLink": "xAI Console",
  "settings.speech.xaiApiKey.freeKeyPrompt": "Get an API key here:",
  "settings.speech.xaiApiKey.notStored": "Not stored",
  "settings.speech.xaiApiKey.placeholderNew": "xai-…",
  "settings.speech.xaiApiKey.placeholderReplace": "Enter new key to replace…",
  "settings.speech.xaiApiKey.remove": "Remove key",
  "settings.speech.xaiApiKey.save": "Save key",
  "settings.speech.xaiApiKey.statusLabel": "Status:",
  "settings.speech.xaiApiKey.stored": "Stored",
  "settings.speech.xaiApiKey.success.removed": "API key removed.",
  "settings.speech.xaiApiKey.success.saved": "API key saved securely.",
  "settings.speech.xaiApiKey.success.test": "Grok Voice connection successful.",
  "settings.speech.xaiApiKey.test": "Test connection",
  "settings.speech.xaiApiKey.testing": "Testing connection…",
};

const de = {
  "settings.speech.provider.grok_voice.title": "Grok Voice",
  "settings.speech.provider.grok_voice.hint": "xAI Grok Voice Agent · API-Key · Internet",
  "speechBanner.provider.grok_voice": "Grok",
  "settings.speech.grokVoiceHelp":
    "Eingebaute Stimmen: eve, ara, rex, sal, leo. Custom-Voice-IDs aus der xAI-Console werden unterstützt.",
  "settings.speech.xaiApiKey.title": "xAI API-Key",
  "settings.speech.xaiApiKeyHelp":
    "Der API-Key wird im OS-Keyring gespeichert, nicht in den App-Einstellungen. Sessions nutzen kurzlebige Tokens, der Key erscheint nie in der WebSocket-URL. Modell: grok-voice-latest (oder pinne grok-voice-think-fast-1.0).",
  "settings.speech.xaiApiKey.error.empty": "Bitte einen API-Key eingeben.",
  "settings.speech.xaiApiKey.error.removeFailed": "API-Key konnte nicht entfernt werden.",
  "settings.speech.xaiApiKey.error.saveFailed": "API-Key konnte nicht gespeichert werden.",
  "settings.speech.xaiApiKey.error.testFailed": "Verbindungstest fehlgeschlagen.",
  "settings.speech.xaiApiKey.error.testGrokOnly": "Verbindungstest gilt nur für Grok Voice.",
  "settings.speech.xaiApiKey.error.testNoKey": "Bitte zuerst einen API-Key eingeben oder speichern.",
  "settings.speech.xaiApiKey.fieldLabel": "xAI API-Key",
  "settings.speech.xaiApiKey.freeKeyLink": "xAI Console",
  "settings.speech.xaiApiKey.freeKeyPrompt": "API-Key hier holen:",
  "settings.speech.xaiApiKey.notStored": "Nicht hinterlegt",
  "settings.speech.xaiApiKey.placeholderNew": "xai-…",
  "settings.speech.xaiApiKey.placeholderReplace": "Neuen Key eingeben zum Ersetzen…",
  "settings.speech.xaiApiKey.remove": "Key entfernen",
  "settings.speech.xaiApiKey.save": "Key speichern",
  "settings.speech.xaiApiKey.statusLabel": "Status:",
  "settings.speech.xaiApiKey.stored": "Hinterlegt",
  "settings.speech.xaiApiKey.success.removed": "API-Key entfernt.",
  "settings.speech.xaiApiKey.success.saved": "API-Key sicher gespeichert.",
  "settings.speech.xaiApiKey.success.test": "Grok Voice Verbindung erfolgreich.",
  "settings.speech.xaiApiKey.test": "Verbindung testen",
  "settings.speech.xaiApiKey.testing": "Teste Verbindung…",
};

const localeMaps = { en, de };

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const locale = path.basename(file, ".json");
  const full = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(full, "utf8"));
  const map = localeMaps[locale] ?? en;
  Object.assign(data, map);
  const sorted = Object.fromEntries(Object.keys(data).sort().map((k) => [k, data[k]]));
  fs.writeFileSync(full, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log("updated", file, "has grok", Boolean(sorted["settings.speech.provider.grok_voice.title"]));
}
