import { createWriteStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import { copyFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";

const VERSION = "1.13.2";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = join(root, "vendor", "sherpa-onnx", `v${VERSION}`);

/** Matches sherpa-onnx-sys archive_name() for the active link mode. */
export function sherpaArchiveName(platform = process.platform, arch = process.arch) {
  if (platform === "win32" && arch === "x64") {
    // Shared DLLs avoid MSVC 14.42+ static STL symbol requirements on Windows.
    return `sherpa-onnx-v${VERSION}-win-x64-shared-MT-Release-lib.tar.bz2`;
  }
  if (platform === "linux" && arch === "x64") {
    return `sherpa-onnx-v${VERSION}-linux-x64-static-lib.tar.bz2`;
  }
  if (platform === "darwin" && arch === "x64") {
    return `sherpa-onnx-v${VERSION}-osx-x64-static-lib.tar.bz2`;
  }
  if (platform === "darwin" && arch === "arm64") {
    return `sherpa-onnx-v${VERSION}-osx-arm64-static-lib.tar.bz2`;
  }
  throw new Error(`Unsupported platform ${platform}/${arch} for sherpa-onnx prebuilt libs.`);
}

export function sherpaPlatformDir(platform = process.platform) {
  if (platform === "win32") return join(vendorRoot, "win-x64-shared");
  if (platform === "linux") return join(vendorRoot, "linux-x64");
  if (platform === "darwin") return join(vendorRoot, process.arch === "arm64" ? "osx-arm64" : "osx-x64");
  throw new Error(`Unsupported platform: ${platform}`);
}

export function sherpaLibDir(platform = process.platform, arch = process.arch) {
  const archiveStem = sherpaArchiveName(platform, arch).replace(".tar.bz2", "");
  return join(sherpaPlatformDir(platform), archiveStem, "lib");
}

export function sherpaArchiveDir(platform = process.platform) {
  return sherpaPlatformDir(platform);
}

async function downloadWithFetch(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  await pipeline(response.body, createWriteStream(destination));
}

function downloadWithCurl(url, destination) {
  const args = ["-L", "--fail", "--retry", "3", "-o", destination, url];
  if (process.platform === "win32") {
    args.splice(1, 0, "--ssl-no-revoke");
  }
  const result = spawnSync("curl", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    throw new Error(`curl download failed (exit ${result.status ?? "unknown"})`);
  }
}

async function download(url, destination) {
  if (process.platform === "win32") {
    try {
      downloadWithCurl(url, destination);
      return;
    } catch (curlError) {
      console.warn("curl download failed, trying fetch…", curlError instanceof Error ? curlError.message : curlError);
    }
  }
  await downloadWithFetch(url, destination);
}

function extractArchive(archivePath, platformDir) {
  execFileSync("tar", ["xjf", archivePath, "-C", platformDir], { stdio: "inherit" });
}

export function isSherpaReady(platform = process.platform, arch = process.arch) {
  const libDir = sherpaLibDir(platform, arch);
  if (!existsSync(libDir)) {
    return false;
  }
  if (platform === "win32") {
    return readdirSync(libDir).some((name) => name.endsWith(".dll"));
  }
  return readdirSync(libDir).some((name) => name.endsWith(".lib") || name.endsWith(".a"));
}

export function isSherpaArchivePresent(platform = process.platform, arch = process.arch) {
  return existsSync(join(sherpaArchiveDir(platform), sherpaArchiveName(platform, arch)));
}

export function copySherpaRuntimeDlls(destDir) {
  if (process.platform !== "win32") {
    return;
  }
  const libDir = sherpaLibDir();
  if (!existsSync(libDir)) {
    return;
  }
  mkdirSync(destDir, { recursive: true });
  for (const name of readdirSync(libDir)) {
    if (name.toLowerCase().endsWith(".dll")) {
      copyFileSync(join(libDir, name), join(destDir, name));
    }
  }
}

async function main() {
  const archive = sherpaArchiveName();
  const platformDir = sherpaArchiveDir();
  const archivePath = join(platformDir, archive);
  const libDir = sherpaLibDir();
  const archiveUrl = `https://github.com/k2-fsa/sherpa-onnx/releases/download/v${VERSION}/${archive}`;

  if (isSherpaReady()) {
    console.log(`sherpa-onnx libs already present at ${libDir}`);
    printEnvHint();
    return;
  }

  mkdirSync(platformDir, { recursive: true });

  if (!isSherpaArchivePresent()) {
    console.log(`Downloading ${archiveUrl}`);
    await download(archiveUrl, archivePath);
  } else {
    console.log(`Using cached archive ${archivePath}`);
  }

  console.log("Extracting archive…");
  extractArchive(archivePath, platformDir);

  if (!isSherpaReady()) {
    throw new Error(`Expected lib directory missing or incomplete: ${libDir}`);
  }

  console.log(`sherpa-onnx native libs ready at ${libDir}`);
  printEnvHint();
}

function printEnvHint() {
  const archiveDir = sherpaArchiveDir().replace(/\\/g, "/");
  console.log("");
  console.log("Set SHERPA_ONNX_LIB_DIR for cargo (PowerShell):");
  console.log(`  $env:SHERPA_ONNX_LIB_DIR="${sherpaLibDir().replace(/\\/g, "/")}"`);
  console.log(`Archive dir: ${archiveDir}`);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("");
    console.error(`Manual fallback: download ${sherpaArchiveName()} from`);
    console.error(`https://github.com/k2-fsa/sherpa-onnx/releases/tag/v${VERSION}`);
    console.error(`Place the .tar.bz2 in ${sherpaArchiveDir()}, then re-run this script or cargo build.`);
    process.exit(1);
  });
}
