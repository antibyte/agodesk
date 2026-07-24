import fs from "node:fs";
import path from "node:path";

const dir = "src/lib/i18n/messages";

const de = {
  "inputBox.knowledgeArchive.add.ariaLabel": "Zu Wissensarchiv hinzufügen",
  "inputBox.knowledgeArchive.add.title": "Zu Wissensarchiv hinzufügen",
  "inputBox.knowledgeArchive.error.fileTooLarge": "Eine Datei überschreitet das Größenlimit.",
  "inputBox.knowledgeArchive.error.mimeNotAllowed": "Dateityp nicht erlaubt: {mime}",
  "inputBox.knowledgeArchive.error.tooMany": "Höchstens {count} Dateien pro Upload.",
  "chatView.knowledgeArchive.processing":
    "{count} Dokument(e) werden ins Wissensarchiv hochgeladen…",
  "chatView.knowledgeArchive.ready": "{count} Dokument(e) im Wissensarchiv gespeichert.",
  "chatView.knowledgeArchive.failed": "{count} Dokument(e) konnten nicht hinzugefügt werden.",
  "chatView.knowledgeArchive.stillProcessing":
    "{count} Dokument(e) werden noch verarbeitet (Embeddings).",
  "chatView.knowledgeArchive.error": "Upload ins Wissensarchiv fehlgeschlagen.",
};

const en = {
  "inputBox.knowledgeArchive.add.ariaLabel": "Add to knowledge archive",
  "inputBox.knowledgeArchive.add.title": "Add to knowledge archive",
  "inputBox.knowledgeArchive.error.fileTooLarge": "A file exceeds the size limit.",
  "inputBox.knowledgeArchive.error.mimeNotAllowed": "File type not allowed: {mime}",
  "inputBox.knowledgeArchive.error.tooMany": "At most {count} files per upload.",
  "chatView.knowledgeArchive.processing": "Uploading {count} document(s) to the knowledge archive…",
  "chatView.knowledgeArchive.ready": "{count} document(s) stored in the knowledge archive.",
  "chatView.knowledgeArchive.failed": "{count} document(s) could not be added.",
  "chatView.knowledgeArchive.stillProcessing": "{count} document(s) still processing (embeddings).",
  "chatView.knowledgeArchive.error": "Knowledge archive upload failed.",
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
