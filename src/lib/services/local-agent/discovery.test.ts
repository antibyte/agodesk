import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../../types/protocol.ts";
import { getToolSpec } from "./tools.ts";

/**
 * Mirrors the Progressive-Discovery gate in loop.executeToolCall: local tools
 * require a prior describe_tool (revealed) and settings availability.
 */
function gateLocalTool(
  name: string,
  revealed: Set<string>,
  settings = DEFAULT_SETTINGS,
): { ok: true } | { ok: false; error_code: string } {
  const spec = getToolSpec(name);
  if (!spec || spec.category !== "local") {
    return { ok: false, error_code: "UNKNOWN_TOOL" };
  }
  if (!revealed.has(name)) {
    return { ok: false, error_code: "TOOL_NOT_REVEALED" };
  }
  if (!(spec.isAvailable?.(settings) ?? true)) {
    return { ok: false, error_code: "TOOL_UNAVAILABLE" };
  }
  return { ok: true };
}

test("progressive discovery blocks local tools until revealed", () => {
  const revealed = new Set<string>();
  assert.equal(gateLocalTool("file_read", revealed).ok, false);
  assert.equal(
    (gateLocalTool("file_read", revealed) as { error_code: string }).error_code,
    "TOOL_NOT_REVEALED",
  );

  revealed.add("file_read");
  // Default settings have no file roots → unavailable after reveal.
  assert.equal(
    (gateLocalTool("file_read", revealed) as { error_code: string }).error_code,
    "TOOL_UNAVAILABLE",
  );
});

test("kernel tools are not gated as local", () => {
  assert.equal(
    (gateLocalTool("list_local_tools", new Set()) as { error_code: string }).error_code,
    "UNKNOWN_TOOL",
  );
});
