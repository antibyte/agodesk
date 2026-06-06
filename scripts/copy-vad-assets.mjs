/**
 * Copies Silero + ONNX Runtime WASM assets into public/vad/.
 * These files are committed in the repo — run this script only when updating
 * @ricky0123/vad-web or onnxruntime-web versions.
 *
 * Usage:
 *   node scripts/copy-vad-assets.mjs          # overwrite all bundled assets
 *   node scripts/copy-vad-assets.mjs --if-missing  # skip when silero_vad.onnx exists
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "vad");
const ifMissing = process.argv.includes("--if-missing");

const BUNDLED_ASSETS = [
  {
    src: "node_modules/@ricky0123/vad-web/dist/silero_vad.onnx",
    dest: "silero_vad.onnx",
  },
  {
    src: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
    dest: "ort-wasm-simd-threaded.wasm",
  },
  {
    src: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
    dest: "ort-wasm-simd-threaded.mjs",
  },
];

if (ifMissing && fs.existsSync(path.join(outDir, "silero_vad.onnx"))) {
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

for (const { src, dest } of BUNDLED_ASSETS) {
  const sourcePath = path.join(root, src);
  if (!fs.existsSync(sourcePath)) {
    console.error(`Missing ${src} — run npm install`);
    process.exit(1);
  }
  fs.copyFileSync(sourcePath, path.join(outDir, dest));
  console.log(`vad assets: ${dest}`);
}

// Remove legacy copies from the previous “copy everything” approach.
for (const name of fs.readdirSync(outDir)) {
  if (name === "README.md") continue;
  if (!BUNDLED_ASSETS.some((asset) => asset.dest === name)) {
    fs.unlinkSync(path.join(outDir, name));
    console.log(`vad assets: removed ${name}`);
  }
}
