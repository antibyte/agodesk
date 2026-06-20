import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLocalAcknowledgements,
  countUnacknowledgedWarnings,
  getAcknowledgedIdsForServer,
  mergeAcknowledgedIds,
  sanitizeAcknowledgedWarningsStore,
} from "./system-warnings-persist.ts";
import type { SystemWarning } from "../types/protocol.ts";

const warnings: SystemWarning[] = [
  {
    id: "warn-a",
    severity: "warning",
    title: "A",
    acknowledged: false,
  },
  {
    id: "warn-b",
    severity: "info",
    title: "B",
    acknowledged: false,
  },
];

test("applyLocalAcknowledgements markiert lokal gespeicherte IDs", () => {
  const next = applyLocalAcknowledgements(warnings, new Set(["warn-a"]));
  assert.equal(next[0]?.acknowledged, true);
  assert.equal(next[1]?.acknowledged, false);
});

test("countUnacknowledgedWarnings zaehlt nur offene Warnungen", () => {
  const next = applyLocalAcknowledgements(warnings, new Set(["warn-a"]));
  assert.equal(countUnacknowledgedWarnings(next), 1);
});

test("sanitizeAcknowledgedWarningsStore normalisiert Server-URLs und dedupliziert IDs", () => {
  const sanitized = sanitizeAcknowledgedWarningsStore({
    "https://example.com": ["warn-a", "warn-a", ""],
    invalid: ["x"],
  });

  assert.deepEqual(sanitized, {
    "https://example.com/api/agodesk/ws": ["warn-a"],
  });
});

test("mergeAcknowledgedIds fuegt neue IDs hinzu", () => {
  const merged = mergeAcknowledgedIds(
    { "https://example.com/api/agodesk/ws": ["warn-a"] },
    "https://example.com/",
    ["warn-b"],
  );

  assert.deepEqual(
    getAcknowledgedIdsForServer(merged, "https://example.com/"),
    new Set(["warn-a", "warn-b"]),
  );
});
