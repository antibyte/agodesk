import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const speechEnvScript = join(root, "scripts", "run-with-speech-env.mjs");

const baseArgs = [
  speechEnvScript,
  "npx",
  "tauri",
  "build",
  "--features",
  "computer-use-sidecar,speech-sidecar",
];

const env = {
  ...process.env,
  APPIMAGE_EXTRACT_AND_RUN: "1",
};

function run(command, args, { optional = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    if (optional) {
      console.warn(
        `[agodesk:linux-bundles] Optional bundle step failed (${command} ${args.join(" ")}), continuing.`,
      );
      return false;
    }
    process.exit(result.status ?? 1);
  }
  return true;
}

function runTauriBuild(bundles, { optional = false } = {}) {
  const nodeArgs = [...baseArgs, "--bundles", bundles];
  const needsXvfb =
    process.platform === "linux" &&
    bundles.includes("appimage") &&
    (process.env.CI === "true" || !process.env.DISPLAY);

  if (needsXvfb) {
    return run("xvfb-run", ["-a", "node", ...nodeArgs], { optional });
  }
  return run("node", nodeArgs, { optional });
}

// deb + rpm are required for CI releases; AppImage/linuxdeploy is best-effort on headless runners.
if (!runTauriBuild("deb,rpm")) {
  process.exit(1);
}

runTauriBuild("appimage", { optional: true });
