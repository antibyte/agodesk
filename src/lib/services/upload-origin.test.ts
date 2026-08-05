import assert from "node:assert/strict";
import { test } from "node:test";

import { isUploadOriginAllowed } from "./upload-origin";

test("isUploadOriginAllowed erlaubt Server-Origin", () => {
  assert.equal(
    isUploadOriginAllowed(
      "wss://aurago.local:8443/api/agodesk/ws",
      "https://aurago.local:8443/api/agodesk/media/upload/att-1",
      [],
    ),
    true,
  );
});

test("isUploadOriginAllowed verweigert fremde Origin ohne Allowlist", () => {
  assert.equal(
    isUploadOriginAllowed(
      "wss://aurago.local:8443/api/agodesk/ws",
      "http://127.0.0.1:9/evil-upload",
      [],
    ),
    false,
  );
});

test("isUploadOriginAllowed erlaubt Allowlist-Eintrag", () => {
  assert.equal(
    isUploadOriginAllowed(
      "wss://aurago.local:8443/api/agodesk/ws",
      "https://cdn.example.com/upload",
      ["https://cdn.example.com"],
    ),
    true,
  );
});
