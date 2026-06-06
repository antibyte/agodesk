import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const piperRoot = join(root, "models", "speech", "piper");

const DEFAULT_VOICES = ["de_DE-thorsten-high", "de_DE-kerstin-low"];

const voices = (() => {
  const voiceArg = process.argv.find((arg) => arg.startsWith("--voice="));
  if (voiceArg) {
    return [voiceArg.slice("--voice=".length)];
  }
  return DEFAULT_VOICES;
})();

function voiceReady(voiceId) {
  const dir = join(piperRoot, `vits-piper-${voiceId}`);
  return (
    existsSync(join(dir, `${voiceId}.onnx`)) && existsSync(join(dir, "tokens.txt"))
  );
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  await pipeline(response.body, createWriteStream(destination));
}

function extractArchive(archivePath) {
  execFileSync("tar", ["xjf", archivePath, "-C", piperRoot], { stdio: "inherit" });
}

async function installVoice(voiceId) {
  if (voiceReady(voiceId)) {
    console.log(`Piper voice already present: ${voiceId}`);
    return;
  }

  const archiveName = `vits-piper-${voiceId}.tar.bz2`;
  const archiveUrl = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${archiveName}`;
  const archivePath = join(piperRoot, archiveName);

  mkdirSync(piperRoot, { recursive: true });

  console.log(`Downloading ${voiceId} from ${archiveUrl}`);
  await download(archiveUrl, archivePath);

  console.log(`Extracting ${archiveName}…`);
  extractArchive(archivePath);

  if (existsSync(archivePath)) {
    rmSync(archivePath, { force: true });
  }

  if (!voiceReady(voiceId)) {
    throw new Error(`Piper voice files missing after install: ${voiceId}`);
  }

  console.log(`Piper voice ready: ${voiceId}`);
}

async function main() {
  for (const voiceId of voices) {
    await installVoice(voiceId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
