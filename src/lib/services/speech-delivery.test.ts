import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildChatMessage } from "./chat-outbound.ts";
import { deliverSpeechTranscript } from "./speech-delivery.ts";
import type { WsMessage } from "../types/protocol.ts";

describe("speech-delivery", () => {
  it("sendet Transkript bei autoSend und aktiver Session", async () => {
    const sent: WsMessage[] = [];
    let pending = false;
    let composer = "";

    const result = await deliverSpeechTranscript("Hallo AuraGo", {
      autoSendToAuraGo: true,
      canSendChat: true,
      sessionId: "sess-1",
      sendMessage: async (message) => {
        sent.push(message);
      },
      onComposerDraft: (text) => {
        composer = text;
      },
      onSystemNotice: () => {},
      onPending: () => {
        pending = true;
      },
    });

    assert.equal(result.mode, "sent");
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.type, "chat.message");
    assert.equal((sent[0]?.payload as { source?: string }).source, "speech");
    assert.equal(pending, true);
    assert.equal(composer, "");
  });

  it("legt Transkript in Composer bei manuellem Modus", async () => {
    let composer = "";

    const result = await deliverSpeechTranscript("Bitte prüfen", {
      autoSendToAuraGo: false,
      canSendChat: true,
      sessionId: "sess-1",
      sendMessage: async () => {},
      onComposerDraft: (text) => {
        composer = text;
      },
      onSystemNotice: () => {},
      onPending: () => {},
    });

    assert.equal(result.mode, "composer");
    assert.equal(composer, "Bitte prüfen");
  });

  it("markiert chat.message mit source speech", () => {
    const message = buildChatMessage("sess-2", "Test", { source: "speech" });
    assert.equal(message.payload.source, "speech");
    assert.equal(message.payload.role, "user");
  });
});
