import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copySherpaRuntimeDlls, isSherpaReady } from "./download-sherpa-onnx-libs.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = join(root, "src-tauri");

function ensureSherpaLibs() {
  if (isSherpaReady()) {
    return;
  }
  const result = spawnSync(
    process.execPath,
    [join(root, "scripts", "ensure-sherpa-onnx-libs.mjs")],
    {
      stdio: "inherit",
      cwd: root,
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function stageSherpaRuntime() {
  if (process.platform !== "win32") {
    return;
  }

  ensureSherpaLibs();

  const dirs = [join(tauriDir, "bin"), join(tauriDir, "target", "release")];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
    copySherpaRuntimeDlls(dir);
  }

  console.log("Staged sherpa-onnx runtime DLLs for Windows bundle");
}

stageSherpaRuntime();
