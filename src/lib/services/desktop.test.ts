import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCaptureResultForWire } from "./desktop.ts";

test("normalizeCaptureResultForWire mappt camelCase von Tauri auf snake_case", () => {
  assert.deepEqual(
    normalizeCaptureResultForWire({
      source: "display",
      displayId: "display-0",
      windowId: null,
      format: "jpeg",
      width: 1280,
      height: 720,
      scaleFactor: 1.25,
      mime: "image/jpeg",
      dataBase64: "abc123",
    }),
    {
      source: "display",
      display_id: "display-0",
      window_id: null,
      format: "jpeg",
      width: 1280,
      height: 720,
      scale_factor: 1.25,
      mime: "image/jpeg",
      data_base64: "abc123",
    },
  );
});

test("normalizeCaptureResultForWire behält snake_case", () => {
  assert.deepEqual(
    normalizeCaptureResultForWire({
      source: "window",
      display_id: "display-1",
      window_id: "win-42",
      format: "png",
      width: 800,
      height: 600,
      scale_factor: 1,
      mime: "image/png",
      data_base64: "pngdata",
    }),
    {
      source: "window",
      display_id: "display-1",
      window_id: "win-42",
      format: "png",
      width: 800,
      height: 600,
      scale_factor: 1,
      mime: "image/png",
      data_base64: "pngdata",
    },
  );
});
