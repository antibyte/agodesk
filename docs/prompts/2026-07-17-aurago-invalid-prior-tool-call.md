# Prompt für AuraGo Coding Agent — invalid prior tool call

Kopiere den Block unten 1:1 an den AuraGo-Coding-Agent.

---

## Prompt (copy/paste)

```text
Du arbeitest am AuraGo-Backend (agodesk WebSocket, Protokoll agodesk.v1).
Bezug: Commit 838ba7728 (canonicalize local agent llm results) und
agodesk `docs/AURAGO_LOCAL_AGENT_HANDOFF.md`.

## Aktueller Bug (Live)

agodesk Local Agent (`providerSource=aurago`) meldet jetzt:

  AuraGo LLM-Proxy: local.agent.llm contains an invalid prior tool call

Das tritt typischerweise beim **zweiten LLM-Step desselben Turns** auf:
1. Step 0: `local.agent.llm` → Result mit `tool_calls` (ok)
2. Client führt Tools lokal aus
3. Step 1: `local.agent.llm` erneut, `messages` enthält jetzt:
   - assistant-Message mit `tool_calls`
   - tool-Messages mit `tool_call_id` + `content`
→ Backend lehnt ab: "invalid prior tool call"

## Was der Client bewusst sendet

In Request-`messages` nutzt agodesk die **OpenAI Chat Completions Wire-Form**
(nicht die flache Result-Form):

```json
{
  "role": "assistant",
  "content": "",
  "tool_calls": [
    {
      "id": "call_1",
      "type": "function",
      "function": {
        "name": "list_local_tools",
        "arguments": "{\"limit\":20}"
      }
    }
  ]
}
```

```json
{
  "role": "tool",
  "tool_call_id": "call_1",
  "name": "list_local_tools",
  "content": "{\"tools\":[…]}"
}
```

Code-Referenz Client: `toWireToolCalls()` in
`agodesk/src/lib/services/local-agent/loop.ts`
→ `arguments` ist immer ein **JSON-String**, `name` liegt unter `function.name`.

Die **Result**-Form aus 838ba7728 bleibt flach (korrekt für den Contract):

```json
"tool_calls": [
  { "id": "call_1", "name": "list_local_tools", "arguments": { "limit": 20 } }
]
```

## Root-Cause-Hypothese

Nach 838ba7728 validiert der Proxy Prior-`tool_calls` in Request-`messages`
vermutlich mit derselben Regel wie Result-Payloads („arguments müssen Objekte
sein“ / flat `name`). Dadurch werden gültige OpenAI-History-Messages als
„invalid prior tool call“ abgelehnt.

Der Provider (go-openai / OpenAI-compat) braucht in `messages` aber genau die
Wire-Form mit `function.arguments` als **String**.

## Fix-Anforderungen

1. **Zwei Formate klar trennen**
   - `local.agent.llm` Request `messages`: OpenAI Chat Completions akzeptieren
     (assistant.tool_calls mit `type:"function"`, `function.name`,
     `function.arguments` als JSON-String; tool-role mit `tool_call_id`).
   - `local.agent.llm.result` Response `message.tool_calls`: flache kanonische
     Form beibehalten (`id`, `name`, `arguments` als Objekt).

2. **Validierung anpassen**
   - „invalid prior tool call“ nur bei wirklich kaputten Einträgen
     (fehlende id, fehlender name, tool_call_id ohne Matching-Call, etc.).
   - String-`arguments` in Request-History sind **gültig**.
   - Optional: flat object-arguments in History ebenfalls akzeptieren und vor
     dem Provider-Call in JSON-String konvertieren (Toleranz) — aber OpenAI-
     Form darf nicht mehr failen.

3. **Vor Provider-Call**
   - Messages in echtes OpenAI `ChatCompletionMessage`-Array materialisieren.
   - Keine Server-Tools/Prompts anhängen (unverändert aus 838ba7728).

4. **Tests**
   - Roundtrip: Result flat tool_calls → Client baut OpenAI History → zweiter
     `local.agent.llm` Call mit assistant+tool messages → success.
   - Ablehnung nur bei echt invaliden Calls (z. B. tool message ohne
     `tool_call_id`, assistant tool_call ohne id/name).
   - Regression: leere Choices → LLM_EMPTY; client_timestamp; Main-Provider
     nicht Helper.

## Nicht tun

- Client zwingen, in Request-messages die flache Result-Form zu senden
  (bricht Provider-Kompatibilität, wenn ihr durchreicht).
- OpenAI-`arguments`-Strings in der History zu Objekten „umbiegen“, ohne sie
  vor dem Upstream wieder zu stringsieren.

## Lieferobjekt

1. Bestätigung der Root Cause (welche Validierungsstelle den Fehler wirft)
2. Patch + Tests für Multi-Step-Turn (tool_call → tool result → zweiter LLM-Call)
3. Kurzes Beispiel einer akzeptierten Request-`messages`-Sequenz
```

---

Nach dem Fix: AuraGo deployen, agodesk reconnecten, einen Turn provozieren der
zuerst ein Kernel-Tool (`list_local_tools` / `describe_tool`) ruft und dann
antwortet.
