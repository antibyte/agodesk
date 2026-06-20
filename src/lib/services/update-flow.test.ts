import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import {
  isUpdateBannerVisible,
  mapDownloadProgress,
  resetUpdateStateForTests,
  updateState,
} from "./update-flow.ts";

test("mapDownloadProgress berechnet Prozent korrekt", () => {
  assert.equal(mapDownloadProgress(0, 100), 0);
  assert.equal(mapDownloadProgress(50, 100), 50);
  assert.equal(mapDownloadProgress(100, 100), 100);
  assert.equal(mapDownloadProgress(150, 100), 100);
});

test("mapDownloadProgress bei unbekannter Groesse liefert 0", () => {
  assert.equal(mapDownloadProgress(10, 0), 0);
});

test("isUpdateBannerVisible nur bei available/downloading und nicht dismissed", () => {
  assert.equal(
    isUpdateBannerVisible({ status: "available", dismissed: false }),
    true,
  );
  assert.equal(
    isUpdateBannerVisible({ status: "downloading", dismissed: false, progress: 42 }),
    true,
  );
  assert.equal(
    isUpdateBannerVisible({ status: "available", dismissed: true }),
    false,
  );
  assert.equal(
    isUpdateBannerVisible({ status: "idle", dismissed: false }),
    false,
  );
});

test("resetUpdateStateForTests setzt Store zurueck", () => {
  updateState.set({ status: "available", version: "9.9.9", dismissed: false });
  resetUpdateStateForTests();
  assert.deepEqual(get(updateState), { status: "idle", dismissed: false });
});
