import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGeminiAudioMessage,
  buildGeminiSetupMessage,
  extractModelAudioChunks,
  extractToolCalls,
  extractTranscriptFromMessage,
  InputTranscriptAccumulator,
  isSetupCompleteMessage,
  mergeTranscriptChunks,
  normalizeGeminiLiveMessage,
  parseGeminiLiveMessage,
} from "./gemini-live.ts";
import {
  buildGeminiLiveWsUrl,
  DEFAULT_GEMINI_LIVE_MODEL,
  isNativeAudioLiveModel,
  normalizeModelId,
  resolveLiveApiVersions,
  resolveResponseModalities,
  toGeminiModelPath,
} from "../types/speech.ts";
import { DEFAULT_SPEECH_SETTINGS } from "../types/protocol.ts";

describe("speech types", () => {
  it("normalizes model ids", () => {
    assert.equal(normalizeModelId("models/gemini-live"), "gemini-live");
    assert.equal(
      normalizeModelId("gemini-2.5-flash-native-audio"),
      "gemini-2.5-flash-native-audio-preview-12-2025",
    );
    assert.equal(normalizeModelId(""), DEFAULT_GEMINI_LIVE_MODEL);
    assert.equal(toGeminiModelPath("gemini-live"), "models/gemini-live");
    assert.equal(
      isNativeAudioLiveModel("gemini-2.5-flash-native-audio-preview-12-2025"),
      true,
    );
    assert.deepEqual(
      resolveResponseModalities("gemini-2.5-flash-native-audio-preview-12-2025"),
      ["AUDIO"],
    );
    assert.deepEqual(resolveLiveApiVersions("gemini-2.5-flash-native-audio-preview-12-2025"), [
      "v1alpha",
      "v1beta",
    ]);
    assert.deepEqual(resolveResponseModalities("gemini-2.0-flash"), ["TEXT"]);
  });

  it("builds gemini live websocket url", () => {
    const url = buildGeminiLiveWsUrl("test-key");
    assert.match(url, /^wss:\/\/generativelanguage\.googleapis\.com\//);
    assert.match(url, /v1beta/);
    assert.match(url, /key=test-key$/);

    const alphaUrl = buildGeminiLiveWsUrl("test-key", "v1alpha");
    assert.match(alphaUrl, /v1alpha/);
  });
});

describe("gemini-live parsing", () => {
  it("parses input transcription as partial", () => {
    const message = parseGeminiLiveMessage(
      JSON.stringify({
        serverContent: {
          inputTranscription: { text: "Hallo Welt" },
        },
      }),
    );
    assert.ok(message);
    assert.deepEqual(extractTranscriptFromMessage(message), {
      partial: "Hallo Welt",
      final: "",
    });
  });

  it("parses completed turn as final transcript", () => {
    const message = parseGeminiLiveMessage(
      JSON.stringify({
        serverContent: {
          turnComplete: true,
          modelTurn: {
            parts: [{ text: "Auf Wiedersehen" }],
          },
        },
      }),
    );
    assert.ok(message);
    assert.deepEqual(extractTranscriptFromMessage(message), {
      partial: "",
      final: "Auf Wiedersehen",
    });
  });

  it("builds audio message with audio blob field", () => {
    const message = buildGeminiAudioMessage("abc123") as {
      realtimeInput: { audio: { mimeType: string; data: string } };
    };
    assert.ok(message.realtimeInput.audio);
    assert.equal(message.realtimeInput.audio.mimeType, "audio/pcm;rate=16000");
    assert.equal(message.realtimeInput.audio.data, "abc123");
  });

  it("accumulates input transcription and finalizes on turnComplete", () => {
    const accumulator = new InputTranscriptAccumulator();
    assert.equal(accumulator.push("Hal"), "Hal");
    assert.equal(accumulator.push("lo"), "Hallo");
    assert.equal(accumulator.finalize(), "Hallo");
    assert.equal(accumulator.current, "");
  });

  it("handles cumulative transcription updates", () => {
    const accumulator = new InputTranscriptAccumulator();
    assert.equal(accumulator.push("Hallo"), "Hallo");
    assert.equal(accumulator.push("Hallo Welt"), "Hallo Welt");
    assert.equal(accumulator.finalize(), "Hallo Welt");
  });

  it("fuegt Leerzeichen bei inkrementellen Woertern ein", () => {
    const accumulator = new InputTranscriptAccumulator();
    assert.equal(accumulator.push("Erstelle"), "Erstelle");
    assert.equal(accumulator.push("einen"), "Erstelle einen");
    assert.equal(accumulator.push("Screenshot"), "Erstelle einen Screenshot");
    assert.equal(accumulator.push("und"), "Erstelle einen Screenshot und");
    assert.equal(accumulator.push(" werte ihn aus."), "Erstelle einen Screenshot und werte ihn aus.");
    assert.equal(
      accumulator.finalize(),
      "Erstelle einen Screenshot und werte ihn aus.",
    );
  });

  it("mergeTranscriptChunks erkennt Suffix-Prefix-Ueberlappung", () => {
    assert.equal(
      mergeTranscriptChunks("Erstelle einen", "einen Screenshot"),
      "Erstelle einen Screenshot",
    );
  });

  it("normalizes snake_case server messages", () => {
    const message = normalizeGeminiLiveMessage({
      server_content: {
        turn_complete: true,
        input_transcription: { text: "Servus" },
      },
    });
    assert.equal(message.serverContent?.inputTranscription?.text, "Servus");
    assert.equal(message.serverContent?.turnComplete, true);
  });

  it("finalizes on turnComplete even when interrupted is set", () => {
    const accumulator = new InputTranscriptAccumulator();
    accumulator.push("Hallo Welt");

    const message = normalizeGeminiLiveMessage({
      serverContent: {
        interrupted: true,
        turnComplete: true,
      },
    });

    assert.equal(message.serverContent?.turnComplete, true);
    assert.equal(message.serverContent?.interrupted, true);
    assert.equal(accumulator.finalize(), "Hallo Welt");
  });

  it("extracts model audio chunks from inlineData", () => {
    const message = parseGeminiLiveMessage(
      JSON.stringify({
        serverContent: {
          modelTurn: {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/pcm;rate=24000",
                  data: "abc123",
                },
              },
            ],
          },
        },
      }),
    );
    assert.ok(message);
    assert.deepEqual(extractModelAudioChunks(message!), [
      { data: "abc123", mimeType: "audio/pcm;rate=24000" },
    ]);
  });

  it("builds setup message with speech settings", () => {
    const setup = buildGeminiSetupMessage({
      ...DEFAULT_SPEECH_SETTINGS,
      language: "de-DE",
      modelId: "gemini-2.5-flash-native-audio",
      agentMode: false,
    }) as {
      setup: {
        model: string;
        generationConfig: { responseModalities: string[] };
        inputAudioTranscription: unknown;
        outputAudioTranscription?: unknown;
      };
    };

    assert.equal(
      setup.setup.model,
      "models/gemini-2.5-flash-native-audio-preview-12-2025",
    );
    assert.deepEqual(setup.setup.generationConfig.responseModalities, [
      "AUDIO",
    ]);
    assert.ok(setup.setup.inputAudioTranscription);
    assert.deepEqual(setup.setup.inputAudioTranscription, {});
    assert.ok(setup.setup.outputAudioTranscription);
    assert.ok(
      (setup.setup.generationConfig as { speechConfig?: unknown }).speechConfig,
    );
  });

  it("builds agent setup with tools", () => {
    const setup = buildGeminiSetupMessage(
      {
        ...DEFAULT_SPEECH_SETTINGS,
        agentMode: true,
      },
      {
        connectionStatus: "connected",
        sessionStatus: "accepted",
        remoteControlActive: false,
        remoteControlPending: false,
        canSendChat: true,
      },
    ) as { setup: { tools?: unknown[] } };

    assert.ok(Array.isArray(setup.setup.tools));
    assert.ok((setup.setup.tools?.length ?? 0) > 0);
  });

  it("parses setupComplete messages", () => {
    const message = parseGeminiLiveMessage('{"setupComplete":{}}');
    assert.ok(message);
    assert.equal(isSetupCompleteMessage(message!), true);
  });

  it("parses tool calls from server message", () => {
    const message = parseGeminiLiveMessage(
      JSON.stringify({
        toolCall: {
          functionCalls: [
            {
              id: "call-1",
              name: "send_message_to_aurago",
              args: { message: "Hilfe" },
            },
          ],
        },
      }),
    );
    assert.ok(message);
    const calls = extractToolCalls(message);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.name, "send_message_to_aurago");
  });
});
