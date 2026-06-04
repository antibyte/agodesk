import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = join(root, "src-tauri");
const profile = process.env.CARGO_PROFILE === "debug" ? "debug" : "release";
const isWindows = process.platform === "win32";
const sourceName = isWindows ? "agodesk-worker.exe" : "agodesk-worker";
const source = join(tauriDir, "target", profile, sourceName);

if (!existsSync(source)) {
  console.error(`Sidecar binary missing: ${source}`);
  console.error("Run: cd src-tauri && cargo build --release --bin agodesk-worker");
  process.exit(1);
}

const triple = process.env.CARGO_BUILD_TARGET ?? `${process.arch}-unknown-${isWindows ? "pc-windows-msvc" : "linux-gnu"}`;
const destDir = join(tauriDir, "bin");
const destName = isWindows
  ? `agodesk-worker-${triple}.exe`
  : `agodesk-worker-${triple}`;
const dest = join(destDir, destName);

mkdirSync(destDir, { recursive: true });
copyFileSync(source, dest);
console.log(`Copied sidecar to ${dest}`);
