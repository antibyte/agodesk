import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findSignedBundle } from "./generate-update-manifest.mjs";

test("findSignedBundle prefers AppImage over deb", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agodesk-manifest-"));
  const appImage = path.join(dir, "agodesk_0.1.12_amd64.AppImage");
  const deb = path.join(dir, "agodesk_0.1.12_amd64.deb");
  fs.writeFileSync(appImage, "appimage");
  fs.writeFileSync(`${appImage}.sig`, "sig-app");
  fs.writeFileSync(deb, "deb");
  fs.writeFileSync(`${deb}.sig`, "sig-deb");

  const files = [appImage, deb];
  const result = findSignedBundle(files, [/\.AppImage$/i, /\.deb$/i]);
  assert.equal(result?.bundlePath, appImage);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("findSignedBundle falls back to deb when AppImage is missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agodesk-manifest-"));
  const deb = path.join(dir, "agodesk_0.1.12_amd64.deb");
  fs.writeFileSync(deb, "deb");
  fs.writeFileSync(`${deb}.sig`, "sig-deb");

  const result = findSignedBundle([deb], [/\.AppImage$/i, /\.deb$/i]);
  assert.equal(result?.bundlePath, deb);
  fs.rmSync(dir, { recursive: true, force: true });
});
