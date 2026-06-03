import test from "node:test";
import assert from "node:assert/strict";
import { formatInvokeError } from "./errors.ts";

test("formatInvokeError gibt Tauri-String-Fehler durch", () => {
  assert.equal(
    formatInvokeError("BitBlt screen capture failed.", "fallback"),
    "BitBlt screen capture failed.",
  );
});

test("formatInvokeError liest message/error Felder aus Objekten", () => {
  assert.equal(
    formatInvokeError({ error: "capture_screen denied" }, "fallback"),
    "capture_screen denied",
  );
  assert.equal(
    formatInvokeError({ message: "Failed to read bitmap pixels." }, "fallback"),
    "Failed to read bitmap pixels.",
  );
});

test("formatInvokeError nutzt Fallback bei leerem Input", () => {
  assert.equal(formatInvokeError(null, "fallback"), "fallback");
  assert.equal(formatInvokeError({}, "fallback"), "fallback");
});
