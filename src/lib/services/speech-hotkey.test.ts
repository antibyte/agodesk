import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SPEECH_HOTKEY,
  analyzeSpeechHotkey,
  normalizeSpeechHotkey,
} from "./speech-hotkey.ts";

test("normalizeSpeechHotkey nutzt Standard und erlaubt deaktivieren", () => {
  assert.equal(normalizeSpeechHotkey(undefined), DEFAULT_SPEECH_HOTKEY);
  assert.equal(normalizeSpeechHotkey(""), "");
  assert.equal(normalizeSpeechHotkey("off"), "");
});

test("analyzeSpeechHotkey erkennt reservierte Kombinationen", () => {
  const analysis = analyzeSpeechHotkey("Super+L");
  assert.equal(analysis.valid, false);
  assert.equal(analysis.warning, "reserved");
});
