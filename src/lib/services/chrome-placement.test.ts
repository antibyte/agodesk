import test from "node:test";
import assert from "node:assert/strict";
import { isPairingNeeded, selectApproval, type ApprovalInput } from "./chrome-placement.ts";

const idle: ApprovalInput = {
  certModalOpen: false,
  desktopControlEnabled: true,
  remoteControlPending: false,
  remoteControlActive: false,
  shellPending: false,
  hasShellRequest: false,
  sessionStatus: "accepted",
};

test("isPairingNeeded nur awaiting_pairing und error", () => {
  assert.equal(isPairingNeeded("awaiting_pairing"), true);
  assert.equal(isPairingNeeded("error"), true);
  assert.equal(isPairingNeeded("pairing"), false);
  assert.equal(isPairingNeeded("accepted"), false);
  assert.equal(isPairingNeeded("idle"), false);
  assert.equal(isPairingNeeded("loopback"), false);
});

test("selectApproval leer wenn nichts ansteht", () => {
  assert.equal(selectApproval(idle), null);
});

test("selectApproval TLS-Modal erzwingt null", () => {
  assert.equal(
    selectApproval({
      ...idle,
      certModalOpen: true,
      remoteControlPending: true,
      shellPending: true,
      hasShellRequest: true,
      sessionStatus: "awaiting_pairing",
    }),
    null,
  );
});

test("selectApproval Remote schlaegt Shell und Pairing", () => {
  assert.equal(
    selectApproval({
      ...idle,
      remoteControlPending: true,
      shellPending: true,
      hasShellRequest: true,
      sessionStatus: "awaiting_pairing",
    }),
    "remote",
  );
  assert.equal(selectApproval({ ...idle, remoteControlActive: true }), "remote");
});

test("selectApproval Remote braucht Desktop-Control", () => {
  assert.equal(
    selectApproval({ ...idle, desktopControlEnabled: false, remoteControlPending: true }),
    null,
  );
});

test("selectApproval Shell schlaegt Pairing", () => {
  assert.equal(
    selectApproval({
      ...idle,
      shellPending: true,
      hasShellRequest: true,
      sessionStatus: "awaiting_pairing",
    }),
    "shell",
  );
});

test("selectApproval Shell ohne Request ist leer", () => {
  assert.equal(selectApproval({ ...idle, shellPending: true, hasShellRequest: false }), null);
});

test("selectApproval Pairing bei awaiting_pairing und error", () => {
  assert.equal(selectApproval({ ...idle, sessionStatus: "awaiting_pairing" }), "pairing");
  assert.equal(selectApproval({ ...idle, sessionStatus: "error" }), "pairing");
  assert.equal(selectApproval({ ...idle, sessionStatus: "pairing" }), null);
});
