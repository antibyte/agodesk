import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeHotkey } from "./hotkey-utils.ts";

describe("hotkey registration helpers", () => {
  it("defaults remain valid for OS registration", () => {
    assert.equal(analyzeHotkey("Alt+Shift+G").valid, true);
    assert.equal(analyzeHotkey("Alt+Shift+M").valid, true);
  });
});
