# agodesk-speech Sidecar Protocol (Draft)

JSON-lines over stdin/stdout, same pattern as `agodesk-worker`. One request per line, one response per line.

## Request envelope

```json
{ "id": "uuid", "op": "transcribe", "params": { ... } }
```

## Response envelope

```json
{ "id": "uuid", "ok": true, "data": { ... } }
{ "id": "uuid", "ok": false, "error": "message" }
```

## Operations

### `ping`

Health check.

**Response `data`:** `{ "version": "0.1.0" }`

### `list_voices`

**Params:** `{ "backend": "piper" | "edge_tts" }`

**Response `data`:** `{ "voices": [{ "id": "de_DE-thorsten-high", "label": "Thorsten (DE)" }] }`

### `transcribe`

Local ASR (sherpa-onnx).

**Params:**

| Field | Type | Description |
|-------|------|-------------|
| `pcm_base64` | string | 16-bit LE PCM, mono |
| `sample_rate` | number | typically `16000` |
| `language` | string? | BCP-47 hint, e.g. `de-DE` |
| `model` | string? | `omnilingual_ctc_int8` or `whisper_small_de` |

**Response `data`:** `{ "text": "...", "language": "de", "model_ready": true }`

Without a model: error (production) or dev placeholder when `AGODESK_SPEECH_DEV=1`.

### `asr_status`

Check whether the local ASR model files exist.

**Params:** `{ "model": "omnilingual_ctc_int8" | "whisper_small_de" | null }`

**Response `data`:** `{ "model_id", "ready", "model_path", "tokens_path", "models_root", "download_hint" }`

Install model from project root: `npm run download:speech-asr`

### `synthesize`

TTS via Piper (offline VITS) when model files are installed; dev placeholder tone otherwise.

**Params:** same as before (`backend`: `piper` | `edge_tts` | `azure`)

**Response `data`:** `{ "pcm_base64", "sample_rate", "model_ready": true }` when Piper voice is installed.

### `tts_status`

Check whether a Piper voice is installed.

**Params:** `{ "voice": "de_DE-thorsten-high" | null }`

**Response `data`:** `{ "voice_id", "ready", "model_path", "tokens_path", "models_root", "download_hint" }`

Install: `npm run download:speech-tts`

## Client integration (planned)

- `LocalSpeechOrchestrator` buffers utterances via Silero VAD endpointing.
- On utterance end → `transcribe` → AuraGo `chat.message` → response text → sentence split → parallel `synthesize` → ordered playback via `SpeechAudioPlayback`.

## Model layout

```
models/speech/omnilingual-ctc-int8/model.int8.onnx          # Omnilingual ASR (1600+ languages)
models/speech/omnilingual-ctc-int8/tokens.txt
models/speech/whisper-small-de/small-encoder.int8.onnx # Whisper small (multilingual, DE)
models/speech/whisper-small-de/small-decoder.int8.onnx
models/speech/whisper-small-de/small-tokens.txt
models/speech/piper/vits-piper-de_DE-thorsten-high/     # Piper TTS
models/speech/piper/vits-piper-de_DE-thorsten-high/de_DE-thorsten-high.onnx
models/speech/piper/vits-piper-de_DE-thorsten-high/tokens.txt
```

| Script | Model |
|--------|-------|
| `npm run download:speech-asr` | Omnilingual ASR int8 (~348 MB) |
| `npm run download:speech-whisper` | Whisper small (~610 MB) |
| `npm run download:speech-tts` | Piper Thorsten + Kerstin |
| `npm run download:speech-models` | All of the above |

Settings → Speech shows ASR/TTS readiness per selected model/voice.

## Build: sherpa-onnx native libraries (Windows)

### TLS / download errors

`npm run download:sherpa-onnx-libs` uses `curl --ssl-no-revoke` on Windows. npm/cargo scripts set `SHERPA_ONNX_LIB_DIR` via `scripts/run-with-speech-env.mjs`.

### LNK2001 `__std_find_*` linker errors

The **static** sherpa-onnx prebuilt libs (v1.13.2) were compiled with **MSVC 14.42+** STL. If your VS 2022 is older (e.g. 14.40), static linking fails with unresolved `__std_search_*`, `__std_find_last_of_trivial_pos_*`, etc.

**Fix used in agodesk:** link against **shared** sherpa-onnx DLLs (`features = ["shared"]` on the `sherpa-onnx` crate). Download:

```powershell
npm run download:sherpa-onnx-libs
npm run tauri dev
```

Close any running agodesk/tauri process before rebuilding (DLL file lock on `target/debug/*.dll`).

**Alternative:** update Visual Studio 2022 to the latest 17.12+ release (MSVC 14.42+) and use static libs again.

### Linux / macOS

Uses static prebuilt libs from the same download script (platform-specific archive). No shared-Windows workaround needed.
