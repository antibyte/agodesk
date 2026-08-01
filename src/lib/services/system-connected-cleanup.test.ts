import assert from "node:assert/strict";
import { test } from "node:test";
import { runSystemConnectedCleanup } from "./system-connected-cleanup.ts";

test("runSystemConnectedCleanup stoppt die Speech-Session vor dem Reset", async () => {
  const calls: string[] = [];
  await runSystemConnectedCleanup({
    stopSpeechSession: async () => {
      calls.push("stop");
    },
  });
  assert.deepEqual(calls, ["stop"]);
});

test("runSystemConnectedCleanup schluckt Speech-Stop-Fehler", async () => {
  await runSystemConnectedCleanup({
    stopSpeechSession: async () => {
      throw new Error("speech busy");
    },
  });
});
