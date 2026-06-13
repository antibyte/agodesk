import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isSherpaArchivePresent, isSherpaReady } from "./download-sherpa-onnx-libs.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

if (isSherpaReady() || isSherpaArchivePresent()) {
  process.exit(0);
}

console.log("sherpa-onnx libs missing — downloading…");
const result = spawnSync(
  process.execPath,
  [join(root, "scripts", "download-sherpa-onnx-libs.mjs")],
  {
    stdio: "inherit",
    cwd: root,
  },
);

process.exit(result.status ?? 1);
