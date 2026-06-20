import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SHELL_ACCESS_SETTINGS } from "../types/protocol";
import { isCommandDenied, clampShellTimeout } from "./shell-access";

test("isCommandDenied rejects empty and destructive commands", () => {
  assert.equal(isCommandDenied(""), true);
  assert.equal(isCommandDenied("git status"), false);
  assert.equal(isCommandDenied("format c:"), true);
  assert.equal(isCommandDenied("echo hello\nrm -rf /"), true);
});

test("clampShellTimeout respects defaults and max", () => {
  const settings = {
    ...DEFAULT_SHELL_ACCESS_SETTINGS,
    defaultTimeoutMs: 30_000,
    maxTimeoutMs: 120_000,
  };
  assert.equal(clampShellTimeout(undefined, settings), 30_000);
  assert.equal(clampShellTimeout(500_000, settings), 120_000);
  assert.equal(clampShellTimeout(10_000, settings), 10_000);
});
