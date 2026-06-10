import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../types/protocol.ts";
import {
  resolveChatSpeakerMode,
  resolveVoiceOutputProtocolMode,
  buildChatVoiceOutputStatusMessage,
} from "./chat-voice-output-status.ts";
import {
  shouldSendVoiceOutputFlag,
  shouldSendVoiceOutputForSettings,
  shouldUseFrontendTtsForResponse,
} from "./chat-tts-policy.ts";

const caps = ["chat.voice_output", "chat.audio_events"];

test("resolveChatSpeakerMode respektiert chatTtsMode off", () => {
  assert.equal(
    resolveChatSpeakerMode({ ...DEFAULT_SETTINGS, chatSpeakerMode: true, chatTtsMode: "off" }),
    false,
  );
  assert.equal(
    resolveChatSpeakerMode({ ...DEFAULT_SETTINGS, chatSpeakerMode: false, chatTtsMode: "auto" }),
    false,
  );
});

test("buildChatVoiceOutputStatusMessage setzt speaker_mode und mode", () => {
  const message = buildChatVoiceOutputStatusMessage(
    "agodesk:dev-1",
    "sess-abc",
    false,
    "user_disabled",
  );
  assert.equal(message.type, "chat.voice_output.status");
  assert.equal(message.payload.session_id, "agodesk:dev-1");
  assert.equal(message.payload.conversation_id, "sess-abc");
  assert.equal(message.payload.speaker_mode, false);
  assert.equal(message.payload.mode, "off");
  assert.equal(message.payload.reason, "user_disabled");
  assert.equal(resolveVoiceOutputProtocolMode(true), "on");
});

test("shouldSendVoiceOutputFlag sendet nicht bei stummgeschaltetem Speaker", () => {
  assert.equal(shouldSendVoiceOutputFlag("auto", caps, true), true);
  assert.equal(shouldSendVoiceOutputFlag("auto", caps, false), false);
  assert.equal(
    shouldSendVoiceOutputForSettings(
      { ...DEFAULT_SETTINGS, chatTtsMode: "auto", chatSpeakerMode: false },
      caps,
    ),
    false,
  );
});

test("shouldUseFrontendTtsForResponse bleibt bei stumm aus", () => {
  assert.equal(
    shouldUseFrontendTtsForResponse("auto", caps, false, false),
    false,
  );
  assert.equal(
    shouldUseFrontendTtsForResponse("frontend", caps, false, true),
    true,
  );
});
