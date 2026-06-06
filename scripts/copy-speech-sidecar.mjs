import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copySherpaRuntimeDlls } from "./download-sherpa-onnx-libs.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = join(root, "src-tauri");
const profile = process.env.CARGO_PROFILE === "debug" ? "debug" : "release";
const isWindows = process.platform === "win32";
const sourceName = isWindows ? "agodesk-speech.exe" : "agodesk-speech";
const source = join(tauriDir, "target", profile, sourceName);

let triple = process.env.CARGO_BUILD_TARGET;
if (!triple) {
  const arch = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : process.arch;
  if (isWindows) {
    triple = `${arch}-pc-windows-msvc`;
  } else {
    triple = `${arch}-unknown-linux-gnu`;
  }
}
const destDir = join(tauriDir, "bin");
const destName = isWindows ? `agodesk-speech-${triple}.exe` : `agodesk-speech-${triple}`;
const dest = join(destDir, destName);

mkdirSync(destDir, { recursive: true });

if (process.argv.includes("--ensure-dummy")) {
  if (!existsSync(dest)) {
    writeFileSync(dest, "");
    console.log(`Ensured dummy speech sidecar placeholder at ${dest}`);
  }
  process.exit(0);
}

if (!existsSync(source)) {
  console.error(`Speech sidecar binary missing: ${source}`);
  console.error("Run: cd src-tauri && cargo build --release --bin agodesk-speech --features speech-sidecar");
  process.exit(1);
}

copyFileSync(source, dest);
copySherpaRuntimeDlls(destDir);
console.log(`Copied speech sidecar to ${dest}`);
