# agodesk — Backend-Integrationsübersicht

Dieses Dokument beschreibt Architektur, Komponenten, Tools und das WebSocket-Protokoll des **agodesk** Desktop-Clients. Zielgruppe: Backend-/Agent-Coding-Agenten zur Planung von Schnittstellen und Verbindungsprotokollen.

**Version Client:** `0.1.0`  
**Single Source of Truth für Protokoll-Typen:** `src/lib/types/protocol.ts`

> **Wichtig (Architektur-Stand):** Seit Version 0.1.0 verwendet agodesk einen **nativen WebSocket-Transport in Rust** (tokio-tungstenite + native-tls). Der Browser-WebSocket-Code existiert nicht mehr. Alle TLS-, Reconnect-, Pairing- und Zertifikats-Pinning-Logik liegt im Tauri-Backend (`src-tauri/src/ws/`). Die Frontend-Komponente `NativeWebSocketService` kommuniziert über Tauri `invoke()` Commands.

---

## 1. Projektüberblick

| Aspekt | Details |
|---|---|
| **Typ** | Plattformunabhängiger Desktop-Chat-Client |
| **Rolle** | Frontend für agentic Frameworks (LangChain, CrewAI, Custom Agents, …) |
| **Transport** | WebSocket (JSON Text Frames) |
| **Default-Endpoint** | `ws://localhost:8765` |
| **Auth (MVP)** | Keine — Endpoint offen |
| **Plattformen** | Windows, macOS, Linux (via Tauri) |

---

## 2. Technologie-Stack

### 2.1 Frontend (UI + WebSocket-Client)

| Tool / Library | Version | Zweck |
|---|---|---|
| **Svelte** | 5.x | UI-Komponenten, reaktiver State |
| **TypeScript** | 5.6 | Typisierung, Protokoll-Contracts |
| **Vite** | 6.x | Dev-Server (Port `1420`), Build |
| **Browser WebSocket API** | — | Nicht mehr verwendet (nur noch für Mock-Tests) |

### 2.2 Desktop-Shell (Rust)

| Tool / Library | Version | Zweck |
|---|---|---|
| **Tauri** | 2.x | Desktop-Fenster, Bundle, native APIs |
| **tauri-plugin-store** | 2.x | Persistenz von Einstellungen (Server-URL, Theme) |
| **Rust** | stable | Tauri Core + nativer WS-Transport (tokio-tungstenite, native-tls, keyring, x509-parser) |

### 2.3 Dev / Test

| Tool | Zweck |
|---|---|
| **scripts/mock-server.mjs** | Referenz-Backend (Node.js + `ws`) |
| **npm run mock-server** | Startet Mock auf Port `8765` |
| **npm run tauri dev** | Desktop-App im Dev-Modus |
| **npm run build:win** (or `npm run tauri build`) | Full Windows release + classic NSIS setup.exe (with optional post-install launch) + sidecar |

### 2.4 Explizit NICHT verwendet

- Kein Electron, kein React/Vue
- Kein REST/HTTP für Chat (nur WebSocket)
- Kein GraphQL, gRPC, SSE (Streaming per WS vorgesehen, noch nicht im Client)
- Kein Auth-Layer im MVP (Pairing + Shared Key Proof ersetzt das aktuell)
- Kein Browser-WebSocket mehr für Produktion (nur noch Rust-Transport)

---

## 3. Architektur & Datenfluss

```
┌─────────────────────────────────────────────────────────────┐
│                    agodesk (Tauri App)                      │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Frontend (Svelte 5 / TypeScript)          │  │
│  │                                                       │  │
│  │  ChatView ──► NativeWebSocketService ──► Tauri invoke()  │  │
│  │     │                    │                              │  │
│  │     ▼                    ▼                              │  │
│  │  Stores            protocol.ts (Typen)                  │  │
│  │  (chat, connection, settings)                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Tauri Core (Rust): Fenster + nativer WS-Transport     │  │
│  │  (tokio-tungstenite, TLS-Handling, Reconnect, Pairing) │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────┘
                               │  ws:// / wss://
                               ▼
                    ┌──────────────────────┐
                    │   Agent-Backend       │
                    │   (deine Implement.)  │
                    └──────────────────────┘
```

### Verbindungs-Lebenszyklus (Client-Seite)

1. App startet → Settings laden → `NativeWebSocketService.connect(serverUrl)`
2. Ruft `invoke("agodesk_connect", { config })` (mit optionalem `pinnedFingerprint`)
3. Rust-Layer übernimmt: TLS-Modus-Auswahl, Reconnect-Loop, Ping-Keepalive
4. Events über Tauri: `agodesk:connection-state` und `agodesk:message`
5. **Backend muss** `system.connected` senden (mit `session_id`)
6. User sendet `chat.message` → Input disabled bis Antwort
7. Backend antwortet mit `chat.response` oder `chat.error`
8. Bei Verbindungsverlust: Automatisches Reconnect mit Backoff (1s, 2s, 4s, 8s, 16s), max. 5 Versuche

---

## 4. Frontend-Komponenten

| Komponente | Pfad | Verantwortlichkeit |
|---|---|---|
| **App** | `src/App.svelte` | Root-Layout |
| **ChatView** | `src/lib/components/ChatView.svelte` | Orchestrierung: WS, Chat-Flow, Settings |
| **MessageList** | `src/lib/components/MessageList.svelte` | Scrollbare Nachrichtenliste, Auto-Scroll |
| **MessageBubble** | `src/lib/components/MessageBubble.svelte` | Einzelne Nachricht (user/assistant/system) |
| **InputBox** | `src/lib/components/InputBox.svelte` | Texteingabe, Enter=Senden, Shift+Enter=Zeilenumbruch |
| **StatusBar** | `src/lib/components/StatusBar.svelte` | Verbindungsstatus, Theme-Toggle, Reconnect |
| **SettingsModal** | `src/lib/components/SettingsModal.svelte` | Server-URL, Theme (System/Hell/Dunkel) |

### Services

| Service | Pfad | Verantwortlichkeit |
|---|---|---|
| **NativeWebSocketService** | `src/lib/services/websocket.ts` | Connect/Disconnect via Tauri Commands, Event-Listener für Rust-Events |
| **settings** | `src/lib/services/settings.ts` | Laden/Speichern via Tauri Store |
| **theme** | `src/lib/services/theme.ts` | CSS-Theme + Tauri `setTheme()` |

### Stores (Svelte)

| Store | Pfad | Inhalt |
|---|---|---|
| **chatMessages** | `src/lib/stores/chat.ts` | `ChatMessage[]`, Deduplizierung per `id` |
| **connectionStatus** | `src/lib/stores/connection.ts` | `connecting \| connected \| disconnected \| error` |
| **settings** | `src/lib/stores/settings.ts` | `{ serverUrl, theme }` |

---

## 5. WebSocket-Protokoll (Contract)

### 5.1 Grundregeln

- **Format:** JSON, UTF-8, WebSocket Text Frames
- **Envelope:** Jede Nachricht hat Pflichtfelder `id`, `type`, `timestamp`, `payload`
- **IDs:** UUID v4 (`crypto.randomUUID()`)
- **Timestamps:** ISO 8601 UTC (`2026-05-22T20:00:00.000Z`)
- **Korrelation:** Server antwortet mit `payload.request_id` = `id` der ursprünglichen `chat.message`
- **Discriminator:** Feld `type` bestimmt Payload-Schema
- **Erweiterbarkeit:** Neue `type`-Werte ohne Breaking Change möglich; unbekannte Typen werden ignoriert

### 5.2 Message-Typen — Übersicht

| type | Richtung | MVP-Status | Beschreibung |
|---|---|---|---|
| `system.connected` | Server → Client | **Pflicht** | Verbindungsbestätigung + Session |
| `chat.message` | Client → Server | **Pflicht** | User-Nachricht |
| `chat.response` | Server → Client | **Pflicht** | Vollständige Agent-Antwort |
| `chat.error` | Server → Client | **Empfohlen** | Fehler bei Verarbeitung |
| `system.ping` | Client → Server | **Aktiv** | Keepalive (alle 30s) |
| `system.pong` | Server → Client | **Empfohlen** | Keepalive-Antwort |
| `chat.response.chunk` | Server → Client | **Aktiv** | Streaming-Chunk |
| `session.start` | Client → Server | **Aktiv** | Pairing oder Reconnect |
| `session.accepted` | Server → Client | **Aktiv** | Auth OK, finale Session-ID |
| `session.clear` | Server → Client | **Aktiv** | Session-Reset: Chat leeren, neue `session_id` |

### 5.3 Envelope-Schema

```typescript
interface WsMessage<T = unknown> {
  id: string;          // UUID v4
  type: MessageType;
  timestamp: string;   // ISO 8601
  payload: T;
}
```

### 5.4 Nachrichten im Detail

#### Server → Client: `system.connected` (sofort nach Connect senden)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "system.connected",
  "timestamp": "2026-05-22T20:00:00.000Z",
  "payload": {
    "server_version": "1.0.0",
    "capabilities": ["streaming", "multi-session"],
    "session_id": "sess-abc123"
  }
}
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `server_version` | string | Backend-Versionsstring |
| `capabilities` | string[] | Unterstützte Features (informativ) |
| `session_id` | string | Session-ID für folgende `chat.message` |

**Client-Verhalten:** Speichert `session_id`, sendet sie in jeder `chat.message` mit.

---

#### Client → Server: `chat.message`

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "type": "chat.message",
  "timestamp": "2026-05-22T20:00:01.000Z",
  "payload": {
    "session_id": "sess-abc123",
    "text": "Was ist die Hauptstadt von Frankreich?",
    "role": "user"
  }
}
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `session_id` | string | Aus `system.connected` (kann leer sein vor Connect) |
| `text` | string | Nachrichtentext (Plaintext, kein Markdown im MVP) |
| `role` | `"user"` | Immer `"user"` |

**Client-Verhalten:** Zeigt Nachricht sofort im UI, deaktiviert Input bis Antwort.

---

#### Server → Client: `chat.response`

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "type": "chat.response",
  "timestamp": "2026-05-22T20:00:02.000Z",
  "payload": {
    "session_id": "sess-abc123",
    "request_id": "660e8400-e29b-41d4-a716-446655440001",
    "text": "Die Hauptstadt von Frankreich ist Paris.",
    "role": "assistant",
    "metadata": {
      "model": "gpt-4o",
      "token_count": 42
    }
  }
}
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `request_id` | string | **Pflicht** — `id` der `chat.message` |
| `text` | string | Vollständige Antwort (Plaintext im MVP) |
| `role` | `"assistant"` | Immer `"assistant"` |
| `metadata` | object? | Optional, z.B. Modell, Token-Count, Tool-Calls |

**Client-Verhalten:** Fügt Assistant-Nachricht hinzu, aktiviert Input wieder.

---

#### Server → Client: `chat.error`

```json
{
  "id": "880e8400-e29b-41d4-a716-446655440003",
  "type": "chat.error",
  "timestamp": "2026-05-22T20:00:02.000Z",
  "payload": {
    "request_id": "660e8400-e29b-41d4-a716-446655440001",
    "code": "AGENT_TIMEOUT",
    "message": "Agent hat nicht rechtzeitig geantwortet."
  }
}
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `request_id` | string? | Bezug zur Anfrage, falls bekannt |
| `code` | string | Maschinenlesbarer Fehlercode |
| `message` | string | Anzeige im UI als System-Nachricht |

**Empfohlene Error-Codes:** `AGENT_TIMEOUT`, `INVALID_MESSAGE`, `SESSION_NOT_FOUND`, `INTERNAL_ERROR`

---

#### Keepalive: `system.ping` / `system.pong`

Client sendet alle **30 Sekunden**:

```json
{
  "id": "...",
  "type": "system.ping",
  "timestamp": "...",
  "payload": {}
}
```

Server antwortet:

```json
{
  "id": "...",
  "type": "system.pong",
  "timestamp": "...",
  "payload": {}
}
```

---

#### `chat.response.chunk` — Streaming

```json
{
  "id": "...",
  "type": "chat.response.chunk",
  "timestamp": "...",
  "payload": {
    "session_id": "sess-abc123",
    "request_id": "660e8400-e29b-41d4-a716-446655440001",
    "delta": "Paris",
    "done": false
  }
}
```

Letzter Chunk: `"done": true`. Der Client hängt alle `delta`-Teile an dieselbe Assistant-Nachricht (`request_id`-Korrelation) und blendet die Tipp-Indikator-Animation aus, sobald der erste Chunk sichtbar ist.

Optional kann der Server stattdessen (oder zusätzlich nach Abschluss) ein vollständiges `chat.response` senden — der Client dedupliziert per `request_id`.

**Status:** Implementiert in agodesk (`chat-inbound.ts`, Mock: Chat-Befehl `/stream`).

---

#### `session.clear` — Session zurücksetzen (Server → Client)

```json
{
  "id": "...",
  "type": "session.clear",
  "timestamp": "...",
  "payload": {
    "session_id": "sess-new-abc",
    "reason": "Neuer Agent-Kontext",
    "clear_chat": true
  }
}
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `session_id` | string? | Neue Session-ID für folgende `chat.message` |
| `reason` | string? | Optionaler Hinweis in der Chat-UI |
| `clear_chat` | boolean? | Default `true`: Chat-Verlauf leeren |

**Client-Verhalten:** Leert Chat (optional), stoppt Desktop-Stream/Browser-Session, deaktiviert Remote-Control-Banner, setzt `session_id` wenn mitgeliefert.

**Mock:** Chat-Befehl `/newsession` oder Client → Server `session.clear` (Mock antwortet mit neuer Session).

**Status:** Implementiert in agodesk (`session-clear.ts`).

---

### 5.5 Sequenzdiagramm (Happy Path)

```
Client                              Backend
  │                                    │
  │────── WebSocket Connect ──────────►│
  │                                    │
  │◄──── system.connected ─────────────│
  │      { session_id: "sess-xyz" }    │
  │                                    │
  │────── chat.message ───────────────►│
  │      { text: "Hallo" }             │
  │                                    │
  │◄──── chat.response ────────────────│
  │      { request_id: "...",          │
  │        text: "Hallo! ..." }        │
  │                                    │
  │────── system.ping (alle 30s) ─────►│
  │◄──── system.pong ──────────────────│
```

---

## 6. Backend-Implementierungs-Checkliste

### Minimum Viable Backend

- [ ] WebSocket-Server auf `ws://localhost:8765` (oder konfigurierbar)
- [ ] Bei Connect: `system.connected` mit `session_id` senden
- [ ] `chat.message` empfangen und verarbeiten
- [ ] Mit `chat.response` antworten (`request_id` setzen!)
- [ ] Optional: `system.pong` auf `system.ping`
- [ ] Optional: `chat.error` bei Fehlern

### Referenz-Implementierung

Siehe `scripts/mock-server.mjs` — vollständig lauffähiger Minimal-Backend:

```powershell
npm run mock-server
```

Verhalten Mock:
- Echo-Antwort nach 600ms
- `/error` → `chat.error`
- `ping` → Antwort `"pong"`

---

## 7. Client-Verhalten (für Backend-Planung relevant)

| Verhalten | Details |
|---|---|
| **Eine Antwort pro Message** | Client wartet auf genau eine `chat.response` oder `chat.error` pro `chat.message` |
| **Input-Sperre** | Kein erneutes Senden während `pending=true` |
| **Deduplizierung** | Nachrichten mit gleicher `id` werden nicht doppelt angezeigt |
| **Reconnect** | Automatisch, 5 Versuche, Backoff; danach manueller Reconnect-Button |
| **Session-Persistenz** | Chat-History nur in-memory (bis App-Schließen) |
| **Settings-Persistenz** | `serverUrl`, `theme` überleben Neustart |
| **Ungültiges JSON** | Wird vom Client still ignoriert |
| **Unbekannte type-Werte** | Werden ignoriert |

---

## 8. Konfiguration & Endpoints

| Setting | Default | Persistiert | Beschreibung |
|---|---|---|---|
| `serverUrl` | `ws://localhost:8765` | Ja | WebSocket-URL des Backends |
| `theme` | `system` | Ja | UI-Theme (kein Backend-Bezug) |

**Tauri CSP erlaubt:** `connect-src ws: wss: http: https:`  
Backend kann lokal oder remote sein (`wss://` für Produktion empfohlen).

---

## 9. Geplante Erweiterungen (noch nicht im Client)

| Feature | Protokoll-Auswirkung | Priorität |
|---|---|---|
| Streaming | `chat.response.chunk` | v1.1 |
| Auth | API-Key im Handshake oder Header | v1.2 |
| Multi-Session | `session.start`, `session.clear` | v1.2 (session.clear in Client) |
| Tool-Call-Visualisierung | `metadata.tool_calls[]` in `chat.response` | v2.0 |
| Markdown/Code-Rendering | Kein Protokoll-Change, nur UI | v1.1 |
| Dateianhänge | Neuer Message-Typ nötig | v2.0 |

---

## 10. Projektstruktur (relevant für Integration)

```
agodesk/
├── src/
│   ├── lib/
│   │   ├── types/protocol.ts      ← Protokoll-Contract (TypeScript)
│   │   ├── services/websocket.ts    ← Client WS-Logik
│   │   ├── services/settings.ts
│   │   ├── stores/                  ← App-State
│   │   └── components/              ← UI
│   ├── App.svelte
│   └── main.ts
├── src-tauri/                       ← Rust/Tauri (kein WS)
├── scripts/mock-server.mjs          ← Referenz-Backend
└── docs/BACKEND_INTEGRATION.md      ← Dieses Dokument
```

---

## 11. Schnellstart für Backend-Entwicklung

```powershell
# Terminal 1: Mock-Backend (Referenz)
npm run mock-server

# Terminal 2: Desktop-Client
npm run tauri dev
```

Backend in beliebiger Sprache implementieren, solange das JSON-Protokoll eingehalten wird.  
Empfehlung: Zuerst gegen Mock testen, dann Mock durch echtes Agent-Backend ersetzen.

---

## 12. Offene Entscheidungen (Backend-Planung)

| # | Frage | Aktueller Stand | Empfehlung |
|---|---|---|---|
| 1 | Streaming sofort? | Client ignoriert Chunks | Backend kann senden, Client folgt in v1.1 |
| 2 | Auth-Strategie? | Keine | API-Key in `session.start` oder WS-Subprotocol |
| 3 | Session-Lifetime? | Pro WS-Verbindung | Backend vergibt `session_id` bei Connect |
| 4 | Mehrere parallele Anfragen? | Client blockiert Input | Backend sollte serial antworten (MVP) |
| 5 | Protokoll-Versionierung? | Über `capabilities` in `system.connected` | Feature-Flags statt Breaking Changes |
