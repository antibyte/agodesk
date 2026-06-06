import { createWriteStream, existsSync, mkdirSync, rmSync, renameSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelsRoot = join(root, "models", "speech");
const targetDir = join(modelsRoot, "whisper-small-de");

const ARCHIVE_URL =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-small.tar.bz2";
const ARCHIVE_NAME = "sherpa-onnx-whisper-small.tar.bz2";
const archivePath = join(modelsRoot, ARCHIVE_NAME);
const extractedDirName = "sherpa-onnx-whisper-small";

function isWhisperReady() {
  const encoder = join(targetDir, "small-encoder.int8.onnx");
  const decoder = join(targetDir, "small-decoder.int8.onnx");
  const tokens = join(targetDir, "small-tokens.txt");
  return existsSync(encoder) && existsSync(decoder) && existsSync(tokens);
}

async function downloadWithFetch(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  await pipeline(response.body, createWriteStream(destination));
}

function downloadWithCurl(url, destination) {
  const args = ["-L", "--fail", "--ssl-no-revoke", "--retry", "3", "-o", destination, url];
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
    } catch {
      console.warn("curl failed, trying fetch…");
    }
  }
  await downloadWithFetch(url, destination);
}

function extractArchive() {
  execFileSync("tar", ["xjf", archivePath, "-C", modelsRoot], { stdio: "inherit" });
}

async function main() {
  if (isWhisperReady()) {
    console.log(`Whisper small ASR already present at ${targetDir}`);
    return;
  }

  mkdirSync(modelsRoot, { recursive: true });

  console.log(`Downloading Whisper small (~610 MB) from ${ARCHIVE_URL}`);
  await download(ARCHIVE_URL, archivePath);

  console.log("Extracting archive…");
  extractArchive();

  const extractedDir = join(modelsRoot, extractedDirName);
  if (!existsSync(extractedDir)) {
    throw new Error(`Expected extracted folder missing: ${extractedDir}`);
  }

  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }

  renameSync(extractedDir, targetDir);

  if (existsSync(archivePath)) {
    rmSync(archivePath, { force: true });
  }

  if (!isWhisperReady()) {
    throw new Error(`Whisper model files missing after install: ${targetDir}`);
  }

  console.log(`Whisper small ASR ready at ${targetDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
