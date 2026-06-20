#!/usr/bin/env node
/**
 * Build Tauri updater latest.json from release assets (NSIS + AppImage + .sig files).
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  const version = options.tag.replace(/^v/, "");
  const files = walkFiles(options.assets);

  const nsisExe = files.find((file) => /-setup\.exe$/i.test(file) && !file.endsWith(".sig"));
  const appImage = files.find((file) => file.endsWith(".AppImage") && !file.endsWith(".sig"));

  if (!nsisExe) {
    throw new Error("NSIS setup .exe not found in assets");
  }

  if (!appImage) {
    throw new Error("Linux AppImage not found in assets");
  }

  const nsisSig = `${nsisExe}.sig`;
  const appImageSig = `${appImage}.sig`;

  if (!fs.existsSync(nsisSig)) {
    throw new Error(`Missing signature file: ${nsisSig}`);
  }

  if (!fs.existsSync(appImageSig)) {
    throw new Error(`Missing signature file: ${appImageSig}`);
  }

  const manifest = {
    version,
    notes: options.notes || `agodesk ${version}`,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        signature: readSignature(nsisSig),
        url: assetUrl(options.repo, options.tag, path.basename(nsisExe)),
      },
      "linux-x86_64": {
        signature: readSignature(appImageSig),
        url: assetUrl(options.repo, options.tag, path.basename(appImage)),
      },
    },
  };

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote ${options.out} for version ${version}`);
}

main();
