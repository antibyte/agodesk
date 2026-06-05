# agodesk

Plattformunabhängiger Desktop-Chat-Client für agentic Frameworks. Verbindet sich per WebSocket mit einem Backend und bietet ein einfaches Chat-Interface.

## Voraussetzungen

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install)
- Windows: [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

## Entwicklung

```powershell
npm install --strict-ssl=false
npm run tauri dev
```

Falls Cargo wegen SSL/Zertifikatsprüfung fehlschlägt, liegt unter `.cargo/config.toml` bereits `check-revoke = false` als Workaround.

### Mock-Backend zum Testen

In einem zweiten Terminal:

```powershell
npm run mock-server
```

Der Mock-Backend lauscht auf `ws://localhost:8080/api/agodesk/ws`.

- Loopback-Dev (Default): `ws://localhost:8080/api/agodesk/ws?insecure_loopback=1`
- Pairing-Test: Query-Parameter entfernen und Token im Pairing-Banner eingeben

Protokoll-Details: [docs/BACKEND_PROTOCOL.md](docs/BACKEND_PROTOCOL.md)  
AuraGo Computer-Use Integration: [docs/AURAGO_COMPUTER_USE_AGENT.md](docs/AURAGO_COMPUTER_USE_AGENT.md)

## Build

```powershell
# Standard (produces nsis + msi on Windows)
npm run tauri build

# Recommended for the classic Windows "setup.exe" installer (NSIS):
npm run build:win
# or the helper:
# .\scripts\build-windows-installer.ps1
```

Der klassische Windows-Installer (NSIS-Setup.exe mit Wizard, Shortcuts, Deinstallations-Eintrag) liegt unter:

`src-tauri/target/release/bundle/nsis/agodesk_<version>_x64-setup.exe`

Auf der Finish-Seite des Installers gibt es eine Checkbox **"Run agodesk"** (optionaler Start nach der Installation) sowie eine Option für einen Desktop-Shortcut.

Zusätzlich:
- Der Installer erstellt **immer ein Desktop-Icon** (CreateShortcut im Post-Install-Hook).
- Während der Installation wird per **MessageBox** angeboten, ob agodesk **automatisch beim Systemstart** (Windows Run-Registry) gestartet werden soll. In Silent/ Passive-Modus wird Auto-Start standardmäßig aktiviert.

Die Deinstallation entfernt den Auto-Start-Eintrag (bereits im Template unterstützt) und optional App-Daten.

**Optional Branding für Installer (NSIS):**  
Für Header (150x57) / Sidebar (164x314) Bitmaps kannst du Assets unter `src-tauri/icons/` ablegen und in `tauri.conf.json` unter `bundle.windows.nsis.headerImage` / `sidebarImage` referenzieren. Aktuell werden Defaults + `icon.ico` genutzt. (Siehe Tauri NsisConfig in der CLI schema.)

### Mit Sidecar (computer-use)
Der `build:win*` Befehl aktiviert automatisch das Feature und bundled den `agodesk-worker` (wird neben der Haupt-EXE installiert, für `sidecar_enabled()`).

MSI (für Enterprise) wird bei `targets: "all"` ebenfalls erzeugt, liegt unter `bundle/msi/`.

Voraussetzungen siehe oben (inkl. MS C++ Build Tools auf Windows).

## Konfiguration

Standard-WebSocket-URL: `ws://localhost:8080/api/agodesk/ws?insecure_loopback=1`

Die URL kann in den Einstellungen geändert werden und wird lokal persistiert.

## WebSocket-Protokoll

Alle Nachrichten sind JSON-Objekte mit `id`, `type`, `timestamp` und `payload`.

### Client → Server

**chat.message**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "chat.message",
  "timestamp": "2026-05-22T20:00:00Z",
  "payload": {
    "session_id": "sess-abc123",
    "text": "Hallo Agent!",
    "role": "user"
  }
}
```

### Server → Client

**system.connected** (nach Verbindungsaufbau)
```json
{
  "id": "...",
  "type": "system.connected",
  "timestamp": "2026-05-22T20:00:00Z",
  "payload": {
    "server_version": "0.1.0",
    "capabilities": ["streaming"],
    "session_id": "sess-abc123"
  }
}
```

**chat.response**
```json
{
  "id": "...",
  "type": "chat.response",
  "timestamp": "2026-05-22T20:00:01Z",
  "payload": {
    "session_id": "sess-abc123",
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "text": "Hallo! Wie kann ich helfen?",
    "role": "assistant"
  }
}
```

**chat.error**
```json
{
  "id": "...",
  "type": "chat.error",
  "timestamp": "2026-05-22T20:00:01Z",
  "payload": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "code": "AGENT_TIMEOUT",
    "message": "Agent hat nicht rechtzeitig geantwortet."
  }
}
```

## Projektstruktur

```
src/                  Svelte-Frontend
src-tauri/            Tauri/Rust-Backend
src/lib/components/   UI-Komponenten
src/lib/services/     WebSocket, Settings
src/lib/stores/       Svelte Stores
src/lib/types/        Protokoll-Typen
```
