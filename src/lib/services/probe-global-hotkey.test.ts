import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeHotkey } from "./hotkey-utils.ts";

describe("hotkey probe helpers", () => {
  it("analyzeHotkey accepts Alt+Shift letter combos used during capture", () => {
    const analysis = analyzeHotkey("Alt+Shift+G");
    assert.equal(analysis.valid, true);
    assert.equal(analysis.normalized, "Alt+Shift+G");
  });

  it("analyzeHotkey accepts CommandOrControl combos from keyboard capture", () => {
    const analysis = analyzeHotkey("CommandOrControl+Alt+Shift+K");
    assert.equal(analysis.valid, true);
    assert.equal(analysis.normalized, "CommandOrControl+Alt+Shift+K");
  });
});
