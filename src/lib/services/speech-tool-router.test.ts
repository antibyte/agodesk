import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executeSpeechTool,
  executeSpeechToolCalls,
  type SpeechToolContext,
} from "./speech-tool-router.ts";

function createContext(
  overrides: Partial<SpeechToolContext> = {},
): SpeechToolContext {
  return {
    sessionId: "sess-1",
    connectionStatus: "connected",
    sessionStatus: "accepted",
    remoteControlActive: false,
    remoteControlPending: false,
    canSendChat: true,
    sendToAuraGo: async () => {},
    onStopListening: () => {},
    onSystemNotice: () => {},
    ...overrides,
  };
}

describe("speech-tool-router", () => {
  it("sendet Nachrichten an AuraGo", async () => {
    let sent = "";
    const context = createContext({
      sendToAuraGo: async (message) => {
        sent = message;
      },
    });

    const result = await executeSpeechTool(
      {
        id: "call-1",
        name: "send_message_to_aurago",
        args: { message: "Mach einen Screenshot" },
      },
      context,
    );

    assert.equal(result.success, true);
    assert.equal(sent, "Mach einen Screenshot");
  });

  it("liefert Client-Status", async () => {
    const result = await executeSpeechTool(
      {
        id: "call-2",
        name: "get_client_status",
        args: {},
      },
      createContext({ remoteControlActive: true }),
    );

    assert.equal(result.success, true);
    assert.equal(result.remoteControlActive, true);
  });

  it("führt mehrere Tool-Calls aus", async () => {
    const responses = await executeSpeechToolCalls(
      [
        {
          id: "call-3",
          name: "get_client_status",
          args: {},
        },
        {
          id: "call-4",
          name: "stop_listening",
          args: {},
        },
      ],
      createContext(),
    );

    assert.equal(responses.length, 2);
    assert.equal(responses[0]?.name, "get_client_status");
    assert.equal(responses[1]?.response.success, true);
  });
});
