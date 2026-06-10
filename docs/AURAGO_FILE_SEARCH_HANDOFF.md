# AuraGo Handoff: `file_search` für gepairte agodesk-Clients

agodesk implementiert `desktop.command` mit `operation: "file_search"`. AuraGo leitet das über `RemoteHub.SendCommand` → `agodeskDesktopBroker` weiter. **Heute fehlt** die Capability-Zuordnung für `remote.OpFileSearch` — Befehle scheitern mit `UNSUPPORTED_CAPABILITY`.

Dieses Dokument ist die Arbeitsanweisung für einen separaten AuraGo-PR (nicht Teil des agodesk-PRs).

## Hintergrund

- agodesk antwortet auf `file_search` mit JSON in `desktop.result.data.content` (AuraGo-kompatibles `FileSearchResult`-Format).
- Unterstützte Sub-Operationen: `grep`, `grep_recursive`, `find`.
- Der Agent-Tool-Code in `internal/agent/remote_tool.go` sendet bereits `remote.OpFileSearch` — **keine Änderung am Tool selbst nötig**.

## Aufgaben

### 1. Capability-Mapping

**Datei:** `internal/server/agodesk_handlers.go`

In `agodeskDesktopCapabilityForOperation` ergänzen:

```go
case remote.OpFileSearch:
    return "remote.files.read"
```

### 2. File-Access-Limits

In `applyAgodeskFileAccessLimits` den Switch erweitern:

```go
case remote.OpFileRead, remote.OpFileList, remote.OpFileWrite, remote.OpFileSearch:
```

`OpFileSearch` wie `OpFileList`/`OpFileRead` behandeln:

- `file_access.enabled` prüfen
- `validateAgodeskFileAccessRoot` für read permission
- Optional: Timeout in `SendCommand` für `file_search` auf 30–60s (große Repos)

### 3. Agent-Kontext

In `buildAgodeskAgentContext` / `agodeskFileAccessAgentContextLines` einen Satz ergänzen:

> When searching files on the paired agodesk PC, use remote_control `file_search` (grep / grep_recursive / find) scoped to the granted roots; agodesk uses a fast local index (fff).

### 4. Tests

**Datei:** `internal/server/agodesk_handlers_test.go`

- `file_search` erfordert `remote.files.read`
- Capability-Matrix analog zu `file_list`
- Mit `file_access` disabled → `FILE_ACCESS_DISABLED`

### 5. Dokumentation

**Datei:** `documentation/agodesk_coding_agent_file_access.md`

Abschnitt „file_search“ ergänzen (requires `remote.files.read`, Ops, Limits).

## Verifikation

```bash
go test ./internal/server/ -run AgodeskFile -count=1
```

Manuell: Agent auf gepairtem agodesk „Suche in meinem freigegebenen Ordner nach …“ → `file_search` im WS-Trace, Ergebnis-JSON mit Treffern.

## agodesk-Seite (bereits implementiert)

| Komponente | Beschreibung |
|------------|--------------|
| `fff-search` Crate | Ein `FilePicker`-Index pro read-freigegebenem Root |
| Tauri Commands | `file_search`, `file_search_sync_roots`, `file_search_rescan` |
| WS-Routing | `desktop.ts` case `file_search` → `{ content: jsonString }` |
| Index-Warmup | Bei App-Start und Settings-Speichern via `syncFileSearchRoots` |
| Limits | 500 grep_recursive Treffer, 1000 find-Dateien, 10 MB/Datei, Pattern max. 256 Zeichen |
| Sandbox | Gleiche `access.rs`-Logik + Post-Filter auf root-relative Pfade |

## Risiken

| Risiko | Mitigation |
|--------|------------|
| AuraGo ohne Backend-Fix | Agent bekommt `UNSUPPORTED_CAPABILITY` — AuraGo-PR zuerst oder parallel deployen |
| Erste Suche langsam | Hintergrund-Warmup; `wait_for_scan` mit 10s Timeout |
| Hoher RAM bei großen Ordnern | Index nur für explizit freigegebene Roots |

## Troubleshooting (`UNSUPPORTED_CAPABILITY` trotz Freigabe)

1. **agodesk-Einstellungen → Dateien → „Verhandelt mit AuraGo“**  
   - Grün: `remote.files.read` / `.write` in `session.accepted.advertised_capabilities`  
   - Rot: AuraGo hat die Caps nicht übernommen — **nicht** agodesk blockt den Befehl, sondern der Server lehnt ab, bevor `desktop.command` ankommt.

2. **DevTools-Konsole nach Reconnect**  
   `[agodesk:session.start]` muss zeigen:
   - `file_access_enabled: true`
   - `client_file_capabilities: ["remote.files.read", …]`
   - `file_roots: ["baf-g-…"]`

3. **AuraGo WS-Trace**  
   - `session.start` enthält `file_access` + `remote.files.read`?  
   - `session.accepted.advertised_capabilities` spiegelt dieselben Caps?

4. **`file_search` vs. Shell**  
   - `file_search` braucht nur `remote.files.read` + Mapping `OpFileSearch` (Handoff §1–2).  
   - **Shell** (`OpShell` o.ä.) wird von agodesk **nicht** implementiert — bleibt dauerhaft `UNSUPPORTED_CAPABILITY`, bis AuraGo Shell-Tools für agodesk deaktiviert oder agodesk Shell explizit anbietet.

5. **Typischer AuraGo-Fehler nach „Fix“**  
   - Mapping in `agodeskDesktopCapabilityForOperation` ergänzt, aber `applyAgodeskFileAccessLimits` vergisst `OpFileSearch`  
   - Oder Agent übergibt in `params.operation` fälschlich `"remote_control"` statt `grep` / `grep_recursive` / `find` → agodesk antwortet: `Unknown file_search operation 'remote_control'`

6. **`file_read` für Office/Binärdateien**  
   - agodesk liefert standardmäßig `encoding: "auto"`: Text als UTF-8, Binär (`.docx`, `.pdf`, Bilder) als **Base64** mit `encoding: "base64"`.  
   - Explizit `encoding: "utf-8"` schlägt bei Binärdateien mit `FILE_NOT_TEXT` fehl (nicht `FILE_ACCESS_DENIED`).

### Korrektes `file_search`-Payload (AuraGo → agodesk)

```json
{
  "command_id": "…",
  "operation": "file_search",
  "params": {
    "root_id": "baf-g-872e1d24",
    "path": ".",
    "operation": "grep_recursive",
    "pattern": "Johannes",
    "glob": "*.docx"
  }
}
```

**Wichtig:** Das innere `params.operation` ist die Suchart (`grep` | `grep_recursive` | `find`), **nicht** `remote_control`.

### Parameter-Aliase und Pfad-Defaults (agodesk ≥ Path-Fix)

AuraGo/Agent-Tools dürfen den Pfad unter diesen Keys senden (snake_case und camelCase):

| Key | Beispiel |
|-----|----------|
| `path` | `"docs/readme.md"` |
| `file_path` / `filePath` / `filepath` | `"docs/readme.md"` |
| `relative_path` / `relativePath` | `"docs/readme.md"` |
| `directory` / `dir` | `"."` |

Verhalten in agodesk:

| Operation | Pfad leer/omitted |
|-----------|-------------------|
| `file_list` | Listet Root (`.`) |
| `file_search` + `grep_recursive` / `find` | Sucht ab Root (`.`) |
| `file_search` + `grep` | `'path' is required` (Einzeldatei) |
| `file_read` / `file_write` | `'path' is required` |

**Such-Operation-Aliase:** Neben `params.operation` akzeptiert agodesk `search_type` / `searchType` / `search_mode` / `searchMode` (AuraGo-Agent-Tools). Ohne Mapping defaultet agodesk auf `grep` → fälschliche Meldung *"'path' is required for grep …"*.

**Windows Extended Paths:** Gespeicherte Roots wie `//?/C:/Users/…/OneDrive/…` werden vor `canonicalize` normalisiert (`\\?\`-Prefix). Nach Update ggf. in agodesk-Einstellungen → Dateien → Root erneut speichern (triggert Index-Resync).

**Hinweis:** `'path' is required` kommt **nicht** von AuraGo-Linux — agodesk führt Datei-Ops lokal auf dem Windows-Client aus. Wenn der Agent den Pfad unter einem nicht gemappten Key sendet (z. B. nur `filename`), landet `path` leer → Fehler.
