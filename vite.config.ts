import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const vadAssetsDir = path.join(rootDir, "assets", "vad");

const VAD_MIME: Record<string, string> = {
  ".wasm": "application/wasm",
  ".mjs": "text/javascript",
  ".onnx": "application/octet-stream",
};

/** Serve ONNX/Silero assets at /vad/ without placing them in public/ (Vite blocks import() from public). */
function vadAssetsPlugin(): Plugin {
  return {
    name: "vad-assets",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? "";
        if (!rawUrl.startsWith("/vad/")) {
          next();
          return;
        }

        const urlPath = decodeURIComponent(rawUrl.split("?")[0] ?? "");
        const relative = urlPath.replace(/^\/vad\/?/, "");
        if (!relative || relative.includes("..")) {
          res.statusCode = 403;
          res.end();
          return;
        }

        const filePath = path.join(vadAssetsDir, relative);
        if (!filePath.startsWith(vadAssetsDir)) {
          res.statusCode = 403;
          res.end();
          return;
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          next();
          return;
        }

        const ext = path.extname(filePath);
        res.setHeader("Content-Type", VAD_MIME[ext] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        fs.createReadStream(filePath).pipe(res);
      });
    },
    closeBundle() {
      if (!fs.existsSync(vadAssetsDir)) {
        return;
      }
      const outDir = path.join(rootDir, "dist", "vad");
      fs.mkdirSync(outDir, { recursive: true });
      for (const name of fs.readdirSync(vadAssetsDir)) {
        if (name === "README.md") {
          continue;
        }
        fs.copyFileSync(path.join(vadAssetsDir, name), path.join(outDir, name));
      }
    },
  };
}

export default defineConfig({
  plugins: [vadAssetsPlugin(), svelte()],
  clearScreen: false,
  // WebView2 / modern desktop runtimes; esbuild 0.28 cannot downlevel Svelte 5 / vad-web destructuring.
  esbuild: {
    target: "es2022",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2022",
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("onnxruntime-web")) {
            return "onnx";
          }

          if (id.includes("@ricky0123/vad-web")) {
            return "vad-web";
          }

          if (id.includes("chat-audio-impl") || id.includes("speech-audio-playback")) {
            return "chat-audio";
          }

          if (id.includes("mdast-util") || id.includes("micromark") || id.includes("mdast")) {
            return "markdown";
          }
          if (id.includes("@tauri-apps")) {
            return "tauri";
          }
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
