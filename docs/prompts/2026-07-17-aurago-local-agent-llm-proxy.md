# Prompt für AuraGo Coding Agent — Local Agent LLM-Proxy

Kopiere den Block unten 1:1 an den AuraGo-Coding-Agent auf dem Entwicklungsrechner.

---

## Prompt (copy/paste)

```text
Du arbeitest am AuraGo-Backend (agodesk WebSocket, Protokoll agodesk.v1).
Der Desktop-Client agodesk hat einen optionalen Local Agent Mode. Spec/Contract:
siehe agodesk-Repo `docs/AURAGO_LOCAL_AGENT_HANDOFF.md` (falls nicht lokal: der User
kann die Datei mitgeben).

## Aktueller Bug (Produktion / Live-Test)

agodesk Local Agent mit `providerSource=aurago` (LLM über WS-Proxy):

1. User: "was geht ab" → Antwort OK
2. User: "wird es morgen regnen?" → Client-Fehler:
   `AuraGo LLM-Proxy: Antwort ohne message/choices`

Backend-Logs zur gleichen Zeit:
- `[LLM Transport] request_start` → `https://api.stepfun.ai/step_plan/v1/chat/completions`
- `roundtrip_done (success)` status=200, `content_length=-1` (chunked)
- Beim erfolgreichen Turn davor zusätzlich ein Call zu `https://ollama.com/v1/chat/completions`
  (status=200, content_length=376)

Interpretation: Der Provider-HTTP-Call ist oft 200, aber `local.agent.llm.result`
kommt beim Client ohne extrahierbares Assistant-`message` an (oder success=true
ohne brauchbaren Body). Der Client-Normalizer ist inzwischen tolerant (string-
message, data.choices, content-parts, choices[0].text) — trotzdem muss das
Backend die **kanonische** Response-Form aus dem Contract liefern.

## Deine Aufgaben

### A) Audit (zuerst, mit Evidenz)

1. Finde die Handler für:
   - `local.agent.llm` / `local.agent.llm.result`
   - Capability-Negotiation für `local.agent`
   - `local.agent.remote_tool`, `local.agent.handoff`, `local.agent.turn`
2. Logge (temporär ok) die **exakte** JSON-Payload von `local.agent.llm.result`
   vor dem WS-Write (keys + truncated body). Besonders wenn Choices leer sind
   oder Streaming/chunked Response vom Upstream kommt.
3. Prüfe StepFun `step_plan` / chunked (`content_length=-1`):
   Wird der Body korrekt als **non-stream** Chat-Completion gelesen?
   Wird fälschlich SSE/Stream an den Client durchgereicht?
   Wird Helper-LLM (StepFun) statt Main-Provider (z. B. Ollama) für den Proxy genutzt?

### B) Fix für `local.agent.llm` Proxy

Semantik: **ein** Chat-Completion-Schritt, kein Server-Agent-Loop.
Client-Tools unverändert durchreichen (kein AuraGo-Voll-Toolset anhängen).

Request-Payload (Client → AuraGo):
- `session_id`, `request_id`, `client_timestamp` (Pflicht)
- `client_timestamp` = RFC3339 **ohne** Bruchsekunden
  (Go `time.RFC3339`, z. B. `2026-07-17T18:33:49Z` — nicht `…49.714Z`)
- optional `provider_id`, `model`
- `messages` (OpenAI-Array inkl. system/user/assistant/tool)
- optional `tools` (OpenAI tools array), `tool_choice=auto` wenn tools gesetzt

`request_id` vom Client kann pro LLM-Step so aussehen:
`{turnRequestId}:llm:{step}` — muss 1:1 in der Result-Payload gespiegelt werden
(zusätzlich korreliert der Client ggf. über Envelope-`id`).

Response (`local.agent.llm.result`) — **kanonisch, immer so**:

```json
{
  "type": "local.agent.llm.result",
  "payload": {
    "session_id": "…",
    "request_id": "…gleiche wie Request…",
    "success": true,
    "message": {
      "role": "assistant",
      "content": "…Text oder leer bei reinen tool_calls…",
      "tool_calls": [
        {
          "id": "call_1",
          "name": "file_read",
          "arguments": { "path": "…" }
        }
      ]
    },
    "error_code": null,
    "error_message": null
  }
}
```

Regeln:
- `message` ist ein **Objekt**, kein String.
- `tool_calls[].arguments` als **Objekt** (nicht JSON-String).
- `tool_calls[].name` top-level (nicht nur `function.name` roh durchreichen).
- Bei Upstream-Fehler: `success:false` + `error_code` + `error_message`
  (nie success:true ohne message/choices).
- Bei leeren Choices / unlesbarem Body: success:false, klarer Fehler
  (z. B. `LLM_EMPTY`), nicht „leeres success“.
- Streaming-Upstream in **eine** fertige Completion materialisieren, bevor du
  `local.agent.llm.result` schickst.

### C) Capability & Rest-Contract (falls noch offen)

Definition of Done aus dem Handoff:
- [ ] `local.agent` in `session.accepted.advertised_capabilities` spiegeln
- [ ] `local.agent.remote_tool` für `memory_search` / `memory_get` / `query_aurago`
- [ ] `local.agent.handoff` = normaler voller Agent-Turn → Antwort via chat.response*
- [ ] `local.agent.turn` ins Journal/Knowledge (fire-and-forget)
- [ ] Kein doppelter Server-Agent-Loop für lokale Turns (Client sendet kein chat.message)

### D) Verifikation

1. Unit-/Handler-Test: Proxy mappt OpenAI `choices[0].message` + `function.name`
   Tool-Calls in die kanonische Flat-Form.
2. Test: leere Choices → success:false.
3. Test: client_timestamp mit `.714Z` wird abgelehnt ODER normalisiert; gültiges
   `…49Z` wird akzeptiert.
4. Manuell: zwei Local-Agent-Turns hintereinander (Begrüßung + Wissensfrage)
   müssen beide `local.agent.llm.result` mit `message.content` liefern.

## Nicht tun

- Keinen zweiten Agent-Loop im LLM-Proxy.
- Client-Tools nicht durch das große AuraGo-Toolset ersetzen/erweitern.
- Keine Secrets in `local.agent.turn` / Logs der Result-Payload (Texts kürzen).

## Lieferobjekt

1. Kurze Root-Cause (was genau bei Turn 2 / StepFun schiefging)
2. Patch + Tests
3. Beispiel einer realen `local.agent.llm.result` Payload nach dem Fix
```

---

Nach dem Fix auf dem AuraGo-Rechner: AuraGo neu deployen/starten, agodesk reconnecten,
dann erneut „wird es morgen regnen?“ testen.
