# AuraGo — Computer-Use Integration

Dieses Verzeichnis enthält die **AuraGo-Server-Schnittstelle** für agodesk Computer-Use (Remote Desktop, UI-Automation, Browser-CDP).

| Datei | Zweck |
|--------|--------|
| [../AURAGO_COMPUTER_USE_AGENT.md](../AURAGO_COMPUTER_USE_AGENT.md) | **Hauptdokumentation** für den AuraGo-Coding-Agenten: Protokoll, Frontend-Verhalten, Agent-Loop |
| [protocol-examples.json](./protocol-examples.json) | Kopierbare JSON-Beispiele für alle Nachrichten |
| [agodesk-remote-client.interface.ts](./agodesk-remote-client.interface.ts) | TypeScript-Typen für die AuraGo-Seite (Referenz, nicht Teil des Builds) |
| [agent-worker.example.ts](./agent-worker.example.ts) | Referenz-Implementierung Plan/Act/Observe mit `desktop.command` |

**Client-Quelle der Wahrheit:** `src/lib/types/protocol.ts`, Ausführung: `src/lib/services/desktop.ts`, Gates: `src/lib/services/desktop-flow.ts`.

**Lokaler Test:** `npm run mock-server` — Mock spiegelt seit v0.1.0 `client_capabilities` → `advertised_capabilities`.
