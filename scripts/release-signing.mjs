#!/usr/bin/env node
/**
 * Validates Tauri updater signing secrets for CI releases.
 * Falls back to unsigned bundles when secrets are missing or malformed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriConfPath = path.join(root, "src-tauri", "tauri.conf.json");

function readPrivateKey() {
  const raw = process.env.TAURI_SIGNING_PRIVATE_KEY?.trim();
  return raw || "";
}

export function validateTauriSigningKey(privateKey, password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
  if (!privateKey) {
    return {
      ok: false,
      reason:
        "TAURI_SIGNING_PRIVATE_KEY is empty. Paste the full minisign private key (including the untrusted comment line).",
    };
  }

  if (!privateKey.includes("minisign private key") && !privateKey.includes("rsign encrypted secret key")) {
    return {
      ok: false,
      reason:
        'TAURI_SIGNING_PRIVATE_KEY is missing the key header line ("untrusted comment: minisign private key: ..." or "rsign encrypted secret key").',
    };
  }

  if (!/^RW[A-Za-z0-9+/=]+$/m.test(privateKey)) {
    return {
      ok: false,
      reason:
        "TAURI_SIGNING_PRIVATE_KEY does not contain a valid minisign secret key line (RW...).",
    };
  }

  const isRsignCiKey = privateKey.includes("rsign encrypted secret key");
  const looksEncrypted =
    privateKey.includes("encrypted secret key") && !isRsignCiKey;
  if (looksEncrypted && !password?.trim()) {
    return {
      ok: false,
      reason:
        "TAURI_SIGNING_PRIVATE_KEY appears encrypted but TAURI_SIGNING_PRIVATE_KEY_PASSWORD is empty.",
    };
  }

  return { ok: true, reason: "" };
}

function setUpdaterArtifacts(enabled) {
  const conf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
  conf.bundle ??= {};
  conf.bundle.createUpdaterArtifacts = enabled;
  fs.writeFileSync(tauriConfPath, `${JSON.stringify(conf, null, 2)}\n`, "utf8");
}

function writeGithubOutput(signed, reason) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }
  const lines = [`signed=${signed ? "true" : "false"}`];
  if (reason) {
    lines.push(`reason<<EOF`, reason, `EOF`);
  }
  fs.appendFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
}

function configure() {
  const privateKey = readPrivateKey();
  const validation = validateTauriSigningKey(privateKey);

  if (validation.ok) {
    setUpdaterArtifacts(true);
    writeGithubOutput(true, "");
    console.log("[release-signing] Updater signing enabled.");
    return;
  }

  setUpdaterArtifacts(false);
  delete process.env.TAURI_SIGNING_PRIVATE_KEY;
  delete process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
  writeGithubOutput(false, validation.reason);

  console.warn("[release-signing] Updater signing disabled for this release.");
  console.warn(`[release-signing] ${validation.reason}`);
  console.warn(
    "[release-signing] Installers will publish without .sig files and without latest.json.",
  );
  console.warn(
    "[release-signing] Fix GitHub secrets, then re-tag to enable auto-updates.",
  );
}

const command = process.argv[2] ?? "configure";
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  if (command === "configure") {
    configure();
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
