import { createWriteStream, existsSync, mkdirSync, rmSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelsRoot = join(root, "models", "speech");
const targetDir = join(modelsRoot, "omnilingual-ctc-int8");
const modelFile = join(targetDir, "model.int8.onnx");
const tokensFile = join(targetDir, "tokens.txt");

const ARCHIVE_URL =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12.tar.bz2";
const ARCHIVE_NAME = "sherpa-onnx-omnilingual-asr-300M-int8.tar.bz2";
const archivePath = join(modelsRoot, ARCHIVE_NAME);
const extractedDirName =
  "sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12";

async function download(url, destination) {
  if (process.platform === "win32") {
    try {
      const { spawnSync } = await import("node:child_process");
      const args = ["-L", "--fail", "--ssl-no-revoke", "--retry", "3", "-o", destination, url];
      const result = spawnSync("curl", args, { stdio: "inherit", shell: true });
      if (result.status === 0) return;
    } catch {
      /* fetch fallback */
    }
  }
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  await pipeline(response.body, createWriteStream(destination));
}

function extractArchive() {
  execFileSync("tar", ["xjf", archivePath, "-C", modelsRoot], { stdio: "inherit" });
}

async function main() {
  if (existsSync(modelFile) && existsSync(tokensFile)) {
    console.log(`ASR model already present at ${targetDir}`);
    return;
  }

  mkdirSync(modelsRoot, { recursive: true });

  console.log(`Downloading Omnilingual ASR int8 from ${ARCHIVE_URL}`);
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

  if (!existsSync(modelFile) || !existsSync(tokensFile)) {
    throw new Error(`Model files missing after install: ${targetDir}`);
  }

  console.log(`Omnilingual ASR ready at ${targetDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
