#!/usr/bin/env node
/**
 * Validates Tauri updater signing secrets for CI releases.
 * Falls back to unsigned bundles when secrets are missing or malformed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriConfPath = path.join(root, "src-tauri", "tauri.conf.json");

function readPrivateKeyRaw() {
  const raw = process.env.TAURI_SIGNING_PRIVATE_KEY?.trim();
  return raw || "";
}

export function normalizePrivateKey(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  if (!trimmed.includes("untrusted comment")) {
    try {
      const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim();
      if (decoded.includes("untrusted comment")) {
        return decoded.replace(/\r\n/g, "\n");
      }
    } catch {
      // fall through
    }
  }

  const normalized = trimmed.replace(/\r\n/g, "\n");
  if (normalized.includes("\n")) {
    return normalized;
  }

  const singleLine = normalized.match(/^(untrusted comment: .+?) (RW[A-Za-z0-9+/=]+)$/);
  if (singleLine) {
    return `${singleLine[1]}\n${singleLine[2]}`;
  }

  return normalized;
}

export function validateTauriSigningKey(privateKey, password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
  if (!privateKey) {
    return {
      ok: false,
      reason:
        "TAURI_SIGNING_PRIVATE_KEY is empty. Paste the base64 .key file content or the full decoded minisign key.",
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

function writeGithubOutput(signed, reason, keyPath = "") {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }
  const lines = [`signed=${signed ? "true" : "false"}`];
  if (keyPath) {
    lines.push(`key_path=${keyPath}`);
  }
  if (reason) {
    lines.push(`reason<<EOF`, reason, `EOF`);
  }
  fs.appendFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
}

function writeGithubEnv(keyPath) {
  const envPath = process.env.GITHUB_ENV;
  if (!envPath) {
    return;
  }
  fs.appendFileSync(
    envPath,
    [
      `TAURI_SIGNING_PRIVATE_KEY_PATH=${keyPath}`,
      "TAURI_SIGNING_PRIVATE_KEY=",
    ].join("\n") + "\n",
    "utf8",
  );
}

export function toTauriKeyFileContent(rawSecret, normalizedPrivateKey) {
  const trimmed = rawSecret.trim();
  if (!trimmed.includes("untrusted comment")) {
    return trimmed;
  }
  return Buffer.from(`${normalizedPrivateKey}\n`, "utf8").toString("base64");
}

function materializeSigningKey(rawSecret, normalizedPrivateKey) {
  const keyPath = path.join(
    process.env.RUNNER_TEMP || os.tmpdir(),
    "tauri-signing.key",
  );
  const fileContent = toTauriKeyFileContent(rawSecret, normalizedPrivateKey);
  fs.writeFileSync(keyPath, `${fileContent}\n`, { mode: 0o600 });
  return keyPath;
}

function configure() {
  const rawSecret = readPrivateKeyRaw();
  const privateKey = normalizePrivateKey(rawSecret);
  const validation = validateTauriSigningKey(privateKey);

  if (validation.ok) {
    const keyPath = materializeSigningKey(rawSecret, privateKey);
    setUpdaterArtifacts(true);
    writeGithubOutput(true, "", keyPath);
    writeGithubEnv(keyPath);
    console.log("[release-signing] Updater signing enabled.");
    console.log(`[release-signing] Private key materialized at ${keyPath}`);
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
