import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SHOW_WINDOW_HOTKEY,
  analyzeShowWindowHotkey,
  keyboardEventToHotkey,
  normalizeShowWindowHotkey,
} from "./show-window-hotkey.ts";

test("normalizeShowWindowHotkey nutzt Standard und erlaubt deaktivieren", () => {
  assert.equal(normalizeShowWindowHotkey(undefined), DEFAULT_SHOW_WINDOW_HOTKEY);
  assert.equal(normalizeShowWindowHotkey(""), "");
  assert.equal(normalizeShowWindowHotkey("off"), "");
});

test("analyzeShowWindowHotkey erkennt reservierte Kombinationen", () => {
  const analysis = analyzeShowWindowHotkey("Super+L");
  assert.equal(analysis.valid, false);
  assert.equal(analysis.warning, "reserved");
});

test("keyboardEventToHotkey baut Alt+Shift+G", () => {
  const event = {
    repeat: false,
    key: "g",
    code: "KeyG",
    ctrlKey: false,
    altKey: true,
    shiftKey: true,
    metaKey: false,
  } as KeyboardEvent;
  assert.equal(keyboardEventToHotkey(event), "Alt+Shift+G");
});

test("keyboardEventToHotkey lehnt Modifier ohne Taste ab", () => {
  const event = {
    repeat: false,
    key: "Shift",
    code: "ShiftLeft",
    ctrlKey: false,
    altKey: true,
    shiftKey: true,
    metaKey: false,
  } as KeyboardEvent;
  assert.equal(keyboardEventToHotkey(event), null);
});
