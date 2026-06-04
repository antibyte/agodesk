import test from "node:test";
import assert from "node:assert/strict";
import {
  agodeskClientCapabilities,
  AGODESK_BASE_CAPABILITIES,
  AGODESK_CLIENT_CAPABILITIES,
  canExecuteDesktopCommands,
  canSendChat,
  DEFAULT_SETTINGS,
  isFileOperation,
  normalizeDesktopCommandPayload,
  normalizePersonaAssetsPayload,
  normalizeSessionAcceptedPayload,
  requiresLocalDesktopApproval,
  requiresRemoteControlBanner,
  resolvePersonaAssetUrl,
} from "./protocol.ts";

test("normalizeSessionAcceptedPayload akzeptiert snake_case", () => {
  assert.deepEqual(
    normalizeSessionAcceptedPayload({
      session_id: "sess-1",
      device_id: "dev-1",
      shared_key: "abc123",
    }),
    {
      session_id: "sess-1",
      device_id: "dev-1",
      shared_key: "abc123",
    },
  );
});

test("normalizeSessionAcceptedPayload akzeptiert camelCase von AuraGo", () => {
  assert.deepEqual(
    normalizeSessionAcceptedPayload({
      sessionId: "sess-2",
      deviceId: "dev-2",
      sharedKey: "def456",
    }),
    {
      session_id: "sess-2",
      device_id: "dev-2",
      shared_key: "def456",
    },
  );
});

test("normalizeSessionAcceptedPayload lehnt ungueltige Payloads ab", () => {
  assert.equal(normalizeSessionAcceptedPayload(null), null);
  assert.equal(normalizeSessionAcceptedPayload({ session_id: "x" }), null);
});

test("canSendChat erlaubt accepted nur mit session_id", () => {
  assert.equal(canSendChat("accepted", "connected", ""), false);
  assert.equal(canSendChat("accepted", "connected", "sess-acc-1"), true);
  assert.equal(canSendChat("loopback", "connected", ""), true);
  assert.equal(canSendChat("pairing", "connected", "sess-1"), false);
});

test("normalizeDesktopCommandPayload akzeptiert snake_case", () => {
  assert.deepEqual(
    normalizeDesktopCommandPayload({
      command_id: "cmd-1",
      operation: "desktop_screenshot",
      params: { display_id: "display-0", format: "png" },
    }),
    {
      command_id: "cmd-1",
      operation: "desktop_screenshot",
      params: { display_id: "display-0", window_id: undefined, format: "png", quality: undefined },
    },
  );
});

test("normalizeDesktopCommandPayload akzeptiert camelCase", () => {
  assert.deepEqual(
    normalizeDesktopCommandPayload({
      commandId: "cmd-2",
      operation: "desktop_input",
      params: { kind: "mouse_move", x: 10, y: 20, absolute: true },
    }),
    {
      command_id: "cmd-2",
      operation: "desktop_input",
      params: {
        kind: "mouse_move",
        x: 10,
        y: 20,
        button: undefined,
        action: undefined,
        key: undefined,
        code: undefined,
        text: undefined,
        absolute: true,
      },
    },
  );
});

test("normalizeDesktopCommandPayload normalisiert file_list", () => {
  assert.deepEqual(
    normalizeDesktopCommandPayload({
      command_id: "cmd-file",
      operation: "file_list",
      params: { rootId: "workspace", path: "src", recursive: true },
    }),
    {
      command_id: "cmd-file",
      operation: "file_list",
      params: {
        root_id: "workspace",
        path: "src",
        recursive: true,
        encoding: undefined,
        content: undefined,
        expected_hash: undefined,
        create_only: false,
      },
    },
  );
});

test("canExecuteDesktopCommands erlaubt accepted und loopback", () => {
  assert.equal(canExecuteDesktopCommands("accepted"), true);
  assert.equal(canExecuteDesktopCommands("loopback"), true);
  assert.equal(canExecuteDesktopCommands("pairing"), false);
  assert.equal(canExecuteDesktopCommands("awaiting_pairing"), false);
});

test("agodeskClientCapabilities respektiert Desktop-Einstellung", () => {
  assert.deepEqual(agodeskClientCapabilities(true), [...AGODESK_CLIENT_CAPABILITIES]);
  assert.deepEqual(agodeskClientCapabilities(false), [...AGODESK_BASE_CAPABILITIES]);
  assert.deepEqual(agodeskClientCapabilities(), [...AGODESK_CLIENT_CAPABILITIES]);
});

test("agodeskClientCapabilities advertised Browser nur bei browserControlEnabled", () => {
  const withBrowser = agodeskClientCapabilities(true, DEFAULT_SETTINGS.fileAccess, true);
  assert.ok(withBrowser.includes("remote.desktop.browser"));
  const withoutBrowser = agodeskClientCapabilities(true, DEFAULT_SETTINGS.fileAccess, false);
  assert.ok(!withoutBrowser.includes("remote.desktop.browser"));
  assert.ok(withoutBrowser.includes("remote.desktop.discovery"));
  assert.ok(withoutBrowser.includes("remote.desktop.ui_automation"));
});

test("agodeskClientCapabilities advertised Datei-Capabilities nur bei Freigabe", () => {
  const fileAccess = {
    enabled: true,
    maxReadBytes: 1024,
    maxWriteBytes: 1024,
    roots: [
      {
        rootId: "workspace",
        label: "Workspace",
        canonicalPath: "C:/tmp/workspace",
        pathDisplay: "C:/tmp/workspace",
        readEnabled: true,
        writeEnabled: true,
      },
    ],
  };
  const caps = agodeskClientCapabilities(true, fileAccess);
  assert.ok(caps.includes("remote.files.read"));
  assert.ok(caps.includes("remote.files.write"));
  assert.deepEqual(agodeskClientCapabilities(true, { ...fileAccess, enabled: false }), [
    ...AGODESK_CLIENT_CAPABILITIES,
  ]);
});

test("isFileOperation erkennt file_list/file_read/file_write", () => {
  assert.equal(isFileOperation("file_list"), true);
  assert.equal(isFileOperation("file_read"), true);
  assert.equal(isFileOperation("file_write"), true);
  assert.equal(isFileOperation("desktop_screenshot"), false);
});

test("requiresLocalDesktopApproval gilt fuer Input- und UI-/Browser-Aktionen", () => {
  assert.equal(requiresLocalDesktopApproval("desktop_input"), true);
  assert.equal(requiresLocalDesktopApproval("desktop_ui_action"), true);
  assert.equal(requiresLocalDesktopApproval("desktop_browser_action"), true);
  assert.equal(requiresLocalDesktopApproval("desktop_screenshot"), false);
  assert.equal(requiresLocalDesktopApproval("desktop_ui_tree"), false);
  assert.equal(requiresLocalDesktopApproval("desktop_permission_request"), false);
});

test("requiresRemoteControlBanner ohne Screenshot und UI-Tree", () => {
  assert.equal(requiresRemoteControlBanner("desktop_screenshot"), false);
  assert.equal(requiresRemoteControlBanner("desktop_ui_tree"), false);
  assert.equal(requiresRemoteControlBanner("desktop_input"), true);
  assert.equal(requiresRemoteControlBanner("desktop_ui_action"), true);
  assert.equal(requiresRemoteControlBanner("desktop_browser_action"), true);
  assert.equal(requiresRemoteControlBanner("desktop_permission_request"), true);
});

test("DEFAULT_SETTINGS enthaelt uiSounds, locale und browserControlEnabled", () => {
  assert.equal(DEFAULT_SETTINGS.locale, "system");
  assert.equal(DEFAULT_SETTINGS.uiSounds.enabled, true);
  assert.equal(DEFAULT_SETTINGS.uiSounds.theme, "soft");
  assert.equal(DEFAULT_SETTINGS.uiSounds.volume, 0.2);
  assert.equal(DEFAULT_SETTINGS.fileAccess.enabled, false);
  assert.equal(DEFAULT_SETTINGS.browserControlEnabled, false);
  assert.equal(DEFAULT_SETTINGS.desktopControlEnabled, true);
});

test("normalizePersonaAssetsPayload akzeptiert snake_case", () => {
  assert.deepEqual(
    normalizePersonaAssetsPayload({
      session_id: "sess-1",
      persona: "Aura",
      icon_key: "spark",
      avatar_image_url: "/assets/avatar.png",
      icon_url: "/assets/icon.png",
      asset_version: "v1",
      persona_prompt: "Du bist hilfsbereit.",
    }),
    {
      session_id: "sess-1",
      persona: "Aura",
      icon_key: "spark",
      avatar_image_url: "/assets/avatar.png",
      icon_url: "/assets/icon.png",
      asset_version: "v1",
      persona_prompt: "Du bist hilfsbereit.",
    },
  );
});

test("resolvePersonaAssetUrl loest relative Pfade auf", () => {
  assert.equal(
    resolvePersonaAssetUrl(
      "wss://192.168.1.10:8443/api/agodesk/ws",
      "/static/persona.png",
    ),
    "https://192.168.1.10:8443/static/persona.png",
  );
  assert.equal(
    resolvePersonaAssetUrl(
      "ws://127.0.0.1:8080/api/agodesk/ws",
      "/static/persona.png",
    ),
    "http://127.0.0.1:8080/static/persona.png",
  );
});

test("resolvePersonaAssetUrl laesst data-URLs unveraendert", () => {
  const dataUrl = "data:image/svg+xml;base64,PHN2Zy8+";
  assert.equal(
    resolvePersonaAssetUrl("ws://127.0.0.1:8080/api/agodesk/ws", dataUrl),
    dataUrl,
  );
});
