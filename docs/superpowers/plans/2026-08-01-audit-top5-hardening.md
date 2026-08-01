# Audit Top-5 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pragmatisch die Audit-Top-5 umsetzen: Speech-Cleanup, Screenshot-Banner, Asset-SSRF+Allowlist, Asset-TLS System-default, Capture/Input-TTL + open_external_url Allowlist.

**Architecture:** Thin Defense Layer an bestehenden Hotspots (kein globales Session-Token). Spec: `docs/superpowers/specs/2026-08-01-audit-top5-hardening-design.md`.

**Tech Stack:** Tauri 2 / Rust, Svelte 5 / TypeScript, bestehende Unit-Tests (node:test + cargo test).

## Global Constraints

- Keine destruktiven Git-Befehle; Working Tree heilig.
- Commits nur auf explizite User-Anfrage.
- TDD: failing test → implement → green.
- Keine Scope-Creep (Non-goals der Spec).

---

### Task 1: Q1 — Speech stop on `system.connected`

**Files:**
- Modify: `src/lib/services/chat-ws-inbound.ts`
- Create/Modify: helper + test under `src/lib/services/` (prefer extract `runSystemConnectedCleanup` if needed for testability)

- [x] Write failing test that cleanup stops speech
- [x] Implement `stopSpeechSession` call before `sessionState.reset()`
- [x] Verify tests pass

### Task 2: S2 — Screenshot/stream remote-control banner

**Files:**
- Modify: `src/lib/types/protocol.ts` (`requiresRemoteControlBanner`)
- Modify: `src/lib/types/protocol.test.ts`

- [x] Update tests: banner true for screenshot/stream; approval still false
- [x] Implement banner inclusion
- [x] Verify `protocol.test.ts` passes

### Task 3: S1 — Capture approval + input TTL (Rust)

**Files:**
- Modify: `src-tauri/src/desktop/permission.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs` (register command if new)
- Modify: `src-tauri/permissions/agodesk-commands.toml`
- Modify: `src/lib/services/desktop.ts`
- Modify: `src/lib/types/protocol.ts` (`DESKTOP_CAPTURE_NOT_APPROVED`)

- [x] Failing Rust tests for TTL + capture gate
- [x] Implement approval state + 60s TTL + capture_screen check
- [x] Wire TS `setScreenCaptureApproval` before capture/stream
- [x] Map desktop failures to `DESKTOP_CAPTURE_NOT_APPROVED`
- [x] `cargo test` permission + `npm test` protocol/desktop as needed

### Task 4: S1 — `open_external_url` scheme allowlist

**Files:**
- Modify: `src-tauri/src/commands.rs` (or small helper + unit tests)

- [x] Failing tests for allow/deny schemes
- [x] Implement allowlist `https`/`http`/`mailto`
- [x] `cargo test` green

### Task 5: S4 — Asset TLS System without pin

**Files:**
- Modify: `src-tauri/src/ws/tls.rs` (+ existing tests)

- [x] Change tests: LAN/Tailscale without pin → `System`
- [x] Implement `determine_asset_tls_mode` change
- [x] `cargo test` tls module green

### Task 6: S3 — Asset origin + allowlist

**Files:**
- Modify: `src-tauri/src/ws/asset_fetch.rs`
- Modify: `src-tauri/src/ws/transport.rs` (`allowed_origins` arg)
- Modify: `src/lib/services/server-asset-fetch.ts`
- Modify: `src/lib/types/protocol.ts` (`assetFetchAllowedOrigins`)
- Modify: settings load/normalize + Settings UI + i18n de/en

- [x] Failing Rust origin/redirect/allowlist tests
- [x] Implement origin check + redirect re-check
- [x] Pass allowlist from settings through invoke
- [x] Settings field + minimal UI
- [x] `cargo test` + relevant npm tests

### Task 7: Verification

- [x] `npm run check`
- [x] `cargo check` / targeted `cargo test`
- [x] `npm test` (or targeted suites)
- [ ] Update audit canvas status note optional
