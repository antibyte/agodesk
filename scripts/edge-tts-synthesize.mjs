#!/usr/bin/env node
/**
 * Edge TTS synthesis helper (Node). Used as fallback when the Rust client fails.
 * Usage: node scripts/edge-tts-synthesize.mjs <text> <voice>
 * stdout: JSON { ok, audio_base64?, mime_type?, error? }
 */

const text = process.argv[2]?.trim() ?? "";
const voice = process.argv[3]?.trim() || "de-DE-KatjaNeural";

function respond(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

if (!text) {
  respond({ ok: false, error: "text is required" });
  process.exit(1);
}

let EdgeTTS;
try {
  ({ EdgeTTS } = await import("edge-tts-universal"));
} catch {
  respond({
    ok: false,
    error: "edge-tts-universal is not installed. Run: npm install edge-tts-universal",
  });
  process.exit(1);
}

try {
  const tts = new EdgeTTS(text, voice);
  const result = await tts.synthesize();
  const audioBuffer = Buffer.from(await result.audio.arrayBuffer());
  if (audioBuffer.length === 0) {
    respond({ ok: false, error: "Edge TTS returned empty audio" });
    process.exit(1);
  }
  respond({
    ok: true,
    audio_base64: audioBuffer.toString("base64"),
    mime_type: "audio/mpeg",
  });
} catch (error) {
  respond({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}
