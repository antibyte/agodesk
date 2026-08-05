import test from "node:test";
import assert from "node:assert/strict";
import { applyLayoutMapToHotkey, keyboardEventToHotkey } from "./hotkey-utils.ts";

test("keyboardEventToHotkey nutzt Tastenbeschriftung (QWERTZ Y auf KeyZ)", () => {
  const event = {
    repeat: false,
    key: "y",
    code: "KeyZ",
    ctrlKey: false,
    altKey: true,
    shiftKey: true,
    metaKey: false,
  } as KeyboardEvent;
  assert.equal(keyboardEventToHotkey(event), "Alt+Shift+Y");
});

test("applyLayoutMapToHotkey mappt QWERTZ Y auf physisches Z", () => {
  const german = new Map<string, string>([
    ["KeyY", "z"],
    ["KeyZ", "y"],
    ["KeyG", "g"],
  ]);
  assert.equal(applyLayoutMapToHotkey("Alt+Shift+Y", german), "Alt+Shift+Z");
  assert.equal(applyLayoutMapToHotkey("Alt+Shift+Z", german), "Alt+Shift+Y");
  assert.equal(applyLayoutMapToHotkey("Alt+Shift+G", german), "Alt+Shift+G");
});

test("applyLayoutMapToHotkey bleibt ohne Layout-Map unverändert", () => {
  assert.equal(applyLayoutMapToHotkey("Alt+Shift+Y", null), "Alt+Shift+Y");
});
