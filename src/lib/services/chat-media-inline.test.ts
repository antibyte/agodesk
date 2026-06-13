import test from "node:test";
import assert from "node:assert/strict";
import { isInlineImageSrc, resolveInlineImageFallback } from "./chat-media-inline.ts";

test("isInlineImageSrc akzeptiert blob, data:image und octet-stream", () => {
  assert.equal(isInlineImageSrc("blob:http://localhost/x"), true);
  assert.equal(isInlineImageSrc("data:image/png;base64,abc"), true);
  assert.equal(isInlineImageSrc("data:application/octet-stream;base64,abc"), true);
  assert.equal(isInlineImageSrc("data:text/plain;base64,abc"), false);
});

test("isInlineImageSrc akzeptiert AuraGo-Media-HTTPS-URLs", () => {
  assert.equal(
    isInlineImageSrc(
      "https://aurago.example.com/api/agodesk/media/attachments/agodesk/sess-1/hash",
    ),
    true,
  );
});

test("resolveInlineImageFallback baut fetchbare Media-URL", () => {
  assert.equal(
    resolveInlineImageFallback(
      "wss://aurago.example.com/api/agodesk/ws",
      "/api/agodesk/media/attachments/agodesk/sess-1/hash",
    ),
    "https://aurago.example.com/api/agodesk/media/attachments/agodesk/sess-1/hash",
  );
});
