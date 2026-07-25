# Mistral Voice Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Voxtral Realtime ASR (live partials) and Streaming TTS to `mistral_voice`, with Silero still endpointing turns and a Settings toggle to fall back to Phase‑1 batch/unary.

**Architecture:** Rust proxies the Realtime WebSocket (`mistral_realtime.rs`, same pattern as `xai_realtime.rs`) and streams TTS via SSE (`mistral_synthesize_stream` + Tauri events). Frontend `MistralVoiceSession` appends mic audio while Silero detects speech, flushes on silence, and plays float32 PCM chunks as they arrive. When `mistralRealtimeEnabled` is false or a path fails, reuse Phase‑1 `mistral_transcribe` / `mistral_synthesize`.

**Tech Stack:** Tauri 2, Rust (`tokio-tungstenite`, `reqwest` + `stream`), Svelte 5, TypeScript, `node:test`

**Spec:** `docs/superpowers/specs/2026-07-24-mistral-voice-phase2-design.md`

## Global Constraints

- Do **not** add `mistral_voice` to `speechProviderIsCloudRealtime` (no agent-tool duplex).
- TTS request field is **`voice`** (not `voice_id`); default preset `en_paul_neutral` if empty.
- Realtime audio: `pcm_s16le` @ 16 kHz mono; TTS PCM: float32 LE @ 24 kHz.
- Never commit unless the user explicitly asks (project git rule overrides “frequent commits” below — treat commit steps as “ask user to commit”).
- Never run destructive git commands (`checkout --`, `reset --hard`, `clean -fd`).
- Verify with `npm run check`, targeted `node --import tsx --test …`, and `cargo check` in `src-tauri` before claiming done.
- Windows PowerShell: no `&&` chaining; use `;` or separate commands.

## File map

| File | Role |
| --- | --- |
| `src/lib/types/protocol.ts` | New settings fields + defaults |
| `src/lib/services/settings.ts` | Normalize new fields |
| `src/lib/i18n/messages/de.json`, `en.json` (+ parity) | Toggle / help / errors |
| `src/lib/components/SettingsView.svelte` | Realtime toggle UI |
| `src/lib/services/mistral-realtime-protocol.ts` | Pure parse helpers (WS + SSE) + tests |
| `src-tauri/src/mistral_realtime.rs` | WS proxy state + commands |
| `src-tauri/src/lib.rs` | `mod`, `manage`, register commands |
| `src-tauri/permissions/agodesk-commands.toml` | ACL |
| `src-tauri/Cargo.toml` | `reqwest` `stream` feature |
| `src-tauri/src/commands.rs` | `mistral_synthesize_stream` + cancel state |
| `src/lib/services/mistral-realtime.ts` | FE listen/send helpers |
| `src/lib/services/mistral-voice-session.ts` | Realtime path + batch fallback |
| `src/lib/services/mistral-tts.ts` | Streaming playback + unary fallback |
| `src/lib/services/mistral-voice.test.ts` | Settings / prefer-realtime tests |
| `docs/superpowers/specs/2026-07-24-mistral-voice-pipeline.md` | Note Phase 2 status |
| `docs/superpowers/specs/2026-07-24-mistral-voice-phase2-design.md` | Mark implemented when done |

---

### Task 1: Settings fields + normalize + i18n + toggle UI

**Files:**
- Modify: `src/lib/types/protocol.ts`
- Modify: `src/lib/services/settings.ts`
- Modify: `src/lib/i18n/messages/de.json`, `en.json` (then sync other locales)
- Modify: `src/lib/components/SettingsView.svelte`
- Test: `src/lib/services/mistral-voice.test.ts`

**Interfaces:**
- Produces: `SpeechSettings.mistralRealtimeEnabled: boolean` (default `true`), `mistralRealtimeAsrModel: string` (default `voxtral-mini-transcribe-realtime-2602`), `mistralTargetStreamingDelayMs: number` (default `480`)

- [ ] **Step 1: Write failing tests for new defaults / normalize**

Append to `src/lib/services/mistral-voice.test.ts`:

```typescript
test("normalizeAppSettings fills Phase-2 realtime defaults", () => {
  const normalized = normalizeAppSettings({ speech: { provider: "mistral_voice" } });
  assert.equal(normalized.speech.mistralRealtimeEnabled, true);
  assert.equal(
    normalized.speech.mistralRealtimeAsrModel,
    "voxtral-mini-transcribe-realtime-2602",
  );
  assert.equal(normalized.speech.mistralTargetStreamingDelayMs, 480);
});

test("normalizeAppSettings respects mistralRealtimeEnabled false", () => {
  const normalized = normalizeAppSettings({
    speech: { provider: "mistral_voice", mistralRealtimeEnabled: false },
  });
  assert.equal(normalized.speech.mistralRealtimeEnabled, false);
});
```

- [ ] **Step 2: Run tests — expect FAIL (fields missing)**

Run: `node --import tsx --test src/lib/services/mistral-voice.test.ts`  
Expected: FAIL on property access / undefined equality

- [ ] **Step 3: Extend protocol defaults**

In `protocol.ts` add constants and fields:

```typescript
export const DEFAULT_MISTRAL_REALTIME_ASR_MODEL =
  "voxtral-mini-transcribe-realtime-2602";
export const DEFAULT_MISTRAL_STREAMING_DELAY_MS = 480;

// on SpeechSettings:
mistralRealtimeEnabled: boolean;
mistralRealtimeAsrModel: string;
mistralTargetStreamingDelayMs: number;

// on DEFAULT_SPEECH_SETTINGS:
mistralRealtimeEnabled: true,
mistralRealtimeAsrModel: DEFAULT_MISTRAL_REALTIME_ASR_MODEL,
mistralTargetStreamingDelayMs: DEFAULT_MISTRAL_STREAMING_DELAY_MS,
```

- [ ] **Step 4: Normalize in `settings.ts`**

Inside `normalizeSpeechSettings` after `mistralVoiceId`:

```typescript
mistralRealtimeEnabled:
  typeof saved.mistralRealtimeEnabled === "boolean"
    ? saved.mistralRealtimeEnabled
    : DEFAULT_SPEECH_SETTINGS.mistralRealtimeEnabled,
mistralRealtimeAsrModel:
  typeof saved.mistralRealtimeAsrModel === "string" &&
  saved.mistralRealtimeAsrModel.trim().length > 0
    ? saved.mistralRealtimeAsrModel.trim()
    : DEFAULT_SPEECH_SETTINGS.mistralRealtimeAsrModel,
mistralTargetStreamingDelayMs: (() => {
  const raw = saved.mistralTargetStreamingDelayMs;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 120 && raw <= 2400) {
    return Math.round(raw);
  }
  return DEFAULT_SPEECH_SETTINGS.mistralTargetStreamingDelayMs;
})(),
```

- [ ] **Step 5: i18n keys (de + en)**

Add at least:

- `settings.speech.mistralRealtime.enabled`
- `settings.speech.mistralRealtime.help`
- `settings.speech.mistralRealtime.delayLabel`
- `settings.speech.mistralRealtime.delayHelp`

German example:

```json
"settings.speech.mistralRealtime.enabled": "Realtime-ASR + Streaming-TTS bevorzugen",
"settings.speech.mistralRealtime.help": "An: Live-Partials und frühere Sprachausgabe. Aus: Phase-1 Batch-Transcribe und unary TTS. Bei Fehlern fällt die Pipeline automatisch auf Phase-1 zurück.",
"settings.speech.mistralRealtime.delayLabel": "Realtime-Latenzziel (ms)",
"settings.speech.mistralRealtime.delayHelp": "Niedriger = schnellere Partials, ggf. weniger Genauigkeit (typisch 240–960)."
```

Mirror English in `en.json`, then sync missing keys into other locale files (same approach as Phase 1: fill from en).

- [ ] **Step 6: Settings UI toggle**

In the Mistral tests card in `SettingsView.svelte`, above the voice picker:

```svelte
<label class="field checkbox-field">
  <input
    type="checkbox"
    checked={draftSpeech.mistralRealtimeEnabled}
    onchange={(event) => {
      draftSpeech = {
        ...draftSpeech,
        mistralRealtimeEnabled: (event.currentTarget as HTMLInputElement).checked,
      };
      markDirty();
    }}
  />
  <span>{$i18n("settings.speech.mistralRealtime.enabled")}</span>
</label>
<p class="help">{$i18n("settings.speech.mistralRealtime.help")}</p>

{#if draftSpeech.mistralRealtimeEnabled}
  <label class="field">
    <span class="field-label">{$i18n("settings.speech.mistralRealtime.delayLabel")}</span>
    <select
      value={String(draftSpeech.mistralTargetStreamingDelayMs)}
      onchange={(event) => {
        draftSpeech = {
          ...draftSpeech,
          mistralTargetStreamingDelayMs: Number(
            (event.currentTarget as HTMLSelectElement).value,
          ),
        };
        markDirty();
      }}
    >
      <option value="240">240</option>
      <option value="480">480</option>
      <option value="960">960</option>
    </select>
  </label>
  <p class="help">{$i18n("settings.speech.mistralRealtime.delayHelp")}</p>
{/if}
```

- [ ] **Step 7: Re-run tests + check**

Run:

```
node --import tsx --test src/lib/services/mistral-voice.test.ts src/lib/i18n/i18n.test.ts
npm run check
```

Expected: PASS / 0 errors

- [ ] **Step 8: Ask user whether to commit** (do not commit unprompted)

---

### Task 2: Pure protocol helpers (Realtime events + SSE) with TDD

**Files:**
- Create: `src/lib/services/mistral-realtime-protocol.ts`
- Create: `src/lib/services/mistral-realtime-protocol.test.ts`

**Interfaces:**
- Produces:
  - `parseMistralRealtimeEvent(raw: unknown): { type: string; text?: string; errorMessage?: string }`
  - `accumulateRealtimeTranscript(prev: string, event: ReturnType<…>): string`
  - `parseMistralTtsSseBlock(block: string): { event: string; audioBase64?: string } | null`

- [ ] **Step 1: Failing tests**

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMistralRealtimeEvent,
  accumulateRealtimeTranscript,
  parseMistralTtsSseBlock,
} from "./mistral-realtime-protocol.ts";

test("parseMistralRealtimeEvent extracts text.delta", () => {
  const ev = parseMistralRealtimeEvent({
    type: "transcription.text.delta",
    text: "Hallo",
  });
  assert.equal(ev.type, "transcription.text.delta");
  assert.equal(ev.text, "Hallo");
});

test("accumulateRealtimeTranscript appends deltas and finalizes on done", () => {
  let text = "";
  text = accumulateRealtimeTranscript(text, {
    type: "transcription.text.delta",
    text: "Hi ",
  });
  text = accumulateRealtimeTranscript(text, {
    type: "transcription.text.delta",
    text: "there",
  });
  assert.equal(text, "Hi there");
  const done = parseMistralRealtimeEvent({
    type: "transcription.done",
    text: "Hi there",
  });
  assert.equal(done.type, "transcription.done");
});

test("parseMistralTtsSseBlock reads speech.audio.delta", () => {
  const parsed = parseMistralTtsSseBlock(
    'event: speech.audio.delta\ndata: {"audio_data":"AAAA"}\n',
  );
  assert.equal(parsed?.event, "speech.audio.delta");
  assert.equal(parsed?.audioBase64, "AAAA");
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --import tsx --test src/lib/services/mistral-realtime-protocol.test.ts`

- [ ] **Step 3: Implement helpers**

```typescript
export interface ParsedRealtimeEvent {
  type: string;
  text?: string;
  errorMessage?: string;
  raw: unknown;
}

export function parseMistralRealtimeEvent(raw: unknown): ParsedRealtimeEvent {
  if (!raw || typeof raw !== "object") {
    return { type: "unknown", raw };
  }
  const record = raw as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "unknown";
  const text =
    typeof record.text === "string"
      ? record.text
      : typeof (record as { delta?: unknown }).delta === "string"
        ? ((record as { delta: string }).delta)
        : undefined;
  let errorMessage: string | undefined;
  if (type === "error") {
    const err = record.error;
    if (typeof err === "string") errorMessage = err;
    else if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
      errorMessage = (err as { message: string }).message;
    }
  }
  return { type, text, errorMessage, raw };
}

export function accumulateRealtimeTranscript(
  prev: string,
  event: ParsedRealtimeEvent,
): string {
  if (event.type === "transcription.text.delta" && event.text) {
    return prev + event.text;
  }
  if (event.type === "transcription.done" && event.text && event.text.trim()) {
    return event.text;
  }
  return prev;
}

export function parseMistralTtsSseBlock(
  block: string,
): { event: string; audioBase64?: string } | null {
  const lines = block.split(/\r?\n/).map((l) => l.trimEnd());
  let event = "message";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    const json = JSON.parse(data) as { audio_data?: string; audioData?: string };
    const audioBase64 = json.audio_data ?? json.audioData;
    return { event, audioBase64 };
  } catch {
    return { event };
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Ask user whether to commit**

---

### Task 3: Rust Realtime WebSocket proxy

**Files:**
- Create: `src-tauri/src/mistral_realtime.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/permissions/agodesk-commands.toml`

**Interfaces:**
- Consumes: `commands::get_mistral_api_key`
- Produces Tauri commands:
  - `mistral_realtime_connect(model?: string, targetStreamingDelayMs?: number)`
  - `mistral_realtime_send(data: string)`
  - `mistral_realtime_disconnect()`
- Emits: `mistral-realtime:state`, `mistral-realtime:message`, `mistral-realtime:error`

- [ ] **Step 1: Scaffold module mirroring `xai_realtime.rs`**

Copy structure from `src-tauri/src/xai_realtime.rs`:

- State: `cancel`, `task`, `outbound` mpsc
- URL: `wss://api.mistral.ai/v1/audio/transcriptions/realtime?model={model}`
- Auth: `Authorization: Bearer {key}` via `get_mistral_api_key`
- Default model: `voxtral-mini-transcribe-realtime-2602`
- After connect / `session.created`, optionally send:

```json
{
  "type": "session.update",
  "session": {
    "audio_format": { "encoding": "pcm_s16le", "sample_rate": 16000 },
    "target_streaming_delay_ms": 480
  }
}
```

Use the `target_streaming_delay_ms` argument when provided.

Relay all inbound text frames as `mistral-realtime:message` with `{ data: string }`.

- [ ] **Step 2: Wire `mod mistral_realtime;` + `manage(MistralRealtimeState::default())` + register commands in `lib.rs`**

- [ ] **Step 3: ACL entries** in `agodesk-commands.toml`:

```
"mistral_realtime_connect",
"mistral_realtime_send",
"mistral_realtime_disconnect",
```

- [ ] **Step 4: `cargo check` in `src-tauri`**

Expected: Finished successfully

- [ ] **Step 5: Ask user whether to commit**

---

### Task 4: Frontend Realtime client + session wiring

**Files:**
- Create: `src/lib/services/mistral-realtime.ts`
- Modify: `src/lib/services/mistral-voice-session.ts`
- Modify: `src/lib/services/mistral-voice.test.ts` (optional behavior note / helper)

**Interfaces:**
- Produces:
  - `connectMistralRealtime(options): Promise<void>`
  - `sendMistralRealtimeJson(payload: object): Promise<void>`
  - `disconnectMistralRealtime(): Promise<void>`
  - `subscribeMistralRealtime(handlers): Promise<UnlistenFn[]>`
- Session: when `speech.mistralRealtimeEnabled`, open WS on connect; on each mic chunk while speaking send `input_audio.append`; on Silero complete send flush+end, wait for `transcription.done` (8s timeout) else batch fallback

- [ ] **Step 1: Implement `mistral-realtime.ts`**

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { parseMistralRealtimeEvent } from "./mistral-realtime-protocol";

export async function connectMistralRealtime(options: {
  model: string;
  targetStreamingDelayMs?: number;
}): Promise<void> {
  await invoke("mistral_realtime_connect", {
    model: options.model,
    targetStreamingDelayMs: options.targetStreamingDelayMs,
  });
}

export async function sendMistralRealtimeJson(payload: object): Promise<void> {
  await invoke("mistral_realtime_send", { data: JSON.stringify(payload) });
}

export async function disconnectMistralRealtime(): Promise<void> {
  await invoke("mistral_realtime_disconnect");
}

export async function subscribeMistralRealtime(handlers: {
  onMessage?: (raw: unknown) => void;
  onState?: (state: string) => void;
  onError?: (message: string) => void;
}): Promise<UnlistenFn[]> {
  const un: UnlistenFn[] = [];
  un.push(
    await listen<{ data: string }>("mistral-realtime:message", (event) => {
      try {
        handlers.onMessage?.(JSON.parse(event.payload.data));
      } catch {
        handlers.onMessage?.(event.payload.data);
      }
    }),
  );
  un.push(
    await listen<{ state: string }>("mistral-realtime:state", (event) => {
      handlers.onState?.(event.payload.state);
    }),
  );
  un.push(
    await listen<{ message: string }>("mistral-realtime:error", (event) => {
      handlers.onError?.(event.payload.message);
    }),
  );
  return un;
}

export function appendAudioMessage(pcmBase64: string) {
  return { type: "input_audio.append", audio: pcmBase64 };
}
export function flushAudioMessage() {
  return { type: "input_audio.flush" };
}
export function endAudioMessage() {
  return { type: "input_audio.end" };
}

export { parseMistralRealtimeEvent };
```

- [ ] **Step 2: Update `MistralVoiceSession`**

Behavior outline (implement fully in file):

1. Fields: `realtime = false`, `unlisteners`, `partialAcc = ""`, `pendingFinal: { resolve, reject, timer } | null`, `inSpeechForAppend` tracked via endpoint or local flag.
2. `connect()`: if `speech.mistralRealtimeEnabled`, try `connectMistralRealtime` + subscribe; on failure set `realtime=false` and continue (batch mode). Always set up Silero endpoint as today.
3. `sendAudio`: push to endpoint; if realtime and not transcribing, also `sendMistralRealtimeJson(appendAudioMessage(chunk))` once speech has started — simplest approach: always append when realtime (Silero still decides flush timing). Prefer always-append while session open and realtime to avoid missing leading audio.
4. On utterance complete `(pcmBase64)`:
   - if realtime: flush+end, wait for `transcription.done` (Promise with 8s timeout). On success → `onFinalTranscript`. On fail → `transcribeMistralUtterance(pcmBase64, …)`.
   - if !realtime: existing batch path.
5. `disconnect()`: clear pending, unlisten, `disconnectMistralRealtime()`.

Use `accumulateRealtimeTranscript` + `onPartialTranscript` on deltas.

- [ ] **Step 3: Manual smoke note** (no automated network test): with key + toggle on, Partials should move during speech.

- [ ] **Step 4: `npm run check` + existing mistral tests**

- [ ] **Step 5: Ask user whether to commit**

---

### Task 5: Streaming TTS (Rust SSE + frontend playback)

**Files:**
- Modify: `src-tauri/Cargo.toml` — add `stream` to reqwest features
- Modify: `src-tauri/src/commands.rs` — `mistral_synthesize_stream`, cancel handle
- Modify: `src-tauri/src/lib.rs` + ACL
- Modify: `src/lib/services/mistral-tts.ts`
- Reuse: `parseMistralTtsSseBlock` from Task 2

**Interfaces:**
- Produces:
  - `mistral_synthesize_stream({ text, voiceId?, model? })` starts job; emits `mistral-tts:chunk` `{ audioBase64, sampleRate, encoding }`, `mistral-tts:done`, `mistral-tts:error`
  - `mistral_synthesize_stream_cancel()`
- FE: if `mistralRealtimeEnabled` (same toggle), prefer stream path; else unary

- [ ] **Step 1: Enable reqwest stream feature**

```toml
reqwest = { version = "0.12", default-features = false, features = ["blocking", "native-tls", "multipart", "stream"] }
```

- [ ] **Step 2: Implement stream synthesize**

Use async `reqwest::Client` (not blocking) inside `tauri::async_runtime::spawn`, POST with `"stream": true`, `"voice": …`, `"response_format": "pcm"`. Read body as bytes stream, split on `\n\n`, parse with the same SSE rules as the TS helper (implement small Rust `parse_sse_block`).

Emit:

```rust
app.emit("mistral-tts:chunk", json!({ "audioBase64": …, "sampleRate": 24000, "encoding": "f32le" }));
app.emit("mistral-tts:done", json!({}));
```

Keep unary `mistral_synthesize` unchanged for fallback.

- [ ] **Step 3: Frontend streaming speak**

In `mistral-tts.ts`:

```typescript
export async function synthesizeMistralSpeechStreaming(
  text: string,
  speech: SpeechSettings,
  target: SpeechAudioPlayback,
): Promise<boolean> {
  // listen chunk/done/error, invoke mistral_synthesize_stream, enqueueBase64Float32Pcm each chunk, await done
}

export async function synthesizeMistralSpeech(...) {
  if (speech.mistralRealtimeEnabled) {
    try {
      if (await synthesizeMistralSpeechStreaming(text, speech, target)) return true;
    } catch (e) {
      console.warn("Mistral streaming TTS failed, falling back to unary:", e);
    }
  }
  // existing unary invoke("mistral_synthesize") …
}
```

Wire cancel into `interruptMistralTtsPlayback` → `invoke("mistral_synthesize_stream_cancel")`.

- [ ] **Step 4: `cargo check` + `npm run check`**

- [ ] **Step 5: Live probe** (optional, with user key): speak a short German sentence; audio should start before full generation completes.

- [ ] **Step 6: Ask user whether to commit**

---

### Task 6: Docs + full verification

**Files:**
- Modify: `docs/superpowers/specs/2026-07-24-mistral-voice-pipeline.md` — status line → Phase 1 shipped; Phase 2 implemented
- Modify: `docs/superpowers/specs/2026-07-24-mistral-voice-phase2-design.md` — status → implemented

- [ ] **Step 1: Update both specs’ status headers**

- [ ] **Step 2: Run full verification**

```
npm run check
npm test
cargo check
```

(from repo root / `src-tauri` as appropriate)

Expected: 0 svelte errors; all tests pass; cargo finished

- [ ] **Step 3: Ask user whether to commit the Phase‑2 docs + any remaining files**

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Settings toggle `mistralRealtimeEnabled` + delay | Task 1 |
| Realtime WS Rust proxy + ACL | Task 3 |
| Silero endpoint + append/flush/end + partials | Task 4 |
| Batch fallback on failure / toggle off | Task 4 + 5 |
| Streaming TTS SSE + float32 playback | Task 5 |
| Unary TTS fallback | Task 5 |
| Protocol parse helpers / tests | Task 2 |
| Docs update | Task 6 |
| Not cloud-realtime agent | Global constraint / Task 1 (no change to helper) |

## Placeholder / consistency self-review

- Event names locked: `mistral-realtime:*`, `mistral-tts:*`
- Command names locked: `mistral_realtime_connect|send|disconnect`, `mistral_synthesize_stream`, `mistral_synthesize_stream_cancel`
- Field `voice` (not `voice_id`) for TTS body
- Toggle gates both Realtime ASR and Streaming TTS (as agreed in design)
