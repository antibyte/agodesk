import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = join(root, "src-tauri");
const profile = process.env.CARGO_PROFILE === "debug" ? "debug" : "release";
const isWindows = process.platform === "win32";
const sourceName = isWindows ? "agodesk-worker.exe" : "agodesk-worker";
const source = join(tauriDir, "target", profile, sourceName);

let triple = process.env.CARGO_BUILD_TARGET;
if (!triple) {
  const arch =
    process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : process.arch;
  if (isWindows) {
    triple = `${arch}-pc-windows-msvc`;
  } else {
    triple = `${arch}-unknown-linux-gnu`;
  }
}
const destDir = join(tauriDir, "bin");
const destName = isWindows ? `agodesk-worker-${triple}.exe` : `agodesk-worker-${triple}`;
const dest = join(destDir, destName);

mkdirSync(destDir, { recursive: true });

if (process.argv.includes("--ensure-dummy")) {
  if (!existsSync(dest)) {
    // Create a small placeholder so tauri-build's externalBin existence check (during `cargo build --bin agodesk-worker`)
    // passes on clean checkouts / first `build:sidecar`. The real binary will overwrite it right after the cargo step.
    writeFileSync(dest, "");
    console.log(
      `Ensured dummy sidecar placeholder at ${dest} (will be overwritten after cargo build)`,
    );
  }
  process.exit(0);
}

if (!existsSync(source)) {
  console.error(`Sidecar binary missing: ${source}`);
  console.error("Run: cd src-tauri && cargo build --release --bin agodesk-worker");
  process.exit(1);
}

copyFileSync(source, dest);
console.log(`Copied sidecar to ${dest}`);
