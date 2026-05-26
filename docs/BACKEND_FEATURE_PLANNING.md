# agodesk — Feature-Liste für Backend-Protokoll-Planung

Dieses Dokument fasst **neue Client-Fähigkeiten** zusammen, die der AuraGo/Backend-Coding-Agent für die WebSocket-Protokoll-Planung berücksichtigen soll.

**Stand Client:** `0.1.0`  
**Protokoll-Version:** `agodesk.v1`  
**Endpoint:** `wss://<host>:<port>/api/agodesk/ws`  
**Referenz (Detail):** `docs/BACKEND_PROTOCOL.md`, Typen in `src/lib/types/protocol.ts`

> **Hinweis:** Der WebSocket-Transport läuft vollständig im Rust-Backend (`src-tauri/src/ws/`). Frontend kommuniziert über Tauri Commands (`agodesk_connect`, `agodesk_send`, `agodesk_disconnect`).

---

## 1. Transport & Verbindung

| Feature | Client-Status | Backend-Aufgabe |
|---|---|---|
| Native WSS (Rust/Tauri, nicht Browser-WebSocket) | Implementiert | TLS auf AuraGo-Seite; Self-Signed-Zertifikate im LAN |
| Zertifikat-Pinning (Fingerprint SHA-256) | Implementiert | Kein Protokoll-Impact; TLS-Layer |
| `system.connected` sofort nach Connect | Erwartet | Pflicht-Nachricht mit Auth-Flags |
| Keepalive `system.ping` / `system.pong` (30 s) | Implementiert | `system.pong` antworten |
| Reconnect mit Backoff | Implementiert | Session-Logik serverseitig definieren |

---

## 2. Session & Pairing

### 2.1 Zwei Session-IDs (wichtig)

| Phase | `session_id`-Quelle | Für Chat? |
|---|---|---|
| `system.connected` | temporär | **Nein** |
| `session.accepted` | autoritativ | **Ja** |

**Backend-Regel:** Jede `chat.message` muss `payload.session_id` = `session.accepted.payload.session_id` verwenden — nicht die ID aus `system.connected`.

### 2.2 Pairing (Erstverbindung)

**Client → Server:** `session.start`

```json
{
  "pairing_token": "<Remote-Control-Enrollment-Token>"
}
```

**Server → Client:** `session.accepted`

```json
{
  "session_id": "sess-final-…",
  "device_id": "dev-…",
  "shared_key": "<einmalig, nur bei Erst-Pairing>"
}
```

- Feldnamen: snake_case **oder** camelCase (`sessionId`, `deviceId`, `sharedKey`) — Client normalisiert beides.
- `shared_key` wird clientseitig in OS-Keychain + Datei-Fallback gespeichert.
- Pairing-Token wird nach erfolgreichem Speichern des Shared Key gelöscht.

### 2.3 Reconnect (ohne Token)

**Client → Server:** `session.start`

```json
{
  "device_id": "dev-…",
  "shared_key_proof": {
    "nonce": "<uuid>",
    "timestamp": "<ISO-8601>",
    "hmac": "<hex>"
  }
}
```

**HMAC-Material** (identisch zu AuraGo `signSharedKeyProof`):

```
agodesk.v1\nsession.start\n{envelope_id}\n{device_id}\n{nonce}\n{timestamp}
```

- Kein abschließender Newline nach `timestamp`.
- Key: gültiges Hex → dekodiert, sonst UTF-8-Rohstring.

**Server → Client:** `session.accepted` **ohne** `shared_key`, **mit** neuer `session_id`.

### 2.4 Fehler

Bei Pairing/Reconnect-Fehlern: `chat.error` mit Codes wie `SESSION_*`, `AUTH_FAILED`.

---

## 3. Chat

| Feature | Client-Status | Backend-Aufgabe |
|---|---|---|
| `chat.message` nach `session.accepted` | Implementiert | Nur akzeptierte Session verarbeiten |
| `payload.session_id` aus `session.accepted` | Erzwungen | Session validieren |
| `chat.response` mit `request_id` | Implementiert | Korrelation zu `chat.message.id` |
| `chat.error` | Implementiert | Maschinenlesbare `code` + `message` |
| `chat.response.chunk` (Streaming) | Typ definiert, **nicht verarbeitet** | Optional v1.1 |

---

## 4. Desktop Control (neu — clientseitig bereit)

Der Client kann native Desktop-Operationen ausführen. **WebSocket-Anbindung ist vorbereitet** (`desktop.command` → native API → `desktop.result`), Backend muss Commands senden und Results auswerten.

### 4.1 Capabilities

In `system.connected.payload.capabilities` erwartet der Client u. a.:

```json
["desktop_screenshot", "desktop_input", "streaming"]
```

Backend sollte Capabilities senden, damit der Agent weiß, was der Client kann.

### 4.2 Operationen

| Operation | Client native | Approval nötig? | `desktop.result` |
|---|---|---|---|
| `desktop_screenshot` | Ja | Nein | Bild als Base64 |
| `desktop_permission_request` | Ja | Nein | Permission-Status |
| `desktop_input` | Ja | **Ja (lokal)** | Erfolg/Fehler |
| `desktop_stream_start` | Nein (Stub) | Nein | Status only |
| `desktop_stream_stop` | Nein (Stub) | Nein | Status only |

### 4.3 `desktop.command` — Screenshot Monitor

```json
{
  "command_id": "cmd-uuid",
  "operation": "desktop_screenshot",
  "params": {
    "display_id": "display-1",
    "format": "png",
    "quality": 80
  }
}
```

- `display_id` aus Client-Monitorliste (`display-0`, `display-1`, …).
- Ohne `display_id` → primärer Monitor.
- Multi-Monitor: Monitore sortiert oben→unten, links→rechts.

### 4.4 `desktop.command` — Screenshot Fenster

```json
{
  "command_id": "cmd-uuid",
  "operation": "desktop_screenshot",
  "params": {
    "window_id": "win-12345678",
    "format": "jpeg",
    "quality": 85
  }
}
```

- `window_id` = HWND-basiert (`win-<handle>`).
- Fenster-Capture erfasst den **sichtbaren** Bildschirmbereich des Fensters.

### 4.5 `desktop.result.data` — Screenshot

```json
{
  "source": "display",
  "display_id": "display-1",
  "window_id": null,
  "format": "png",
  "width": 1920,
  "height": 1080,
  "scale_factor": 1.25,
  "mime": "image/png",
  "data_base64": "…"
}
```

### 4.6 Fenster- & Monitor-Metadaten (für Agent-Planung)

**Backend kann indirekt darauf zugreifen**, indem es den Client per Command nutzt. Direkte WS-Nachrichten `list_displays` / `list_windows` existieren **noch nicht** — Option für v1.1:

| Geplante Operation (Vorschlag) | Zweck |
|---|---|
| `desktop_list_displays` | Monitor-Liste für Agent |
| `desktop_list_windows` | Fenster inkl. Monitor-Zuordnung |

**Aktuell:** Agent muss über `desktop_screenshot` + bekannte IDs arbeiten **oder** Backend führt Discovery über neue Operations ein.

**WindowInfo-Schema** (wenn Discovery-Protokoll kommt):

```json
{
  "id": "win-12345678",
  "title": "Notepad",
  "class_name": "Notepad",
  "width": 800,
  "height": 600,
  "x": 1920,
  "y": 0,
  "visible": true,
  "display_id": "display-1",
  "display_name": "\\\\.\\DISPLAY2",
  "monitor_index": 1
}
```

**DisplayInfo-Schema:**

```json
{
  "id": "display-0",
  "index": 0,
  "name": "\\\\.\\DISPLAY1",
  "width": 1920,
  "height": 1080,
  "x": 0,
  "y": 0,
  "primary": true,
  "scale_factor": 1.0
}
```

### 4.7 `desktop.command` — Input

```json
{
  "command_id": "cmd-uuid",
  "operation": "desktop_input",
  "params": {
    "kind": "mouse_click",
    "x": 500,
    "y": 300,
    "button": "left",
    "action": "click"
  }
}
```

| `kind` | `params` |
|---|---|
| `mouse_move` | `x`, `y`, `absolute` (default `true`) |
| `mouse_click` | `x`, `y`, `button`, `action` (`click`/`down`/`up`) |
| `key_down` / `key_up` | `key` oder `code` (VK) |
| `text` | `text` |

- Koordinaten: **virtueller Desktop** (Multi-Monitor-kompatibel).
- Wird **blockiert**, bis User im Client Remote-Control-Banner freigibt.
- Backend sollte bei Ablehnung `desktop.result.error` erwarten.

### 4.8 `desktop.command` — Permission

```json
{
  "command_id": "cmd-uuid",
  "operation": "desktop_permission_request",
  "params": {}
}
```

**Result:**

```json
{
  "screen_capture": true,
  "input_injection": false,
  "approved_session": false
}
```

### 4.9 `desktop.result` (Antwort-Envelope)

```json
{
  "command_id": "cmd-uuid",
  "success": true,
  "data": { },
  "error": null
}
```

---

## 5. Sicherheitsmodell (Backend beachten)

| Aktion | TLS | Pairing | Lokale User-Freigabe |
|---|---|---|---|
| WebSocket Connect | Ja | — | — |
| Chat | Ja | Session accepted | — |
| Screenshot | Ja | Session accepted | Nein |
| Maus/Tastatur | Ja | Session accepted | **Ja (Banner)** |

- Shared Key nie in Logs/UI.
- Input-Approval wird bei Reconnect zurückgesetzt.
- Screenshots ohne Banner; Input nur nach expliziter Freigabe.

---

## 6. Host-Info (optional, noch nicht über WS)

Native API vorhanden (`collect_host_info`), **kein** `desktop.command`-Mapping yet:

```json
{
  "hostname": "DESKTOP-ABC",
  "platform": "windows",
  "arch": "x86_64"
}
```

**Vorschlag Backend:** Operation `desktop_host_info` oder Feld in `system.connected`.

---

## 7. Noch nicht implementiert (Client)

| Feature | Status | Protokoll-Impact |
|---|---|---|
| `desktop_stream_start/stop` | Stub | Backend-Spec für Stream-Frames offen |
| `list_displays` / `list_windows` über WS | Nur native API | Neue `desktop.command`-Ops empfohlen |
| `chat.response.chunk` | Typ only | Streaming-Antworten |
| `session.clear` | Typ only | Session-Reset serverseitig |
| `collect_host_info` über WS | Native only | Optional neue Operation |
| Input-Queue nach Banner-Approve | Blockierte Commands verworfen | Backend soll `desktop_input` ggf. wiederholen |

---

## 8. Empfohlene Backend-Implementierungsreihenfolge

1. **`system.connected`** mit `protocol_version`, `pairing_required`, `capabilities`, temporärer `session_id`
2. **Pairing + Reconnect** (`session.start` / `session.accepted`) inkl. `SharedKeyProof`-Struct
3. **Session-ID-Regel** für `chat.message` (nur `session.accepted`-ID)
4. **`desktop.command` → `desktop.result`** für `desktop_screenshot` (Monitor + Fenster)
5. **`desktop_permission_request`** vor Input-Sequenzen
6. **`desktop_input`** mit Retry nach User-Freigabe
7. **Optional:** `desktop_list_displays`, `desktop_list_windows` (Discovery)
8. **Optional:** Streaming-Spec (`desktop_stream_*`, `chat.response.chunk`)

---

## 9. Offene Protokoll-Fragen für Backend

1. **Discovery:** Eigene WS-Ops für `list_displays`/`list_windows` oder Agent-seitige ID-Verwaltung?
2. **Screenshot-Größe:** Max. Base64-Größe / Chunking / externe URL statt Inline-Base64?
3. **Stream-Format:** MJPEG über WS, separater Channel, oder chunked `desktop.result`?
4. **Session-Lifetime:** Gültigkeit der `session.accepted.session_id` über Reconnects hinweg?
5. **Fehlercodes:** Vollständige Liste für `SESSION_*`, `DESKTOP_*`, `AUTH_*`?
6. **Rate Limits:** Screenshots/Input pro Session?
7. **Multi-Client:** Mehrere agodesk-Instanzen pro `device_id`?

---

## 10. Nachrichten-Übersicht (Quick Reference)

| type | Richtung | Zweck |
|---|---|---|
| `system.connected` | S → C | Connect, Capabilities, temp. Session |
| `system.ping` / `system.pong` | C ↔ S | Keepalive |
| `session.start` | C → S | Pairing oder Reconnect |
| `session.accepted` | S → C | Auth OK, finale Session-ID |
| `chat.message` | C → S | User-Prompt |
| `chat.response` | S → C | Agent-Antwort |
| `chat.error` | S → C | Fehler |
| `desktop.command` | S → C | Screenshot, Input, Permission |
| `desktop.result` | C → S | Ergebnis nativer Operation |
| `session.clear` | S → C | *Geplant* |
| `chat.response.chunk` | S → C | *Geplant* |

**Legende:** S = Server (AuraGo), C = Client (agodesk)

---

## 11. Test-Setup

```powershell
# Mock-Backend (Pairing, Chat, basic desktop)
npm run mock-server

# Client mit nativem WSS
npm run tauri dev
```

Produktion: `wss://192.168.x.x:8443/api/agodesk/ws` (Zertifikat-Pinning im Client-UI).
