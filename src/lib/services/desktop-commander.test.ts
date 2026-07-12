import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeAgentActivityPayload } from "../types/protocol.ts";
import {
  CAPABILITY_REGISTRY,
  capabilityIdForDesktopOperation,
} from "./capability-registry.ts";
import { appendActivityJournal, clearActivityJournal, queryActivityJournal } from "./activity-journal.ts";
import { buildActivityTree } from "../stores/activity-timeline.ts";

describe("normalizeAgentActivityPayload", () => {
  it("accepts a valid activity payload", () => {
    const payload = normalizeAgentActivityPayload({
      activity_id: "a1",
      session_id: "s1",
      conversation_id: "c1",
      kind: "shell",
      phase: "started",
      title: "npm test",
      risk: "execute",
    });
    assert.ok(payload);
    assert.equal(payload?.activity_id, "a1");
    assert.equal(payload?.kind, "shell");
  });

  it("rejects unknown phase", () => {
    const payload = normalizeAgentActivityPayload({
      activity_id: "a1",
      session_id: "s1",
      conversation_id: "c1",
      kind: "tool",
      phase: "nope",
      title: "x",
    });
    assert.equal(payload, null);
  });
});

describe("capability registry", () => {
  it("maps shell session ops", () => {
    assert.equal(capabilityIdForDesktopOperation("shell_session_start"), "remote.shell.session");
    assert.equal(capabilityIdForDesktopOperation("file_patch"), "remote.files.write");
  });

  it("includes chat.agent_activity", () => {
    assert.ok(CAPABILITY_REGISTRY.some((entry) => entry.id === "chat.agent_activity"));
  });
});

describe("activity journal", () => {
  it("stores redacted metadata only", () => {
    clearActivityJournal();
    appendActivityJournal({
      timestamp: new Date().toISOString(),
      kind: "shell",
      status: "completed",
      command_summary: "echo Bearer abc.def.ghi",
      conversation_id: "c1",
    });
    const entries = queryActivityJournal({ conversationId: "c1", limit: 10 });
    assert.equal(entries.length, 1);
    assert.match(entries[0].command_summary ?? "", /redacted/i);
  });
});

describe("activity tree", () => {
  it("nests children under parents", () => {
    const tree = buildActivityTree([
      {
        activity_id: "root",
        session_id: "s",
        conversation_id: "c",
        kind: "agent",
        phase: "started",
        title: "Task",
      },
      {
        activity_id: "child",
        parent_activity_id: "root",
        session_id: "s",
        conversation_id: "c",
        kind: "tool",
        phase: "completed",
        title: "Step",
      },
    ]);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].children.length, 1);
    assert.equal(tree[0].children[0].activity_id, "child");
  });
});
