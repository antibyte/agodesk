import fs from "node:fs";
import path from "node:path";

const dir = "src/lib/i18n/messages";
const de = {
  "artifactInspector.action.copy": "Kopieren",
  "artifactInspector.action.open": "Öffnen",
  "artifactInspector.action.openFolder": "Ordner öffnen",
  "artifactInspector.action.save": "Speichern",
  "artifactInspector.close": "Schließen",
  "artifactInspector.empty": "Keine Vorschau verfügbar.",
  "artifactInspector.tab.diff": "Diff",
  "artifactInspector.tab.preview": "Vorschau",
  "artifactInspector.tab.source": "Quelle",
  "artifactInspector.title": "Artefakt",
};
const en = {
  "artifactInspector.action.copy": "Copy",
  "artifactInspector.action.open": "Open",
  "artifactInspector.action.openFolder": "Open folder",
  "artifactInspector.action.save": "Save",
  "artifactInspector.close": "Close",
  "artifactInspector.empty": "No preview available.",
  "artifactInspector.tab.diff": "Diff",
  "artifactInspector.tab.preview": "Preview",
  "artifactInspector.tab.source": "Source",
  "artifactInspector.title": "Artifact",
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
