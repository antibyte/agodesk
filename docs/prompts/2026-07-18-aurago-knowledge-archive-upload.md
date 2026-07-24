# Prompt für AuraGo Coding Agent — Wissensarchiv-Upload

Kopiere den Block unten 1:1 an den AuraGo-Coding-Agent auf dem Entwicklungsrechner.

---

## Prompt (copy/paste)

```text
Du arbeitest am AuraGo-Backend (agodesk WebSocket, Protokoll agodesk.v1).
Der Desktop-Client agodesk soll Dokumente in das BESTEHENDE AuraGo-Wissensarchiv
hochladen können, damit sie dort in Embeddings umgewandelt und persistent
gespeichert werden (RAG). Voller Contract/Spec: agodesk-Repo
`docs/AURAGO_KNOWLEDGE_ARCHIVE_HANDOFF.md` (falls nicht lokal: der User gibt sie mit).

## Ziel

Neuer, EIGENER Flow `knowledge.archive.*` (getrennt von `chat.attachment.*`,
`remote.files.*` und `local.agent`). Ein separater Button in agodesk lädt Dateien
hoch; AuraGo reicht die Bytes an die VORHANDENE Ingest-/Embedding-Pipeline des
Wissensarchivs weiter (chunk → embed → store), sodass die Dokumente im GLEICHEN
Wissensarchiv wie die AuraGo-Web-UI landen und per Embedding-Suche auffindbar sind.

## Deine Aufgaben

### A) Capability
- `knowledge.archive.upload` in `session.accepted.advertised_capabilities` spiegeln,
  wenn das Wissensarchiv-Feature aktiv ist.
- Optional `knowledge_archive_limits` in `session.accepted`:
  { max_file_bytes, max_files_per_batch, allowed_mime_prefixes } (snake_case).

### B) WS-Handler (internal/server/agodesk_handlers.go o. ä.)
- `knowledge.archive.prepare` (Client→Server):
  payload { session_id, files:[{ filename, mime_type, size_bytes, title?, tags? }] }
  → Quota/MIME prüfen, pro Datei document_id + signierte upload_url erzeugen
  → `knowledge.archive.prepared`:
     payload { session_id, prepare_id (=prepare.id), documents:[{ document_id,
       filename, upload_url, upload_method:"POST", upload_field:"file",
       expires_at, max_bytes }] }
- `knowledge.archive.status` (Server→Client), asynchron pro Dokument:
  payload { session_id, document_id, state: uploading|processing|ready|failed,
    error?, chunk_count?, title? }. Mindestens einmal ready ODER failed senden.

### C) HTTP-Upload (internal/server/agodesk_knowledge_upload.go o. ä.)
- POST /api/agodesk/knowledge/upload/{document_id}
- Auth via Query-Signatur wie bei bestehenden Media-URLs (agodesk_exp, agodesk_sig).
- multipart/form-data, Feld "file". Hartes Byte-Limit, MIME per Magic Bytes prüfen.
- 201 → { document_id, state:"processing", filename, mime_type, size_bytes }.
- Danach Ingest ASYNCHRON anstoßen.

### D) Anbindung ans bestehende Wissensarchiv (Kern!)
- KEINE neue Pipeline bauen. Dieselbe Ingest-Funktion nutzen wie die AuraGo-Web-UI
  beim Dokument-Upload (Parsing → Chunking → Embedding → Vektor-/Dokumentenstore).
- Dokumente demselben Owner/Knowledge-Space zuordnen wie die gepairte AuraGo-Identität
  der Session (nicht an die flüchtige Transport-Session binden).
- chunk_count + finalen title an den status-Sender zurückgeben.

### E) Fehlercodes
KNOWLEDGE_REJECTED, KNOWLEDGE_TOO_LARGE, KNOWLEDGE_MIME_NOT_ALLOWED,
KNOWLEDGE_NOT_FOUND, KNOWLEDGE_EXPIRED, KNOWLEDGE_INGEST_FAILED.

## Definition of Done
- [ ] `knowledge.archive.upload` wird verhandelt (session.start ↔ session.accepted).
- [ ] prepare → prepared → HTTP 201 → status:processing → status:ready funktioniert.
- [ ] Hochgeladenes Dokument ist im GLEICHEN Wissensarchiv wie die Web-UI per
      Embedding-Suche auffindbar.
- [ ] Limits/MIME/Size werden serverseitig erzwungen (Magic Bytes).
- [ ] Ingest-Fehler → status:failed mit error.
- [ ] Tests: go test ./internal/server/ -run AgodeskKnowledge -count=1

## Nicht tun
- Nicht in chat.message / chat.attachment.* mischen.
- Keinen Zugriff auf beliebige lokale Pfade (das ist remote.files.*).
- Kein neuer Vektor-Store; bestehendes Archiv wiederverwenden.

## Lieferobjekt
1. Kurze Beschreibung, an welche bestehende Knowledge-Pipeline du angedockt hast.
2. Patch + Tests.
3. Beispiel einer realen knowledge.archive.prepared und knowledge.archive.status Payload.
```

---

Nach der Umsetzung auf dem AuraGo-Rechner: AuraGo neu deployen/starten, agodesk
reconnecten. Sobald `knowledge.archive.upload` in `session.accepted` erscheint, zeigt
agodesk den Button „Zu Wissensarchiv hinzufügen“ automatisch an.
