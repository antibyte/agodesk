import assert from "node:assert/strict";
import { test } from "node:test";

import type { WsMessage } from "../types/protocol";
import {
  buildChatAttachmentPrepareMessage,
  handleChatAttachmentPreparedMessage,
  prepareChatAttachment,
  rejectAttachmentPrepareByRequestId,
  rejectPendingAttachmentPrepare,
  toChatAttachmentItem,
} from "./chat-attachment-flow";

test(
  "buildChatAttachmentPrepareMessage setzt Metadaten und prepare_id",
  { concurrency: false },
  () => {
    const message = buildChatAttachmentPrepareMessage({
      sessionId: "sess-1",
      conversationId: "conv-1",
      filename: "diagram.png",
      mimeType: "image/png",
      sizeBytes: 4096,
    });

    assert.equal(message.type, "chat.attachment.prepare");
    assert.equal(message.payload.session_id, "sess-1");
    assert.equal(message.payload.conversation_id, "conv-1");
    assert.equal(message.payload.filename, "diagram.png");
    assert.equal(message.payload.mime_type, "image/png");
    assert.equal(message.payload.size_bytes, 4096);
    assert.ok(message.id.length > 0);
  },
);

test(
  "handleChatAttachmentPreparedMessage loest wartenden prepare auf",
  { concurrency: false },
  async () => {
    const prepareId = "prep-123";
    const sent: WsMessage[] = [];
    const waitPromise = prepareChatAttachment(
      async (message) => {
        sent.push(message);
      },
      {
        sessionId: "sess-a",
        conversationId: "conv-b",
        filename: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 12,
      },
    );

    assert.equal(sent.length, 1);
    const prepareMessage = sent[0];
    assert.equal(prepareMessage?.type, "chat.attachment.prepare");

    const handled = handleChatAttachmentPreparedMessage({
      id: "evt-1",
      type: "chat.attachment.prepared",
      timestamp: new Date().toISOString(),
      payload: {
        session_id: "sess-a",
        conversation_id: "conv-b",
        prepare_id: prepareMessage?.id ?? prepareId,
        attachment_id: "att-9",
        upload_url: "https://aurago.local/api/agodesk/media/upload/att-9",
        upload_method: "POST",
        upload_field: "file",
        expires_at: "2026-06-13T12:00:00.000Z",
        max_bytes: 8_388_608,
      },
    });

    assert.equal(handled, true);
    const prepared = await waitPromise;
    assert.equal(prepared.attachment_id, "att-9");
    assert.equal(prepared.upload_field, "file");
  },
);

test(
  "rejectPendingAttachmentPrepare und rejectAttachmentPrepareByRequestId",
  { concurrency: false },
  async () => {
    const sent: WsMessage[] = [];
    const waitPromise = prepareChatAttachment(
      async (message) => {
        sent.push(message);
      },
      {
        sessionId: "sess-a",
        conversationId: "conv-b",
        filename: "fail.bin",
        mimeType: "application/octet-stream",
        sizeBytes: 1,
      },
    );

    const prepareId = sent[0]?.id;
    assert.ok(prepareId);

    rejectPendingAttachmentPrepare(prepareId!, new Error("upload aborted"));
    await assert.rejects(waitPromise, /upload aborted/);

    const secondSent: WsMessage[] = [];
    const secondWait = prepareChatAttachment(
      async (message) => {
        secondSent.push(message);
      },
      {
        sessionId: "sess-a",
        conversationId: "conv-b",
        filename: "again.txt",
        mimeType: "text/plain",
        sizeBytes: 2,
      },
    );

    const rejected = rejectAttachmentPrepareByRequestId("missing-id", "server error");
    assert.equal(rejected, false);

    const secondId = secondSent[0]?.id ?? "";
    assert.ok(secondId);
    const rejectedSecond = rejectAttachmentPrepareByRequestId(secondId, "server error");
    assert.equal(rejectedSecond, true);
    await assert.rejects(secondWait, /server error/);
  },
);

test("toChatAttachmentItem mappt Upload-Ergebnis", { concurrency: false }, () => {
  const item = toChatAttachmentItem(
    {
      attachment_id: "att-42",
      path: "/api/agodesk/media/att-42/photo.jpg",
      mime_type: "image/jpeg",
      size_bytes: 1200,
    },
    "photo.jpg",
    "image/jpeg",
    1200,
  );

  assert.equal(item.attachment_id, "att-42");
  assert.equal(item.filename, "photo.jpg");
  assert.equal(item.kind, "image");
  assert.equal(item.path, "/api/agodesk/media/att-42/photo.jpg");
  assert.equal(item.size_bytes, 1200);
});
