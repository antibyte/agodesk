# AuraGo Backend — Local Agent Handoff

Arbeitsanweisung für den Backend-Coding-Agent. Beschreibt, was der agodesk-Client
für den optionalen **lokalen Agenten** bereits umsetzt und was das AuraGo-Backend
noch implementieren muss.

Protokoll: `agodesk.v1`
Client-Referenz: `src/lib/services/local-agent/`, Typen in
`src/lib/types/local-agent-protocol.ts`
Design: `docs/superpowers/specs/2026-07-17-local-agent-design.md`

---

## 1. Idee in einem Satz

Ist der lokale Agent aktiv, führt agodesk Chat-Turns lokal mit schlankem Prompt und
Progressive Tool-Discovery aus, nutzt AuraGo nur für Gedächtnis, kurze Rückfragen
und vollen Handoff, und meldet jeden lokalen Turn zurück, damit das AuraGo-Journal
denselben Wissensstand hat.

## 2. Was der Client bereits umsetzt

- Frontend-Agent-Loop (Plan/Act/Observe) mit `persona_prompt` als Prompt-Lead.
- Kernel-Tools immer im Prompt + Progressive Discovery (`list_local_tools`,
  `describe_tool`) für lokale Datei-/Shell-/Desktop-Tools.
- Lokale Ausführung über den bestehenden `desktop.command`-Stack inkl. aller
  Gates/Approvals.
- WebSocket-Client für `local.agent.remote_tool`, `local.agent.handoff`,
  `local.agent.turn`, `local.agent.activity` (senden) und
  `local.agent.remote_tool.result` (empfangen).
- LLM-Aufruf: lokaler Provider direkt per HTTP; AuraGo-Provider über den Proxy
  `local.agent.llm` (siehe unten).
- Settings + UI-Toggle + Provider-Auswahl; Capability `local.agent` in
  `session.start`.
- Turn-Sync nach jedem Turn mit redigierter Tool-Spur.

## 3. Was das Backend noch implementieren muss

### 3.1 Capability spiegeln

Wenn `session.start.client_capabilities` `local.agent` enthält, MUSS
`session.accepted.advertised_capabilities` `local.agent` zurückgeben. Sonst
deaktiviert der Client den lokalen Agenten und nutzt den normalen Remote-Chat.

### 3.2 Kein doppelter Server-Agent bei lokalen Turns

Bei aktivem `local.agent` sendet der Client für lokale Turns KEINE `chat.message`.
Das Backend darf lokale Turns daher nicht zusätzlich serverseitig agenten. Einzige
Ausnahme ist `local.agent.handoff` (siehe 3.5).

### 3.3 `local.agent.remote_tool` → `local.agent.remote_tool.result`

Request (Client → AuraGo):

```json
{
  "type": "local.agent.remote_tool",
  "payload": {
    "session_id": "sess-…",
    "conversation_id": "conv-…",
    "request_id": "req-…",
    "tool": "memory_search",
    "arguments": { "query": "…", "limit": 5 }
  }
}
```

Response (AuraGo → Client, `request_id` gespiegelt):

```json
{
  "type": "local.agent.remote_tool.result",
  "payload": {
    "session_id": "sess-…",
    "request_id": "req-…",
    "tool": "memory_search",
    "success": true,
    "result": { "…": "…" },
    "error_code": null,
    "error_message": null
  }
}
```

Zu unterstützende Tools (dieselben Memory-Tools wie der Server-Agent):

- `memory_search` — args: `{ query: string, limit?: number }`
- `memory_get` — args: `{ id: string }` (oder `{ key }`)
- `query_aurago` — args: `{ question: string, context?: string }`; kurze,
  strukturierte Antwort (Text + optional Quellen). NICHT den vollen Agent-Loop
  starten — das ist für `ask_aurago`/`handoff`.

Das Backend darf hier weitere Tools anbieten; der Client zeigt sie dem LLM nur,
wenn sie im Katalog stehen (optional, siehe 3.7). Für v1 genügen die drei oben.

### 3.4 Timeout/Fehler

Antworte immer mit `local.agent.remote_tool.result` (auch bei Fehler:
`success:false`, `error_code`, `error_message`). Der Client hat einen Waiter mit
Timeout und einem Retry.

### 3.5 `local.agent.handoff`

```json
{
  "type": "local.agent.handoff",
  "payload": {
    "session_id": "sess-…",
    "conversation_id": "conv-…",
    "request_id": "req-…",
    "user_message": "…ursprüngliche/aufbereitete Aufgabe…",
    "reason": "needs_full_toolset",
    "transcript": [
      { "role": "user", "content": "…" },
      { "role": "assistant", "content": "…" }
    ]
  }
}
```

Das Backend behandelt den Handoff wie eine normale User-Nachricht mit vollem
Toolset und antwortet über den bestehenden Flow (`chat.response` /
`chat.response.chunk` / `agent.activity` / `chat.plan_update`) mit derselben
`conversation_id`. Der lokale Loop endet nach dem Handoff; die UI zeigt die
AuraGo-Antwort wie gewohnt.

### 3.6 `local.agent.turn` (Journal-Sync, Pflicht)

Nach JEDEM lokalen Turn (auch `failed`/`cancelled`) sendet der Client:

```json
{
  "type": "local.agent.turn",
  "payload": {
    "session_id": "sess-…",
    "conversation_id": "conv-…",
    "request_id": "req-…",
    "client_timestamp": "2026-07-17T18:33:49Z",
    "status": "completed",
    "user_message": "…",
    "assistant_message": "…",
    "provider": { "source": "aurago", "provider_id": "…", "model": "…" },
    "tool_trace": [
      { "tool": "file_read", "target": "src/main.rs", "status": "success" },
      { "tool": "memory_search", "status": "success" }
    ],
    "started_at": "2026-07-17T18:33:40Z",
    "finished_at": "2026-07-17T18:33:49Z"
  }
}
```

`client_timestamp` ist Pflicht und muss **RFC3339 ohne Bruchsekunden** sein
(Go `time.RFC3339`, z. B. `2026-07-17T18:33:49Z` — nicht `…49.714Z`). Gleiches Feld
gilt für `local.agent.llm`, `local.agent.remote_tool` und `local.agent.handoff`.

Das Backend MUSS den Turn in dasselbe Journal/Knowledge schreiben wie eigene Turns
(gleiche `conversation_id`), damit der Server-Agent später weiß, was lokal
passiert ist. `tool_trace` ist redigiert (keine Secrets, keine vollen Datei-/
Shell-Outputs). Keine Antwort nötig (fire-and-forget); optional ein Ack.

### 3.7 Optional: LLM-Proxy `local.agent.llm`

Wenn `providerSource=aurago`, kann der Client die Provider-API-Keys nicht direkt
nutzen. Das Backend stellt einen Proxy bereit:

Request:

```json
{
  "type": "local.agent.llm",
  "payload": {
    "session_id": "sess-…",
    "request_id": "req-…",
    "client_timestamp": "2026-07-17T18:33:49Z",
    "provider_id": "…",
    "model": "…",
    "messages": [ { "role": "system", "content": "…" }, … ],
    "tools": [ { "type": "function", "function": { "name": "…", "parameters": {} } } ]
  }
}
```

Response (`local.agent.llm.result`, `request_id` gespiegelt):

```json
{
  "type": "local.agent.llm.result",
  "payload": {
    "session_id": "sess-…",
    "request_id": "req-…",
    "success": true,
    "message": {
      "role": "assistant",
      "content": "…",
      "tool_calls": [
        { "id": "call_1", "name": "file_read", "arguments": { "path": "…" } }
      ]
    },
    "error_code": null,
    "error_message": null
  }
}
```

Semantik: ein einzelner Chat-Completion-Schritt (kein Server-Loop). Der Client
führt die Tool-Calls lokal aus und ruft den Proxy erneut mit den Tool-Ergebnissen
auf. Die `tools` sind das aktuell aufgedeckte Progressive-Discovery-Set des Clients
— das Backend soll sie unverändert an den Provider durchreichen und darf sie NICHT
um das große Server-Toolset erweitern.

### 3.8 Optional: `local.agent.activity`

Der Client kann Live-Fortschritt spiegeln (`agent.activity`-kompatibles Payload).
Das Backend kann das in die Timeline/Journal übernehmen. Nicht kritisch für v1.

## 4. IDs und Reihenfolge

- `conversation_id` ist über lokale Turns und Handoffs hinweg konsistent (dieselbe
  wie im normalen Chat).
- `request_id` ist pro lokalem Turn eindeutig und wird in `remote_tool`, `handoff`,
  `turn` und `llm` wiederverwendet, damit das Backend zuordnen kann.

## 5. Definition of Done (Backend)

- [ ] `local.agent` in `session.accepted` gespiegelt.
- [ ] `memory_search` / `memory_get` / `query_aurago` via `remote_tool` beantwortet.
- [ ] `local.agent.handoff` als voller Agent-Turn beantwortet.
- [ ] `local.agent.turn` ins Journal/Knowledge geschrieben.
- [ ] (falls Client-Keys nicht erlaubt) `local.agent.llm` Proxy live.
- [ ] Lokale Turns werden nicht zusätzlich serverseitig agentet.
