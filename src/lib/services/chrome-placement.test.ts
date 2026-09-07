import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  countInboxBadge,
  deriveInboxItems,
  isPairingNeeded,
  selectApproval,
  type ApprovalInput,
  type InboxInput,
} from "./chrome-placement.ts";
import type { AgentActivityPayload, AgoDeskPlan, SystemWarning } from "../types/protocol.ts";

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

const warning = (id: string, acknowledged: boolean): SystemWarning => ({
  id,
  severity: "warning",
  title: id,
  acknowledged,
});

const activity = (phase: AgentActivityPayload["phase"]): AgentActivityPayload => ({
  activity_id: "a1",
  session_id: "s",
  conversation_id: "c",
  kind: "agent",
  phase,
  title: "work",
});

const emptyInbox: InboxInput = {
  warnings: [],
  update: { status: "idle", dismissed: false },
  speechErrorMessage: "",
  vadError: "",
  plan: null,
  activities: [],
  activityDismissed: false,
};

test("deriveInboxItems zaehlt ungelesene Warning Update Speech, nicht Plan", () => {
  const plan: AgoDeskPlan = { status: "in_progress", title: "Build" };
  const items = deriveInboxItems({
    ...emptyInbox,
    warnings: [warning("w1", false), warning("w2", true)],
    update: { status: "available", dismissed: false },
    speechErrorMessage: "mic",
    plan,
    activities: [activity("started")],
  });
  assert.deepEqual(
    items.map((item) => [item.id, item.kind, item.unread]),
    [
      ["w1", "warning", true],
      ["w2", "warning", false],
      ["update", "update", true],
      ["speech-error", "speech", true],
      ["plan", "plan", false],
      ["activity", "activity", false],
    ],
  );
  assert.equal(countInboxBadge(items), 3);
});

test("deriveInboxItems Update dismissed oder idle erzeugt kein Item", () => {
  assert.equal(
    deriveInboxItems({ ...emptyInbox, update: { status: "available", dismissed: true } }).length,
    0,
  );
  assert.equal(deriveInboxItems({ ...emptyInbox, update: { status: "idle", dismissed: false } }).length, 0);
});

test("deriveInboxItems Speech aus errorMessage oder vadError", () => {
  assert.equal(deriveInboxItems({ ...emptyInbox, vadError: "vad" })[0]?.id, "speech-error");
  assert.equal(deriveInboxItems(emptyInbox).some((item) => item.kind === "speech"), false);
});

test("deriveInboxItems Plan completed und Activity dismissed weglassen", () => {
  const items = deriveInboxItems({
    ...emptyInbox,
    plan: { status: "completed" },
    activities: [activity("started")],
    activityDismissed: true,
  });
  assert.equal(items.length, 0);
});

test("Remote Shell Update Banner sind keine modalen Dialoge", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  for (const name of [
    "RemoteControlBanner.svelte",
    "ShellApprovalBanner.svelte",
    "UpdateBanner.svelte",
  ]) {
    const src = readFileSync(path.join(dir, "..", "components", name), "utf8");
    assert.equal(src.includes('aria-modal="true"'), false, name);
    assert.equal(src.includes("use:focusTrap"), false, name);
    assert.equal(src.includes('role="dialog"'), false, name);
  }
});

test("ChatView haengt ApprovalRail ein und keine Stapel-Banner", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(dir, "..", "components", "ChatView.svelte"), "utf8");
  assert.equal(src.includes("<ApprovalRail"), true);
  assert.equal(src.includes("<SpeechBanner"), false);
  assert.equal(src.includes("<UpdateBanner"), false);
  assert.equal(src.includes("<ChatPlanFloatingPanel"), false);
  assert.equal(src.includes("<ActivityTimelinePanel"), false);
  assert.equal(src.includes("bannerStackCompact"), false);
  assert.equal(src.includes("info-banner"), false);
});

test("StatusBar-Pille oeffnet keine Settings", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(dir, "..", "components", "StatusBar.svelte"), "utf8");
  const pillBlock = src.slice(src.indexOf("class=\"status-pill\""), src.indexOf("onToggleHistory"));
  assert.equal(pillBlock.includes("onOpenSettings"), false);
  assert.equal(src.includes("onFocusPairing"), true);
});

test("ChatView Empty-State Pairing oeffnet keine Device-Settings", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(dir, "..", "components", "ChatView.svelte"), "utf8");
  assert.equal(src.includes('openSettings("device")'), false);
  assert.equal(src.includes("onFocusPairing"), true);
});
