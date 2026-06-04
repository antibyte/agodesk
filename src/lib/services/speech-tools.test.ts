import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { personaState } from "../stores/persona.ts";
import { DEFAULT_SPEECH_SETTINGS } from "../types/protocol.ts";
import {
  buildAgentSystemInstruction,
  buildTranscriptionSystemInstruction,
} from "./speech-tools.ts";

describe("speech-tools persona forwarding", () => {
  it("buildAgentSystemInstruction nutzt persona_prompt von AuraGo", () => {
    personaState.setAssets({
      persona: "Aura",
      iconKey: "aura",
      avatarUrl: "",
      iconUrl: "",
      personaPrompt: "Du bist Aura, freundlich und präzise.",
      assetVersion: "v1",
    });

    const text = buildAgentSystemInstruction(DEFAULT_SPEECH_SETTINGS, {
      connectionStatus: "connected",
      sessionStatus: "accepted",
      remoteControlActive: false,
      remoteControlPending: false,
      canSendChat: true,
    });

    assert.match(text, /Du bist Aura, freundlich und präzise/);
    personaState.reset();
  });

  it("buildTranscriptionSystemInstruction nutzt persona_prompt bei Sprachantworten", () => {
    personaState.setAssets({
      persona: "Aura",
      iconKey: "aura",
      avatarUrl: "",
      iconUrl: "",
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
      iconUrl: "",
      personaPrompt: "Du bist Aura.",
      assetVersion: "v1",
    });

    const text = buildTranscriptionSystemInstruction(DEFAULT_SPEECH_SETTINGS, false);
    assert.doesNotMatch(text, /Du bist Aura/);
    personaState.reset();
  });
});
