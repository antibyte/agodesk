# agodesk Backend Protocol

This document is the backend contract for the agodesk desktop client.

**Computer-Use (AuraGo Agent):** See [AURAGO_COMPUTER_USE_AGENT.md](./AURAGO_COMPUTER_USE_AGENT.md) for capability negotiation, all desktop ops, frontend approval model, and agent loop. Reference types: [aurago/](./aurago/).

## WebSocket Endpoint

- URL: `/api/agodesk/ws`
- Transport: WebSocket text frames with JSON envelopes.
- Auth: the route bypasses browser session auth, but the socket performs its own pairing handshake.
- Development fallback: unauthenticated chat is only allowed for loopback clients that connect with `?insecure_loopback=1`.

Every frame uses this envelope:

```json
{
  "id": "uuid-or-client-message-id",
  "type": "message.type",
  "timestamp": "2026-05-24T12:00:00Z",
  "payload": {}
}
```

## Connection Flow

1. Client connects to `/api/agodesk/ws`.
2. Server immediately sends `system.connected`.
3. Production clients send `session.start` with either a one-time `pairing_token` or a stored `device_id` plus `shared_key_proof`.
4. Server replies with `session.accepted` or `chat.error`.
5. Chat is accepted only after pairing, except explicit loopback development mode.

## Message Types

- `system.connected`: server greeting with `protocol_version`, temporary `session_id` (not for chat), auth flags, and capabilities.
- `system.ping` / `system.pong`: keepalive.
- `session.start`: client pairing or reconnect request.
- `session.accepted`: server approval. Fresh pairing includes `shared_key` once so the client can store it securely. The returned `session_id` replaces the temporary ID from `system.connected` and must be used in every subsequent `chat.message`.
- `chat.message`: user prompt.
- `chat.response`: full assistant response with `request_id`.
- `chat.error`: machine-readable error.
- `chat.response.chunk`: streaming assistant tokens (`delta`, `done` per chunk).
- `session.clear`: server-initiated session reset; optional new `session_id`, clears chat by default.
- `desktop.command`: server-initiated desktop operation (screenshot, permission check, input).
- `desktop.result`: client response to a `desktop.command` correlated by `command_id`.

## Pairing

Fresh pairing:

- The user creates a Remote Control enrollment token in AuraGo.
- agodesk sends it as `payload.pairing_token` in `session.start`.
- AuraGo creates a RemoteHub device tagged `agodesk` and `desktop-client`.
- AuraGo stores the generated shared key in the Vault under `remote_shared_key_<device_id>`.
- `session.accepted.shared_key` is returned only on fresh pairing.

Reconnect:

- agodesk sends `device_id` and `shared_key_proof`.
- `shared_key_proof` is an object with `nonce`, `timestamp`, and `hmac` (hex HMAC-SHA256).
- The proof is an HMAC-SHA256 over the `session.start` envelope id, device id, nonce, and proof timestamp.
- AuraGo verifies the proof with the Vault-stored shared key.
- Reconnect responses never echo the shared key.

Example reconnect payload:

```json
{
  "device_id": "dev-abc123",
  "shared_key_proof": {
    "nonce": "uuid",
    "timestamp": "2026-05-24T12:00:00.000Z",
    "hmac": "hex-hmac-sha256"
  }
}
```

Proof format (matches AuraGo `signSharedKeyProof`):

```
material =
  "agodesk.v1" +
  "\nsession.start\n" +
  envelope_id +
  "\n" +
  device_id +
  "\n" +
  nonce +
  "\n" +
  timestamp
hmac = hex(HMAC_SHA256(shared_key_bytes, material))
```

`shared_key_bytes`: valid hex string is decoded; otherwise the raw UTF-8 string is used as key material.

## Desktop Client Requirements

- Store `device_id` persistently.
- Store `shared_key` in OS keychain or secure Tauri storage when available.
- Never print the shared key in logs or UI.
- Send `session.start` automatically after `system.connected` when paired.
- Block chat input until `session.accepted` in production mode.
- Implement native Tauri commands for desktop control:
  - `collect_host_info()`
  - `list_displays()`
  - `list_windows()`
  - `capture_screen({ display_id?, window_id?, format, quality })`
  - `control_permission_status()`
  - `inject_input(event)` only during an approved local control session.
  - `set_input_approval(approved)` / `reset_desktop_session()`
- Display a visible local remote-control banner with approve, deny, and stop controls before allowing input injection.

## Desktop Control (AuraGo v1)

The server sends desktop work as a WebSocket envelope:

```json
{
  "id": "server-envelope-id",
  "type": "desktop.command",
  "timestamp": "2026-05-25T12:00:00Z",
  "payload": {
    "command_id": "cmd-uuid",
    "operation": "desktop_screenshot",
    "params": {}
  }
}
```

The client replies with `desktop.result` using the same `command_id`:

```json
{
  "id": "client-envelope-id",
  "type": "desktop.result",
  "timestamp": "2026-05-25T12:00:00Z",
  "payload": {
    "command_id": "cmd-uuid",
    "success": true,
    "data": {},
    "error": null,
    "error_code": null
  }
}
```

### Supported operations (v1)

| Operation | Approval required | Notes |
|---|---|---|
| `desktop_screenshot` | No | Monitor or window capture |
| `desktop_permission_request` | No | Returns local permission status; shows approval banner |
| `desktop_input` | **Yes (local banner)** | Mouse, keyboard, scroll, drag, key combos via enigo |
| `desktop_list_displays` | No | Requires `desktopControlEnabled` setting |
| `desktop_list_windows` | No | Includes monitor assignment |
| `desktop_active_window` | No | Focus window: title, process, bounds, `display_id` |
| `desktop_host_info` | No | OS, hostname, monitors summary |
| `desktop_ui_tree` | No | Accessibility tree for root or `window_id` |
| `desktop_ui_action` | **Yes (local banner)** | Semantic click, set_value, focus on `element_id` |
| `desktop_browser_connect` | No | Requires `browserControlEnabled` setting |
| `desktop_browser_list_tabs` | No | List CDP targets/tabs |
| `desktop_browser_snapshot` | No | DOM/text snapshot; optional CDP screenshot |
| `desktop_browser_action` | **Yes (local banner)** | Click/fill/tab actions via CDP |
| `desktop_browser_disconnect` | No | End browser session; kills auto-launched process |
| `desktop_stream_start` | No | Starts periodic JPEG/PNG capture; frames as `desktop.stream.frame` |
| `desktop_stream_stop` | No | Stops active stream |

Desktop commands require an accepted session (`session.accepted` or loopback dev mode). Otherwise the client returns `SESSION_NOT_ACCEPTED`.

In AuraGo production, the paired agodesk device must also be **approved** in the Remote Control admin UI. Until then the agent responds with `device is not approved` and will not send `desktop.command` frames.

`desktop.result` includes `session_id` and `device_id` when available. Screenshots default to JPEG (quality 75) to keep WebSocket payloads small.

### Error codes (`desktop.result.error_code`)

| Code | When |
|---|---|
| `SESSION_NOT_ACCEPTED` | Command before pairing/session acceptance |
| `DESKTOP_SESSION_NOT_APPROVED` | Screenshot/input before local banner approval |
| `DESKTOP_INPUT_DENIED` | User denied the remote-control banner |
| `DESKTOP_STREAM_UNSUPPORTED` | Stream start/stop requested |
| `DESKTOP_OPERATION_UNSUPPORTED` | Unknown operation |
| `DESKTOP_COMMAND_INVALID` | Malformed `desktop.command` payload |
| `DESKTOP_UI_UNAVAILABLE` | UI automation not available on this platform |
| `DESKTOP_ELEMENT_NOT_FOUND` | `element_id` not found in UI tree |
| `DESKTOP_ACCESSIBILITY_DENIED` | Accessibility permission denied |
| `DESKTOP_BROWSER_UNAVAILABLE` | Browser CDP not available or not enabled |

Payload fields accept snake_case and camelCase (`command_id` / `commandId`, `display_id` / `displayId`, …).

Screenshots and UI trees do not require user approval. Input injection, UI actions, and browser actions require explicit local approval via the remote-control banner.

### Session capabilities (`session.start`)

When desktop control is enabled, agodesk advertises:

- `remote.desktop.capture`
- `remote.desktop.permission_request`
- `remote.desktop.input`
- `remote.desktop.discovery` — list displays/windows, active window, host info
- `remote.desktop.ui_automation` — UI tree and semantic actions

When browser control is additionally enabled:

- `remote.desktop.browser` — CDP connect, snapshot, action, disconnect

Capture a specific monitor in multi-monitor setups with `display_id` from `list_displays()`:

```json
{
  "display_id": "display-1",
  "format": "png",
  "quality": 80
}
```

Capture a single window (includes the monitor it is on in `list_windows()`):

```json
{
  "window_id": "win-12345678",
  "format": "jpeg",
  "quality": 85
}
```

Omit `display_id` to capture the primary monitor.

### Window list (`list_windows`)

Each entry includes monitor assignment:

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

Monitors from `list_displays()` are sorted top-to-bottom, left-to-right and use stable ids `display-0`, `display-1`, …

### Screenshot result (`desktop.result.data`)

```json
{
  "source": "display",
  "display_id": "display-0",
  "format": "png",
  "width": 1920,
  "height": 1080,
  "scale_factor": 1.0,
  "mime": "image/png",
  "data_base64": "..."
}
```

Window captures set `"source": "window"` and include `window_id`.

### Input events (`desktop_input`)

`params.kind` values:

| kind | payload |
|---|---|
| `mouse_move` | `{ "x": 100, "y": 200, "absolute": true }` |
| `mouse_click` | `{ "x": 100, "y": 200, "button": "left", "action": "click" }` |
| `mouse_scroll` | `{ "x": 100, "y": 200, "delta_x": 0, "delta_y": -120 }` |
| `mouse_drag` | `{ "x": 100, "y": 200, "end_x": 300, "end_y": 400, "button": "left" }` |
| `key_combo` | `{ "keys": ["ctrl", "c"] }` |
| `key_down` / `key_up` | `{ "key": "enter" }` or `{ "code": 65 }` |
| `text` | `{ "text": "Hello" }` |

Input is blocked until the user approves remote control locally.

### UI automation (`desktop_ui_tree` / `desktop_ui_action`)

`desktop_ui_tree` returns a normalized accessibility tree:

```json
{
  "window_id": "win-12345",
  "root": {
    "id": "elem-0",
    "role": "Window",
    "name": "VS Code",
    "bounds": { "x": 0, "y": 0, "width": 1920, "height": 1080 },
    "children": [],
    "interactive": true
  },
  "truncated": false,
  "element_count": 142
}
```

`desktop_ui_action` params: `{ "element_id": "elem-42", "action": "click" | "set_value" | "focus", "value": "..." }`

Recommended agent sequence: `desktop_active_window` → `desktop_ui_tree` → plan → `desktop_ui_action` or `desktop_input` → `desktop_screenshot` for verification.

## Planned Remote Operations

The RemoteHub command protocol also reserves stream operations for future clients:

- `desktop_stream_start`
- `desktop_stream_stop`

agodesk v1 implements screenshot, permission, input, discovery, UI automation, and optional browser CDP.

## Client Implementation Map

| Requirement | Implementation |
|---|---|
| Protocol types | `src/lib/types/protocol.ts` |
| WebSocket client | `src/lib/services/websocket.ts` |
| Pairing + HMAC proof | `src/lib/services/pairing.ts` |
| Session orchestration | `src/lib/services/session-flow.ts` |
| `device_id` storage | `src/lib/services/credentials.ts` + Tauri Store |
| `shared_key` storage | OS keychain via Rust `store_shared_key` |
| Pairing UI | `src/lib/components/PairingBanner.svelte` |
| Remote-control banner | `src/lib/components/RemoteControlBanner.svelte` |
| Desktop WS flow | `src/lib/services/desktop-flow.ts`, `src/lib/services/desktop.ts` |
| Desktop native API | `src-tauri/src/desktop/`, `src-tauri/src/computer_use/` |
| Sidecar worker (optional) | `src-tauri/src/bin/agodesk_worker.rs` |
| Mock backend | `scripts/mock-server.mjs` on `ws://localhost:8080/api/agodesk/ws` |

## Local Development

```powershell
npm run mock-server
npm run tauri dev
```

Loopback dev URL (default):

`ws://localhost:8080/api/agodesk/ws?insecure_loopback=1`

Production-style pairing test:

1. Remove `?insecure_loopback=1` from the server URL.
2. Enter any non-empty token in the pairing banner.
3. Mock server accepts the token and returns `session.accepted` with a one-time `shared_key`.
