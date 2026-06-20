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

export function toTauriKeyEnvValue(rawSecret, normalizedPrivateKey) {
  const trimmed = rawSecret.trim();
  if (!trimmed.includes("untrusted comment")) {
    return trimmed;
  }
  return Buffer.from(`${normalizedPrivateKey}\n`, "utf8").toString("base64");
}

export function buildSigningEnv(rawSecret, normalizedPrivateKey, password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
  const env = {
    TAURI_SIGNING_PRIVATE_KEY: toTauriKeyEnvValue(rawSecret, normalizedPrivateKey),
  };
  if (password?.trim()) {
    env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = password.trim();
  }
  return env;
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

function disableSigning(reason) {
  setUpdaterArtifacts(false);
  writeGithubOutput(false, reason);
  console.warn("[release-signing] Updater signing disabled for this release.");
  console.warn(`[release-signing] ${reason}`);
  console.warn(
    "[release-signing] Installers will publish without .sig files and without latest.json.",
  );
}

function configure() {
  const rawSecret = readPrivateKeyRaw();
  const privateKey = normalizePrivateKey(rawSecret);
  const validation = validateTauriSigningKey(privateKey);
  if (!validation.ok) {
    disableSigning(validation.reason);
    return;
  }

  const signingEnv = buildSigningEnv(rawSecret, privateKey);
  if (!signingEnv.TAURI_SIGNING_PRIVATE_KEY) {
    disableSigning("Could not derive a single-line Tauri signing key from the secret.");
    return;
  }

  setUpdaterArtifacts(true);
  writeGithubOutput(true, "");
  console.log("[release-signing] Updater signing enabled.");
  console.log("[release-signing] Using single-line TAURI_SIGNING_PRIVATE_KEY (base64 key file).");
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
