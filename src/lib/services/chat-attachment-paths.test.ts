import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractAttachmentIdFromMediaPath,
  findAttachmentByFilename,
  resolveAttachmentIdForMedia,
} from "./chat-attachment-paths";

test("extractAttachmentIdFromMediaPath liest attachment_id aus Media-Pfad", () => {
  assert.equal(
    extractAttachmentIdFromMediaPath("/api/agodesk/media/att-abc/maja.png"),
    "att-abc",
  );
  assert.equal(
    extractAttachmentIdFromMediaPath("/api/agodesk/media/upload/att-upload"),
    "att-upload",
  );
});

test("resolveAttachmentIdForMedia findet attachment anhand Dateiname in Chat-Historie", () => {
  const attachmentId = resolveAttachmentIdForMedia(
    {
      id: "media-1",
      kind: "image",
      conversation_id: "sess-1",
      filename: "maja.png",
    },
    undefined,
    [
      {
        id: "msg-1",
        role: "user",
        text: "",
        timestamp: "2026-06-04T12:00:00.000Z",
        attachments: [
          {
            attachment_id: "att-123",
            filename: "maja.png",
            mime_type: "image/png",
          },
        ],
      },
    ],
  );

  assert.equal(attachmentId, "att-123");
});

test("findAttachmentByFilename durchsucht juengste User-Nachrichten", () => {
  const match = findAttachmentByFilename("maja.png", [
    {
      id: "msg-1",
      role: "assistant",
      text: "ok",
      timestamp: "2026-06-04T12:00:00.000Z",
    },
    {
      id: "msg-2",
      role: "user",
      text: "",
      timestamp: "2026-06-04T12:00:01.000Z",
      attachments: [
        {
          attachment_id: "att-new",
          filename: "maja.png",
          mime_type: "image/png",
        },
      ],
    },
  ]);

  assert.equal(match?.attachment_id, "att-new");
});
