import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeUploadedAttachmentResponse } from "./chat-attachment-upload";

test("normalizeUploadedAttachmentResponse akzeptiert camelCase von Tauri", () => {
  const normalized = normalizeUploadedAttachmentResponse(
    {
      attachmentId: "att-tauri-1",
      mimeType: "image/png",
      sizeBytes: 2048,
      path: "/media/att-tauri-1",
      status: "ready",
    },
    "att-fallback",
  );

  assert.equal(normalized.attachment_id, "att-tauri-1");
  assert.equal(normalized.mime_type, "image/png");
  assert.equal(normalized.size_bytes, 2048);
  assert.equal(normalized.path, "/media/att-tauri-1");
});

test("normalizeUploadedAttachmentResponse nutzt prepare attachment_id als Fallback", () => {
  const normalized = normalizeUploadedAttachmentResponse({ status: "ready" }, "att-prepared");

  assert.equal(normalized.attachment_id, "att-prepared");
});
