import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { personaState } from "../stores/persona.ts";
import { DEFAULT_SPEECH_SETTINGS } from "../types/protocol.ts";
import {
  buildAgentSystemInstruction,
  buildTranscriptionSystemInstruction,
} from "./speech-tools.ts";

describe("speech-tools persona forwarding", () => {
  it("buildAgentSystemInstruction nutzt persona_prompt und verankert AuraGo-Namen", () => {
    personaState.setAssets({
      persona: "Nova",
      iconKey: "nova",
      avatarUrl: "",
      avatarFallbackUrl: "",
      iconUrl: "",
      iconFallbackUrl: "",
      personaPrompt: "Du bist Nova, freundlich und präzise.",
      assetVersion: "v1",
    });

    const text = buildAgentSystemInstruction(DEFAULT_SPEECH_SETTINGS, {
      connectionStatus: "connected",
      sessionStatus: "accepted",
      remoteControlActive: false,
      remoteControlPending: false,
      canSendChat: true,
    });

    assert.match(text, /Du bist Nova, freundlich und präzise/);
    assert.match(text, /AuraGo/);
    assert.match(text, /Auramon/);
    assert.match(text, /send_message_to_aurago/);
    assert.match(text, /Behaupte nie.*nicht/i);
    personaState.reset();
  });

  it("buildTranscriptionSystemInstruction nutzt persona_prompt bei Sprachantworten", () => {
    personaState.setAssets({
      persona: "Aura",
      iconKey: "aura",
      avatarUrl: "",
      avatarFallbackUrl: "",
      iconUrl: "",
      iconFallbackUrl: "",
      personaPrompt: "Sprich als Aura mit kurzen, klaren Sätzen.",
      assetVersion: "v1",
    });

    const text = buildTranscriptionSystemInstruction(
      { ...DEFAULT_SPEECH_SETTINGS, voiceResponses: true },
      true,
    );

    assert.match(text, /Sprich als Aura mit kurzen, klaren Sätzen/);
    personaState.reset();
  });

  it("reine Transkription bleibt ohne Persona-Prompt", () => {
    personaState.setAssets({
      persona: "Aura",
      iconKey: "aura",
      avatarUrl: "",
      avatarFallbackUrl: "",
      iconUrl: "",
      iconFallbackUrl: "",
      personaPrompt: "Du bist Aura.",
      assetVersion: "v1",
    });

    const text = buildTranscriptionSystemInstruction(DEFAULT_SPEECH_SETTINGS, false);
    assert.doesNotMatch(text, /Du bist Aura/);
    personaState.reset();
  });
});
