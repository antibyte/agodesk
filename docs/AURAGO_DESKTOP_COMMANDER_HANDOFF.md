# AuraGo Handoff: DesktopCommander-Konzepte (Activity, Shell-Sessions, file_patch)

Dieses Dokument ist die Arbeitsanweisung für einen **separaten AuraGo-PR**. AgoDesk implementiert die Client-Seite; ohne Capability-/Ops-Mapping auf dem Server schlagen Befehle mit `UNSUPPORTED_CAPABILITY` fehl.

Bezug: DesktopCommanderMCP als Ideensteinbruch — AuraGo bleibt Planer, AgoDesk lokale Capability-Grenze.

---

## A. `agent.activity` + Capability `chat.agent_activity`

### Ziel

Während eines Agent-Turns Activity-Events an AgoDesk senden, wenn der Client `chat.agent_activity` advertisiert und negotiated.

### Payload

```json
{
  "type": "agent.activity",
  "payload": {
    "activity_id": "act-1",
    "parent_activity_id": "act-0",
    "session_id": "agodesk:…",
    "conversation_id": "…",
    "request_id": "…",
    "command_id": "cmd-…",
    "kind": "tool",
    "phase": "started",
    "title": "Suche nach WebSocket-Aufrufen",
    "summary": "38 Treffer",
    "risk": "read",
    "progress": { "current": 38, "total": 100, "unit": "hits" }
  }
}
```

Phases: `queued` | `started` | `progress` | `waiting_approval` | `completed` | `failed` | `cancelled`.

Kinds: `agent` | `tool` | `shell` | `search` | `file_read` | `file_edit` | `browser` | `desktop`.

### Aufgaben

1. Capability `chat.agent_activity` in Session-Negotiation anbieten, wenn Client sie sendet.
2. Im Agent-/Tool-Loop bei Tool-Dispatch, Approval-Wait, Progress, Completion/Failure Frames emittieren.
3. `activity_id` stabil pro Tool-Call; `parent_activity_id` für Nested Steps; `command_id` setzen wenn `desktop.command` folgt.
4. `conversation_id`, `request_id`, `session_id` immer setzen.
5. **Kein Ersatz für Plan:** `chat.plan_update` bleibt Absicht; Activity ist Ausführungstransparenz.
6. Redaction: keine Secrets/volle Shell-Outputs in `summary`.
7. Cancel → `phase: "cancelled"`.
8. Skills: bei Skill-Start Activity `title: "Skill: …"` (AgoDesk zeigt Banner).

### Tests

- Activity nur bei negotiated Cap
- Cancel setzt `cancelled`

---

## B. Persistente Shell-Sessions (`remote.shell.session`)

### Ops (über `desktop.command` / `desktop.result`)

| Op | Zweck |
|----|--------|
| `shell_session_start` | Prozess starten |
| `shell_session_read` | paginiert (`offset`/`limit`, negativ = tail, optional `wait_ms`) |
| `shell_session_input` | stdin |
| `shell_session_stop` | Prozessbaum beenden |
| `shell_session_list` | aktive/kürzlich beendete Sessions |

**Nicht** `shell_exec_stream` wiederverwenden. `shell_exec` bleibt für One-Shot.

Capability: `remote.shell.session` (additiv zu `remote.shell.exec`).

### Start-Beispiel

```json
{
  "command_id": "cmd-123",
  "operation": "shell_session_start",
  "params": {
    "command": "npm run dev",
    "cwd_id": "workspace",
    "initial_wait_ms": 1000
  }
}
```

### Aufgaben

1. In `agodeskDesktopCapabilityForOperation` alle fünf Ops auf `remote.shell.session` mappen.
2. Read-only-Policy: Session-Ops wie `shell_exec` verbieten.
3. Dieselben CWD-/Timeout-Regeln wie `shell_exec`; `initial_wait_ms` ≠ Session-Lebensdauer.
4. Agent-Tools → RemoteHub `SendCommand`.
5. Agent-Kontext: Wann One-Shot vs. Session; nach `start` mit `read` pollen.
6. Reconnect: Sessions leben auf dem Client; nach Reconnect nur `list`/`read`/`stop` — kein angenommenes stdin ohne neue Freigabe.
7. Tests: Capability-Matrix, Denial, Pagination-Felder.

### AgoDesk-Status

Process Manager in Rust (`shell/session.rs`), Approval für `start`/`input`, lokale Stop-UI über Activity Timeline.

---

## C. `file_patch` unter `remote.files.write`

```json
{
  "operation": "file_patch",
  "params": {
    "root_id": "workspace",
    "path": "src/lib/services/websocket.ts",
    "expected_sha256": "abc…",
    "patches": [
      {
        "old_text": "socket.connect();",
        "new_text": "await socket.connect();",
        "expected_occurrences": 1
      }
    ],
    "dry_run": true
  }
}
```

### Aufgaben

1. Cap `remote.files.write` für `file_patch` mappen.
2. Tool: zuerst `dry_run: true`; Commit nach lokalem Freigabe-Pfad in AgoDesk (wenn aktiviert).
3. Optimistic concurrency: `expected_sha256` nach vorherigem `file_read`.
4. Agent-Prompt: exact match + `expected_occurrences`; bei `FILE_PATCH_MISMATCH` / `FILE_HASH_MISMATCH` Diff lesen, nicht fuzzy schreiben.

### AgoDesk-Status

Rust `file_patch` mit SHA256, Dry-Run, Diff, atomic write. Error-Codes: `FILE_HASH_MISMATCH`, `FILE_PATCH_MISMATCH`.

---

## D. Bewusst nicht auf AuraGo

- Keine WS-Op zum Erweitern lokaler AgoDesk-Sicherheitsroots
- Skills-Logik bleibt serverseitig; AgoDesk zeigt nur an
- Kein ungefiltertes Logging voller Tool-Args/Outputs

---

## Verifikation

```bash
go test ./internal/server/ -run Agodesk -count=1
```

Manuell:

1. Gepairtes AgoDesk mit Caps → `agent.activity` im WS-Trace
2. `shell_session_start` → `read` → `stop`
3. `file_patch` dry_run → Diff in Result → Commit

## Client-Referenz (AgoDesk)

| Feature | Status |
|---------|--------|
| `chat.agent_activity` + Timeline-UI | implementiert |
| `shell_session_*` + Process Manager | implementiert |
| Artifact Inspector | implementiert |
| `file_patch` | implementiert |
| LocalJob + Activity Journal | implementiert |
| Capability Registry (Client-SSOT) | implementiert |
