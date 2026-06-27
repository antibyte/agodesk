# agodesk

Plattformunabhängiger Desktop-Chat-Client für agentic Frameworks. Verbindet sich per WebSocket mit einem Backend und bietet ein einfaches Chat-Interface.

## Voraussetzungen

- [Node.js](https://nodejs.org/) 22+ (siehe `.nvmrc`)
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
# Standard (produces nsis + msi on Windows; on Linux: deb/appimage/rpm)
npm run tauri build

# Recommended for the classic Windows "setup.exe" installer (NSIS):
npm run build:win
# or the helper:
# .\scripts\build-windows-installer.ps1

# For Linux (.deb + .AppImage + .rpm):
npm run build:linux
# or the helper (on Linux):
# bash scripts/build-linux-installer.sh
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

### Für Linux
Auf einem Linux-System (empfohlen: Ubuntu 22.04 als Build-Basis für glibc-Kompatibilität) oder im CI:

```bash
# Empfohlen für .deb + .AppImage + .rpm:
npm run build:linux
# oder der Helper:
# bash scripts/build-linux-installer.sh
# (mit --clean zum Säubern von target/)
```

Die Pakete liegen unter:
- `src-tauri/target/release/bundle/deb/agodesk_<version>_amd64.deb`
- `src-tauri/target/release/bundle/appimage/agodesk_<version>_amd64.AppImage`
- `src-tauri/target/release/bundle/rpm/agodesk-<version>-1.x86_64.rpm`

**Verwendung:**
- Debian/Ubuntu: `sudo dpkg -i <deb>` (danach evtl. `sudo apt -f install`)
- AppImage (portabel, keine Installation): `chmod +x <AppImage> && ./<AppImage>` (manchmal libfuse2 oder fuse3 nötig)
- Fedora/RHEL/SUSE: `sudo rpm -i <rpm>`

Tauri legt automatisch einen Desktop-Eintrag (`/usr/share/applications/agodesk.desktop`) und das Icon an. Das Programm erscheint im Menü.

**Autostart (Linux-Äquivalent zum Windows Run-Eintrag):**
Das `postinst`-Skript legt standardmäßig eine Kopie in `/etc/xdg/autostart/agodesk.desktop` ab (systemweit "beim Login starten", analog zum Silent/Default-Verhalten unter Windows). Zum Deaktivieren einfach die Datei löschen:
```bash
sudo rm /etc/xdg/autostart/agodesk.desktop
```
Oder für den aktuellen User: `rm ~/.config/autostart/agodesk.desktop` (nach Neulogin wirksam).

**Hinweise:**
- Der Build-Script/CI muss auf Linux (oder kompatiblem Runner) ausgeführt werden. Cross-Compile von Windows aus wird im einfachen Script nicht unterstützt (für CI immer Ubuntu-Runner verwenden).
- AppImage ist selbst-contained und benötigt keine Root-Rechte.
- Der Sidecar `agodesk-worker` wird mitgebundelt (für computer-use Features).

Voraussetzungen (Build-Dependencies auf Ubuntu/Debian):
```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  build-essential \
  libssl-dev \
  file \
  libx11-dev libxcb1-dev libatspi2.0-dev
```
(Ähnlich auf anderen Distros; siehe Tauri Docs für Fedora etc.)

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
