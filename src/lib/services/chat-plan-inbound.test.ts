import test from "node:test";
import assert from "node:assert/strict";
import { handleChatPlanUpdate, reconcilePlanFromResponse } from "./chat-plan-inbound.ts";
import { chatPlanState } from "../stores/chat-plan.ts";

test("handleChatPlanUpdate setzt Plan aus chat.plan_update", () => {
  chatPlanState.reset();

  const handled = handleChatPlanUpdate({
    session_id: "sess-1",
    request_id: "req-1",
    plan: {
      id: "plan-1",
      title: "Demo-Plan",
      status: "active",
      progress_pct: 40,
    },
  });

  assert.equal(handled, true);
  let state = { plan: null as unknown, sessionId: "", requestId: undefined as string | undefined };
  chatPlanState.subscribe((value) => {
    state = value;
  })();
  assert.equal(state.sessionId, "sess-1");
  assert.equal(state.requestId, "req-1");
  assert.equal(state.plan?.title, "Demo-Plan");
});

test("handleChatPlanUpdate mit plan null leert Store", () => {
  chatPlanState.setPlan("sess-1", { id: "plan-1", title: "Alt", status: "active" }, "req-old");

  const handled = handleChatPlanUpdate({
    session_id: "sess-1",
    request_id: "req-2",
    plan: null,
  });

  assert.equal(handled, true);
  let state = { plan: {} as unknown };
  chatPlanState.subscribe((value) => {
    state = value;
  })();
  assert.equal(state.plan, null);
});

test("reconcilePlanFromResponse übernimmt finalen metadata.plan", () => {
  chatPlanState.reset();
  chatPlanState.setPlan("sess-1", { id: "plan-1", title: "Live", status: "active" }, "req-1");

  reconcilePlanFromResponse({
    plan: {
      id: "plan-1",
      title: "Final",
      status: "completed",
      progress_pct: 100,
    },
  });

  let state = { plan: null as { title?: string; status?: string } | null };
  chatPlanState.subscribe((value) => {
    state = value;
  })();
  assert.equal(state.plan?.title, "Final");
  assert.equal(state.plan?.status, "completed");
});
