import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SPEECH_SETTINGS } from "../types/protocol.ts";
import {
  buildGrokVoiceWsUrl,
  normalizeGrokVoiceModelId,
  normalizeGrokVoiceName,
  toGrokLanguageHint,
} from "../types/grok-voice.ts";
import {
  buildGrokAudioAppendMessage,
  buildGrokForceMessage,
  buildGrokFunctionCallOutputMessage,
  buildGrokResponseCreateMessage,
  buildGrokSessionUpdate,
  truncateForGrokForceMessage,
  extractGrokErrorMessage,
  extractGrokFunctionCall,
  extractGrokInputTranscript,
  extractGrokOutputAudioDelta,
  extractGrokOutputTranscriptDelta,
  parseGrokEvent,
} from "./grok-voice.ts";

describe("grok-voice helpers", () => {
  it("normalizes model ids and builds WS URL", () => {
    assert.equal(normalizeGrokVoiceModelId(""), "grok-voice-latest");
    assert.equal(normalizeGrokVoiceModelId("grok-voice"), "grok-voice-latest");
    assert.equal(normalizeGrokVoiceModelId("grok-voice-think-fast-1"), "grok-voice-think-fast-1.0");
    assert.match(
      buildGrokVoiceWsUrl("grok-voice-latest"),
      /^wss:\/\/api\.x\.ai\/v1\/realtime\?model=grok-voice-latest$/,
    );
  });

  it("normalizes voice names and language hints", () => {
    assert.equal(normalizeGrokVoiceName(""), "eve");
    assert.equal(normalizeGrokVoiceName("Eve"), "eve");
    assert.equal(toGrokLanguageHint("de-DE"), "de");
    assert.equal(toGrokLanguageHint("es"), "es-ES");
    assert.equal(toGrokLanguageHint("es-MX"), "es-MX");
    assert.equal(toGrokLanguageHint("pt-BR"), "pt-BR");
    assert.equal(toGrokLanguageHint("ja-JP"), "ja");
  });

  it("buildGrokSessionUpdate setzt 16k/24k PCM und Tools im Agent-Mode", () => {
    const update = buildGrokSessionUpdate(
      {
        ...DEFAULT_SPEECH_SETTINGS,
        provider: "grok_voice",
        modelId: "grok-voice-latest",
        voiceName: "Leo",
        agentMode: true,
        language: "de-DE",
      },
      {
        connectionStatus: "connected",
        sessionStatus: "accepted",
        remoteControlActive: false,
        remoteControlPending: false,
        canSendChat: true,
      },
    );

    assert.equal(update.type, "session.update");
    const session = update.session as Record<string, unknown>;
    assert.equal(session.voice, "leo");
    assert.equal(typeof session.instructions, "string");
    assert.match(String(session.instructions), /send_message_to_aurago|AuraGo/i);

    const audio = session.audio as {
      input: { format: { rate: number }; transcription?: { language_hint: string } };
      output: { format: { rate: number } };
    };
    assert.equal(audio.input.format.rate, 16000);
    assert.equal(audio.output.format.rate, 24000);
    assert.equal(audio.input.transcription?.language_hint, "de");
    const keyterms = (audio.input as { transcription?: { keyterms?: string[] } }).transcription
      ?.keyterms;
    assert.ok(Array.isArray(keyterms));
    assert.ok(keyterms?.includes("AuraGo"));

    const tools = session.tools as Array<{ type: string; name: string }>;
    assert.ok(Array.isArray(tools));
    assert.ok(tools.some((t) => t.type === "function" && t.name === "send_message_to_aurago"));
  });

  it("buildGrokSessionUpdate ohne Agent-Mode hat keine Tools", () => {
    const update = buildGrokSessionUpdate({
      ...DEFAULT_SPEECH_SETTINGS,
      provider: "grok_voice",
      agentMode: false,
    });
    const session = update.session as Record<string, unknown>;
    assert.equal(session.tools, undefined);
  });

  it("baut Audio- und Tool-Outbound-Messages", () => {
    assert.deepEqual(buildGrokAudioAppendMessage("AAA="), {
      type: "input_audio_buffer.append",
      audio: "AAA=",
    });
    assert.deepEqual(buildGrokResponseCreateMessage(), { type: "response.create" });
    const out = buildGrokFunctionCallOutputMessage("call-1", { success: true });
    assert.equal(out.type, "conversation.item.create");
    const item = out.item as { type: string; call_id: string; output: string };
    assert.equal(item.type, "function_call_output");
    assert.equal(item.call_id, "call-1");
    assert.equal(item.output, JSON.stringify({ success: true }));
  });

  it("buildGrokForceMessage liest AuraGo-Text wörtlich vor", () => {
    const msg = buildGrokForceMessage("Hallo von AuraGo");
    assert.equal(msg.type, "conversation.item.create");
    const item = msg.item as {
      type: string;
      role: string;
      interruptible: boolean;
      content: Array<{ type: string; text: string }>;
    };
    assert.equal(item.type, "force_message");
    assert.equal(item.role, "assistant");
    assert.equal(item.interruptible, true);
    assert.equal(item.content[0]?.type, "output_text");
    assert.equal(item.content[0]?.text, "Hallo von AuraGo");
    assert.equal(truncateForGrokForceMessage("  kurz  "), "kurz");
    assert.ok(truncateForGrokForceMessage("x".repeat(5000)).endsWith("…"));
  });

  it("parst Events für Transkript, Audio und Tools", () => {
    const partial = parseGrokEvent(
      JSON.stringify({
        type: "conversation.item.input_audio_transcription.updated",
        transcript: "Hallo",
      }),
    )!;
    assert.deepEqual(extractGrokInputTranscript(partial), { text: "Hallo", final: false });

    const final = parseGrokEvent(
      JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "Hallo Welt",
      }),
    )!;
    assert.deepEqual(extractGrokInputTranscript(final), { text: "Hallo Welt", final: true });

    const audio = parseGrokEvent(
      JSON.stringify({ type: "response.output_audio.delta", delta: "YmFzZTY0" }),
    )!;
    assert.equal(extractGrokOutputAudioDelta(audio), "YmFzZTY0");

    const outText = parseGrokEvent(
      JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "Hi" }),
    )!;
    assert.equal(extractGrokOutputTranscriptDelta(outText), "Hi");

    const tool = parseGrokEvent(
      JSON.stringify({
        type: "response.function_call_arguments.done",
        name: "send_message_to_aurago",
        call_id: "c1",
        arguments: JSON.stringify({ message: "test" }),
      }),
    )!;
    assert.deepEqual(extractGrokFunctionCall(tool), {
      id: "c1",
      name: "send_message_to_aurago",
      args: { message: "test" },
    });

    const err = parseGrokEvent(JSON.stringify({ type: "error", error: { message: "boom" } }))!;
    assert.equal(extractGrokErrorMessage(err), "boom");
  });
});
