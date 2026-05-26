import test from "node:test";
import assert from "node:assert/strict";
import {
  canExecuteDesktopCommands,
  canSendChat,
  normalizeDesktopCommandPayload,
  normalizeSessionAcceptedPayload,
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

test("canExecuteDesktopCommands erlaubt accepted und loopback", () => {
  assert.equal(canExecuteDesktopCommands("accepted"), true);
  assert.equal(canExecuteDesktopCommands("loopback"), true);
  assert.equal(canExecuteDesktopCommands("pairing"), false);
  assert.equal(canExecuteDesktopCommands("awaiting_pairing"), false);
});