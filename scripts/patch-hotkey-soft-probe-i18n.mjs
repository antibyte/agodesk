import fs from "node:fs";
import path from "node:path";

const dir = "src/lib/i18n/messages";

const de = {
  "settings.appearance.showWindowHotkey.captureUnavailableSoft":
    "Hinweis: Die Kombination ließ sich gerade nicht vom System prüfen. Sie wurde trotzdem übernommen — beim Speichern wird sie registriert.",
  "settings.appearance.showWindowHotkey.recordingHelp":
    "Halte mindestens eine Umschalttaste (Alt, Strg/Cmd oder Shift) und drücke eine Taste. Beim Loslassen wird sie übernommen. Esc bricht ab.",
  "settings.speech.hotkey.captureUnavailableSoft":
    "Hinweis: Die Kombination ließ sich gerade nicht vom System prüfen. Sie wurde trotzdem übernommen — beim Speichern wird sie registriert.",
  "settings.speech.hotkey.recordingHelp":
    "Halte mindestens eine Umschalttaste (Alt, Strg/Cmd oder Shift) und drücke eine Taste. Beim Loslassen wird sie übernommen. Esc bricht ab.",
};

const en = {
  "settings.appearance.showWindowHotkey.captureUnavailableSoft":
    "Note: The system could not verify this shortcut right now. It was still accepted — it will be registered when you save.",
  "settings.appearance.showWindowHotkey.recordingHelp":
    "Hold at least one modifier (Alt, Ctrl/Cmd, or Shift) and press a key. Release to confirm. Esc cancels.",
  "settings.speech.hotkey.captureUnavailableSoft":
    "Note: The system could not verify this shortcut right now. It was still accepted — it will be registered when you save.",
  "settings.speech.hotkey.recordingHelp":
    "Hold at least one modifier (Alt, Ctrl/Cmd, or Shift) and press a key. Release to confirm. Esc cancels.",
};

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const locale = f.replace(".json", "");
  const keys = locale === "de" ? de : en;
  const p = path.join(dir, f);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const [k, v] of Object.entries(keys)) {
    j[k] = v;
  }
  const sorted = Object.fromEntries(
    Object.keys(j)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => [k, j[k]]),
  );
  fs.writeFileSync(p, JSON.stringify(sorted, null, 2) + "\n");
  console.log("updated", f);
}
