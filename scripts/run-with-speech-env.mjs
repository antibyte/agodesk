import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  copySherpaRuntimeDlls,
  isSherpaReady,
  sherpaLibDir,
} from "./download-sherpa-onnx-libs.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function applySherpaEnv() {
  if (process.platform !== "win32") {
    return;
  }
  const libDir = sherpaLibDir();
  if (!isSherpaReady()) {
    console.warn("sherpa-onnx libs not found — run: npm run download:sherpa-onnx-libs");
    return;
  }
  process.env.SHERPA_ONNX_LIB_DIR = libDir;
  const crtFlag = "-C target-feature=+crt-static";
  process.env.RUSTFLAGS = process.env.RUSTFLAGS
    ? `${process.env.RUSTFLAGS} ${crtFlag}`
    : crtFlag;
}

function copySherpaDllsToTauriTarget() {
  if (process.platform !== "win32") {
    return;
  }
  const profile = process.env.CARGO_PROFILE === "debug" ? "debug" : "release";
  const targetDir = join(root, "src-tauri", "target", profile);
  if (existsSync(targetDir)) {
    copySherpaRuntimeDlls(targetDir);
  }
  copySherpaRuntimeDlls(join(root, "src-tauri", "bin"));
}

export function runWithSpeechEnv(command, args, options = {}) {
  applySherpaEnv();
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status === 0) {
    copySherpaDllsToTauriTarget();
  }
  return result.status ?? 1;
}

if (process.argv[1]?.endsWith("run-with-speech-env.mjs")) {
  const userArgs = process.argv.slice(2);
  if (userArgs.length === 0) {
    console.error("Usage: node scripts/run-with-speech-env.mjs <command> [args…]");
    process.exit(1);
  }
  const [command, ...args] = userArgs;
  process.exit(runWithSpeechEnv(command, args, { cwd: root }));
}
