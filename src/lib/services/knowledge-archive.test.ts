import test from "node:test";
import assert from "node:assert/strict";
import {
  AGODESK_KNOWLEDGE_ARCHIVE_UPLOAD_CAPABILITY,
  agodeskClientCapabilities,
  hasAdvertisedKnowledgeArchiveUpload,
  normalizeKnowledgeArchiveLimits,
  normalizeKnowledgeArchivePreparedPayload,
  normalizeKnowledgeArchiveStatusPayload,
  normalizeSessionAcceptedPayload,
} from "../types/protocol.ts";
import {
  addFilesToKnowledgeArchive,
  buildKnowledgeArchivePrepareMessage,
  handleKnowledgeArchivePreparedMessage,
  handleKnowledgeArchiveStatusMessage,
} from "./knowledge-archive-flow.ts";

test("agodeskClientCapabilities advertises knowledge.archive.upload", () => {
  assert.ok(agodeskClientCapabilities().includes(AGODESK_KNOWLEDGE_ARCHIVE_UPLOAD_CAPABILITY));
});

test("hasAdvertisedKnowledgeArchiveUpload detects the capability", () => {
  assert.equal(hasAdvertisedKnowledgeArchiveUpload(["knowledge.archive.upload"]), true);
  assert.equal(hasAdvertisedKnowledgeArchiveUpload(["chat.media_upload"]), false);
});

test("normalizeKnowledgeArchiveLimits parses snake_case and camelCase", () => {
  const limits = normalizeKnowledgeArchiveLimits({
    max_file_bytes: 1000,
    max_files_per_batch: 4,
    allowed_mime_prefixes: ["application/pdf"],
  });
  assert.deepEqual(limits, {
    max_file_bytes: 1000,
    max_files_per_batch: 4,
    allowed_mime_prefixes: ["application/pdf"],
  });
  assert.equal(normalizeKnowledgeArchiveLimits({ max_file_bytes: 1 }), null);
  assert.equal(normalizeKnowledgeArchiveLimits(null), null);
});

test("session.accepted carries knowledge_archive_limits", () => {
  const accepted = normalizeSessionAcceptedPayload({
    session_id: "s",
    device_id: "d",
    advertised_capabilities: ["knowledge.archive.upload"],
    knowledge_archive_limits: {
      max_file_bytes: 2048,
      max_files_per_batch: 2,
      allowed_mime_prefixes: ["text/"],
    },
  });
  assert.equal(accepted?.knowledge_archive_limits?.max_files_per_batch, 2);
});

test("normalizeKnowledgeArchivePreparedPayload validates documents", () => {
  const payload = normalizeKnowledgeArchivePreparedPayload({
    session_id: "s",
    prepare_id: "prep-1",
    documents: [
      {
        document_id: "kdoc-1",
        filename: "a.pdf",
        upload_url: "https://host/api/agodesk/knowledge/upload/kdoc-1",
        upload_method: "POST",
        upload_field: "file",
        expires_at: "2026-07-18T12:05:00.000Z",
        max_bytes: 5000,
      },
    ],
  });
  assert.equal(payload?.documents.length, 1);
  assert.equal(payload?.documents[0]?.document_id, "kdoc-1");

  assert.equal(
    normalizeKnowledgeArchivePreparedPayload({ session_id: "s", prepare_id: "p", documents: [] }),
    null,
  );
});

test("normalizeKnowledgeArchiveStatusPayload restricts state and reads chunk_count", () => {
  const status = normalizeKnowledgeArchiveStatusPayload({
    session_id: "s",
    document_id: "kdoc-1",
    state: "ready",
    chunk_count: 42,
    title: "Doc",
  });
  assert.equal(status?.state, "ready");
  assert.equal(status?.chunk_count, 42);

  assert.equal(
    normalizeKnowledgeArchiveStatusPayload({
      session_id: "s",
      document_id: "kdoc-1",
      state: "bogus",
    }),
    null,
  );
});

test("buildKnowledgeArchivePrepareMessage maps files to metadata", () => {
  const file = new File([new Uint8Array([1, 2, 3])], "handbuch.pdf", {
    type: "application/pdf",
  });
  const message = buildKnowledgeArchivePrepareMessage({ sessionId: "s", files: [file] });
  assert.equal(message.type, "knowledge.archive.prepare");
  const payload = message.payload as {
    session_id: string;
    files: Array<{ filename: string; mime_type: string; size_bytes: number }>;
  };
  assert.equal(payload.session_id, "s");
  assert.equal(payload.files[0]?.filename, "handbuch.pdf");
  assert.equal(payload.files[0]?.mime_type, "application/pdf");
  assert.equal(payload.files[0]?.size_bytes, 3);
});

test("addFilesToKnowledgeArchive: prepare -> upload -> ready status", async () => {
  const documentId = "kdoc-flow-1";
  const file = new File([new Uint8Array([1, 2, 3, 4])], "doc.pdf", {
    type: "application/pdf",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 201,
      headers: { get: () => "" },
      json: async () => ({}),
    }) as unknown as Response) as typeof fetch;

  const wsSend = async (message: { id: string }): Promise<void> => {
    handleKnowledgeArchivePreparedMessage({
      id: "resp",
      type: "knowledge.archive.prepared",
      timestamp: new Date().toISOString(),
      payload: {
        session_id: "s",
        prepare_id: message.id,
        documents: [
          {
            document_id: documentId,
            filename: "doc.pdf",
            upload_url: "https://host/api/agodesk/knowledge/upload/kdoc-flow-1",
            upload_method: "POST",
            upload_field: "file",
            expires_at: "2026-07-18T12:05:00.000Z",
            max_bytes: 10_000_000,
          },
        ],
      },
    });
    setTimeout(() => {
      handleKnowledgeArchiveStatusMessage({
        session_id: "s",
        document_id: documentId,
        state: "ready",
        chunk_count: 7,
      });
    }, 5);
  };

  try {
    const result = await addFilesToKnowledgeArchive(
      wsSend as unknown as (message: import("../types/protocol").WsMessage) => Promise<void>,
      "https://host",
      "s",
      [file],
    );
    assert.equal(result.readyCount, 1);
    assert.equal(result.failedCount, 0);
    assert.equal(result.items[0]?.chunk_count, 7);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
