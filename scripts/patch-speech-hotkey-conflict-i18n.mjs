import fs from "node:fs";
import path from "node:path";

const dir = "src/lib/i18n/messages";
const key = "chatView.error.speechHotkeyConflict";
const de = "Speech- und Fenster-Hotkey dürfen nicht identisch sein.";
const en = "Speech and show-window hotkeys must not be the same.";

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const p = path.join(dir, f);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  j[key] = f === "de.json" ? de : en;
  const sorted = Object.fromEntries(
    Object.keys(j)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => [k, j[k]]),
  );
  fs.writeFileSync(p, JSON.stringify(sorted, null, 2) + "\n");
  console.log("updated", f);
}
