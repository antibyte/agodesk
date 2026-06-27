#!/usr/bin/env node
/**
 * Build Tauri updater latest.json from release assets (NSIS + Linux bundle + .sig files).
 *
 * Usage:
 *   node scripts/generate-update-manifest.mjs \
 *     --tag v0.2.0 \
 *     --assets release-assets \
 *     --repo antibyte/agodesk \
 *     --out release-assets/latest.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const options = {
    tag: "",
    assets: "release-assets",
    repo: "antibyte/agodesk",
    out: "",
    notes: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--tag") {
      options.tag = argv[++index] ?? "";
    } else if (arg === "--assets") {
      options.assets = argv[++index] ?? options.assets;
    } else if (arg === "--repo") {
      options.repo = argv[++index] ?? options.repo;
    } else if (arg === "--out") {
      options.out = argv[++index] ?? "";
    } else if (arg === "--notes") {
      options.notes = argv[++index] ?? "";
    }
  }

  if (!options.tag.startsWith("v")) {
    throw new Error(`Invalid --tag (expected vX.Y.Z): ${options.tag}`);
  }

  options.out = options.out || path.join(options.assets, "latest.json");
  return options;
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function readSignature(sigPath) {
  return fs.readFileSync(sigPath, "utf8").trim();
}

function assetUrl(repo, tag, fileName) {
  return `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(fileName)}`;
}

export function findSignedBundle(files, matchers) {
  for (const matcher of matchers) {
    const bundlePath = files.find((file) => matcher.test(file) && !file.endsWith(".sig"));
    if (!bundlePath) {
      continue;
    }
    const sigPath = `${bundlePath}.sig`;
    if (fs.existsSync(sigPath)) {
      return { bundlePath, sigPath };
    }
  }
  return null;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const version = options.tag.replace(/^v/, "");
  const files = walkFiles(options.assets);

  const windows = findSignedBundle(files, [/-setup\.exe$/i]);
  const linux = findSignedBundle(files, [/\.AppImage$/i, /\.deb$/i]);

  if (!windows) {
    throw new Error("Signed NSIS setup .exe not found in assets");
  }

  if (!linux) {
    throw new Error("Signed Linux update bundle not found in assets (.AppImage or .deb with .sig)");
  }

  const manifest = {
    version,
    notes: options.notes || `agodesk ${version}`,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        signature: readSignature(windows.sigPath),
        url: assetUrl(options.repo, options.tag, path.basename(windows.bundlePath)),
      },
      "linux-x86_64": {
        signature: readSignature(linux.sigPath),
        url: assetUrl(options.repo, options.tag, path.basename(linux.bundlePath)),
      },
    },
  };

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote ${options.out} for version ${version}`);
  console.log(`Linux update bundle: ${path.basename(linux.bundlePath)}`);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main();
}
