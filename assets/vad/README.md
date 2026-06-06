# Silero VAD assets (bundled offline)

These files are served locally at `/vad/` — nothing is downloaded at runtime.

| File | Purpose |
|------|---------|
| `silero_vad.onnx` | Silero voice-activity model (~1.7 MB) |
| `ort-wasm-simd-threaded.wasm` | ONNX Runtime WebAssembly backend |
| `ort-wasm-simd-threaded.mjs` | ONNX Runtime loader |
| `ort-wasm-simd-threaded.jsep.wasm` | ONNX Runtime JSEP backend (required by ort 1.26+) |
| `ort-wasm-simd-threaded.jsep.mjs` | ONNX Runtime JSEP loader |

Served via `vite.config.ts` from `assets/vad/` (not `public/`, because Vite disallows `import()` from public files).

To refresh after upgrading `@ricky0123/vad-web` or `onnxruntime-web`:

```bash
npm run copy:vad
```
