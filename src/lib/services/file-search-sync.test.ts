import test from "node:test";
import assert from "node:assert/strict";
import {
  fileSearchErrorCode,
  parseFileSearchContent,
} from "./file-search-sync.ts";

test("parseFileSearchContent erkennt status error", () => {
  assert.deepEqual(
    parseFileSearchContent('{"status":"error","message":"FILE_NOT_FOUND"}'),
    { status: "error", message: "FILE_NOT_FOUND" },
  );
});

test("parseFileSearchContent gibt null bei ungueltigem JSON zurueck", () => {
  assert.equal(parseFileSearchContent("not-json"), null);
});

test("fileSearchErrorCode mappt bekannte File-Search-Codes", () => {
  assert.equal(fileSearchErrorCode("FILE_ACCESS_DENIED"), "FILE_ACCESS_DENIED");
  assert.equal(fileSearchErrorCode("FILE_SEARCH_INDEX_TIMEOUT"), "FILE_SEARCH_INDEX_TIMEOUT");
  assert.equal(fileSearchErrorCode("something else"), "DESKTOP_OPERATION_UNSUPPORTED");
});
