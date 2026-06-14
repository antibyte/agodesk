import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const baseArgs = [
  "run-with-speech-env.mjs",
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

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runTauriBuild(bundles) {
  const nodeArgs = [...baseArgs, "--bundles", bundles];
  const needsXvfb =
    process.platform === "linux" &&
    bundles.includes("appimage") &&
    (process.env.CI === "true" || !process.env.DISPLAY);

  if (needsXvfb) {
    run("xvfb-run", ["-a", "node", ...nodeArgs]);
    return;
  }
  run("node", nodeArgs);
}

// deb/rpm do not use linuxdeploy; AppImage does and needs xvfb on CI.
runTauriBuild("deb,rpm");
runTauriBuild("appimage");
