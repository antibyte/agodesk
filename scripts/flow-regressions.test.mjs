import assert from "node:assert/strict";
import test from "node:test";
import { loadModule, stores, noop, i18n, protocol } from "./test-module-loader.mjs";

const { get, writable } = stores;
const turn = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const command = (id) => ({
  command_id: id,
  operation: "shell_exec",
  params: { command: "echo " + id },
});

function shellFixture(validate) {
  const executed = [];
  const config = structuredClone(protocol.DEFAULT_SETTINGS);
  config.shellAccess.enabled = true;
  config.shellAccess.requiresApproval = true;
  config.shellAccess.allowedCwds = [
    { id: "root", label: "root", canonicalPath: "/test", pathDisplay: "/test" },
  ];
  const settings = writable(config);
  const execute = async (send, cmd, options) => {
    executed.push({ id: cmd.command_id, options });
    send?.({ id: cmd.command_id });
  };
  const shell = loadModule("src/lib/services/shell-flow.ts", {
    "svelte/store": stores,
    "../types/protocol": protocol,
    "../stores/settings": { settings },
    "../stores/session": {
      sessionState: writable({
        sessionId: "session",
        advertisedCapabilities: ["remote.shell.exec", "remote.shell.session"],
      }),
    },
    "../stores/chat-conversation": {
      chatConversationState: writable({ activeConversationId: "conversation" }),
    },
    "./desktop": { executeShellCommand: execute, executeShellSessionCommand: execute },
    "./shell-access": {
      auditShellAccess: noop,
      validateShellExecRequest:
        validate ??
        (async (_settings, params) => ({
          ok: true,
          command: params.command,
          cwd: { label: "root", pathDisplay: "/test" },
          timeoutMs: 1000,
        })),
    },
    "./agent-activity-inbound": { emitLocalActivity: noop },
    "./activity-journal": { appendActivityJournal: noop },
    "../stores/local-jobs": { createLocalJob: () => ({}), localJobState: { upsert: noop } },
    "../i18n/store": i18n,
  });
  return { shell, executed, settings };
}

test("shell approval executes only the displayed command and advances the queue", async () => {
  const { shell, executed } = shellFixture();
  await shell.handleIncomingShellCommand(command("A"), noop);
  await shell.handleIncomingShellCommand(command("B"), noop);
  assert.equal(get(shell.shellApprovalState).request.commandId, "A");
  await shell.approvePendingShellCommand("B");
  assert.equal(executed.length, 0);
  await shell.approvePendingShellCommand("A");
  assert.deepEqual(
    executed.map((item) => item.id),
    ["A"],
  );
  assert.equal(get(shell.shellApprovalState).request.commandId, "B");
  await shell.approvePendingShellCommand("B");
  assert.equal(get(shell.shellApprovalState).pending, false);
});

test("aborted shell requests are removed and reset invalidates pending validation", async () => {
  const { shell, executed } = shellFixture();
  const abort = new AbortController();
  await shell.handleIncomingShellCommand(command("A"), noop, {}, { signal: abort.signal });
  abort.abort();
  await shell.approvePendingShellCommand("A");
  assert.equal(executed.length, 0);
  let release;
  const delayed = shellFixture(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const waiting = delayed.shell.handleIncomingShellCommand(command("late"), noop);
  delayed.shell.resetShellCommandState();
  release({
    ok: true,
    command: "echo late",
    cwd: { label: "root", pathDisplay: "/test" },
    timeoutMs: 1000,
  });
  await waiting;
  assert.equal(get(delayed.shell.shellApprovalState).pending, false);
});

test("duplicate command IDs cannot overwrite a pending shell approval", async () => {
  const { shell, executed } = shellFixture();
  const original = command("same-id");
  const duplicate = { ...original, params: { command: "echo different" } };
  await Promise.all([
    shell.handleIncomingShellCommand(original, noop),
    shell.handleIncomingShellCommand(duplicate, noop),
  ]);
  assert.equal(get(shell.shellApprovalState).request.command, original.params.command);
  await shell.approvePendingShellCommand(original.command_id);
  assert.equal(executed.length, 1);
  assert.equal(get(shell.shellApprovalState).pending, false);
});

test("a failed revalidation does not hide the next approval", async () => {
  let count = 0;
  const { shell, executed } = shellFixture(async (_settings, params) =>
    ++count === 3
      ? { ok: false, code: "SHELL_ACCESS_DENIED", message: "denied" }
      : {
          ok: true,
          command: params.command,
          cwd: { label: "root", pathDisplay: "/test" },
          timeoutMs: 1000,
        },
  );
  await shell.handleIncomingShellCommand(command("A"), noop);
  await shell.handleIncomingShellCommand(command("B"), noop);
  await shell.approvePendingShellCommand("A");
  assert.equal(executed[0].options.forcedError.code, "SHELL_ACCESS_DENIED");
  assert.equal(get(shell.shellApprovalState).request.commandId, "B");
});

function desktopFixture() {
  const remote = [];
  const session = {
    status: "accepted",
    sessionId: "session",
    deviceId: "device",
    remoteControlActive: false,
  };
  const desktop = loadModule("src/lib/services/desktop-flow.ts", {
    "svelte/store": stores,
    "../types/protocol": protocol,
    "../i18n/store": i18n,
    "../stores/settings": {
      settings: writable({
        ...protocol.DEFAULT_SETTINGS,
        desktopControlEnabled: true,
        browserControlEnabled: true,
      }),
    },
    "../stores/session": {
      sessionState: {
        ...writable(session),
        setRemoteControlActive: noop,
        setRemoteControlPending: noop,
      },
    },
    "./desktop": {
      executeDesktopCommand: async (send, cmd, options) =>
        send({
          type: "desktop.result",
          payload: {
            command_id: cmd.command_id,
            success: !options.forcedError,
            error_code: options.forcedError?.code,
          },
        }),
    },
    "./desktop-stream": { resetDesktopStreamState: noop },
    "./session-flow": { handleDesktopCommand: noop },
    "./shell-flow": { handleIncomingShellCommand: noop, resetShellCommandState: noop },
  });
  let expire;
  const local = loadModule(
    "src/lib/services/local-agent/dispatch.ts",
    {
      "svelte/store": stores,
      "../../stores/session": { sessionState: writable(session) },
      "../desktop-flow": desktop,
      "../../i18n/store": i18n,
    },
    {
      setTimeout: (fn) => {
        expire = fn;
        return 1;
      },
      clearTimeout: noop,
    },
  );
  return { desktop, local, remote, expire: () => expire() };
}

test("approved local desktop results return to their local caller", async () => {
  const { desktop, local, remote } = desktopFixture();
  const pending = local.dispatchLocalDesktopOperation(protocol.DESKTOP_INPUT_OPERATIONS[0], {});
  await turn();
  assert.equal(desktop.getPendingInputCommandCount(), 1);
  await desktop.flushPendingInputCommands((value) => remote.push(value), true);
  assert.equal((await pending).success, true);
  assert.deepEqual(remote, []);
});

for (const reason of ["timeout", "cancel"]) {
  test("local desktop " + reason + " prevents late execution", async () => {
    const fixture = desktopFixture();
    const abort = new AbortController();
    const pending = fixture.local.dispatchLocalDesktopOperation(
      protocol.DESKTOP_INPUT_OPERATIONS[0],
      {},
      undefined,
      abort.signal,
    );
    await turn();
    if (reason === "timeout") fixture.expire();
    else abort.abort();
    assert.equal((await pending).success, false);
    assert.equal(fixture.desktop.getPendingInputCommandCount(), 0);
    await fixture.desktop.flushPendingInputCommands((value) => fixture.remote.push(value), true);
    assert.deepEqual(fixture.remote, []);
  });
}

function speechFixture({ credential, captureStart, connect, vad } = {}) {
  let capture;
  const events = [];
  const states = [];
  class Capture {
    constructor() {
      capture = this;
      this.running = false;
    }
    async start() {
      await captureStart?.();
      this.running = true;
    }
    stop() {
      this.running = false;
    }
    addVadProcessor() {}
  }
  const session = {
    connect: async () => {
      events.push("connect");
      await connect?.();
    },
    disconnect: () => events.push("disconnect"),
    getPlaybackAnalyser: () => null,
  };
  const speech = loadModule("src/lib/services/speech-flow.ts", {
    "../types/protocol": protocol,
    "./gemini-credentials": { loadGeminiApiKey: credential ?? (async () => "test") },
    "./xai-credentials": { hasXaiApiKey: async () => true },
    "./mistral-credentials": { hasMistralApiKey: async () => true },
    "./speech-audio": { isMicrophoneSupported: () => true, SpeechAudioCapture: Capture },
    "./speech-tool-router": { executeSpeechToolCalls: noop },
    "../stores/speech": {
      speechState: new Proxy(
        {},
        {
          get:
            (_, name) =>
            (...args) =>
              states.push([name, ...args]),
        },
      ),
    },
    "../stores/agent-mood": { agentMoodState: writable({ mood: null }) },
    "svelte/store": stores,
    "../i18n/store": i18n,
    "./speech-barge-detector": {
      createBargeInDetector: () => {
        events.push("detector");
        return { start: noop, stop: noop };
      },
    },
    "./speech-visualizer-audio": { createSpeechAudioSampler: noop },
    "./speech-vad": { tryCreateSileroVAD: vad ?? (async () => null) },
    "./speech-session-factory": { createActiveSpeechSession: () => session },
    "./local-speech-session": { LocalSpeechSession: class {} },
    "./mistral-voice-session": { MistralVoiceSession: class {} },
    "./local-speech-tts": { registerActiveLocalSpeechSession: noop },
  });
  return { speech, events, states, capture: () => capture };
}

for (const stage of ["credential", "captureStart", "connect", "vad"]) {
  test("speech cancellation during " + stage + " cannot resurrect resources", async () => {
    let release;
    const fixture = speechFixture({
      [stage]: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const pending = fixture.speech.toggleSpeechSession(
      { ...protocol.DEFAULT_SPEECH_SETTINGS, provider: "gemini_live", enabled: true },
      { onFinalTranscript: noop },
    );
    for (let i = 0; i < 40 && !release; i++) await Promise.resolve();
    assert.ok(release, stage);
    await fixture.speech.stopSpeechSession();
    const stateCount = fixture.states.length;
    release(stage === "credential" ? "test" : undefined);
    await pending;
    assert.equal(fixture.speech.isSpeechSessionActive(), false);
    assert.ok(!fixture.capture()?.running);
    assert.equal(fixture.events.includes("detector"), false);
    assert.equal(fixture.states.length, stateCount);
    if (stage === "credential" || stage === "captureStart")
      assert.equal(fixture.events.includes("connect"), false);
  });
}

test("capture stops a microphone stream granted after cancellation", async () => {
  let grant;
  let stopped = 0;
  let contexts = 0;
  const { SpeechAudioCapture } = loadModule(
    "src/lib/services/speech-audio.ts",
    { "./speech-visualizer-audio": { configureSpeechAnalyser: noop } },
    {
      navigator: {
        mediaDevices: {
          getUserMedia: () =>
            new Promise((resolve) => {
              grant = resolve;
            }),
        },
      },
      AudioContext: class {
        constructor() {
          contexts++;
        }
      },
    },
  );
  const capture = new SpeechAudioCapture();
  const pending = capture.start(noop);
  capture.stop();
  grant({ getTracks: () => [{ stop: () => stopped++ }] });
  await pending;
  assert.equal(stopped, 1);
  assert.equal(contexts, 0);
  assert.equal(capture.getAnalyser(), null);
});

function conversationFixture() {
  const { chatConversationState } = loadModule("src/lib/stores/chat-conversation.ts", {
    "svelte/store": stores,
    "../types/protocol": protocol,
  });
  const { chatMessages } = loadModule("src/lib/stores/chat.ts", { "svelte/store": stores });
  const flow = loadModule("src/lib/services/chat-conversation-flow.ts", {
    "svelte/store": stores,
    "../stores/chat": { chatMessages },
    "../stores/chat-conversation": { chatConversationState },
    "../stores/session": { sessionState: writable({ advertisedCapabilities: ["chat.sessions"] }) },
    "../types/protocol": protocol,
    "./chat-conversation-persist": {
      clearLastConversationId: noop,
      loadLastConversationId: noop,
      saveLastConversationId: noop,
    },
    "./chat-audio": { stopAllChatAssistantTts: noop },
  });
  chatConversationState.setActiveConversationId("old");
  return { flow, chatConversationState, chatMessages };
}

test("chat switch waits for the requested conversation and does not create another", async () => {
  const { flow, chatConversationState } = conversationFixture();
  const sent = [];
  const ws = { send: async (message) => sent.push(message) };
  let resolved = false;
  const pending = flow.loadChatConversation(ws, "session", "new").then(() => {
    resolved = true;
  });
  const sendTarget = flow.ensureActiveConversation(ws, "session");
  await turn();
  assert.equal(resolved, false);
  assert.equal(flow.isChatConversationReady(["chat.sessions"]), false);
  assert.equal(get(chatConversationState).activeConversationId, null);
  assert.equal(flow.applyChatSessionPayload({ conversation_id: "old" }), false);
  assert.equal(flow.applyChatSessionPayload({ conversation_id: "new" }), true);
  await pending;
  assert.equal(await sendTarget, "new");
  assert.equal(sent.length, 1);
  flow.resetChatConversationRuntimeState();
});

test("failed conversation send preserves the old history and target", async () => {
  const { flow, chatConversationState, chatMessages } = conversationFixture();
  chatMessages.addMessage({ id: "old-message", text: "keep", role: "user", timestamp: "" });
  await assert.rejects(
    flow.createNewChatConversation(
      {
        send: async () => {
          throw Error("offline");
        },
      },
      "session",
    ),
  );
  assert.equal(get(chatConversationState).activeConversationId, "old");
  assert.equal(get(chatConversationState).switching, false);
  assert.equal(get(chatMessages)[0].text, "keep");
  flow.resetChatConversationRuntimeState();
});

test("history replacement batches notifications and bounds retained messages", () => {
  const { flow, chatMessages } = conversationFixture();
  let notifications = 0;
  const stop = chatMessages.subscribe(() => notifications++);
  flow.applyLoadedConversationMessages(
    Array.from({ length: 2000 }, (_, i) => ({ role: "user", content: String(i) })),
  );
  assert.equal(notifications, 2);
  assert.equal(get(chatMessages).length, 500);
  assert.equal(get(chatMessages)[0].text, "1500");
  stop();
});

test("failed chat switches retain partial text without leaving streaming active", async () => {
  const { flow, chatConversationState, chatMessages } = conversationFixture();
  chatConversationState.beginRequest("streaming-request");
  chatMessages.appendStreamingChunk({
    requestId: "streaming-request",
    delta: "Partial answer",
    done: false,
    timestamp: "test",
  });
  await assert.rejects(
    flow.loadChatConversation(
      {
        send: async () => {
          throw Error("offline");
        },
      },
      "session",
      "new",
    ),
  );
  assert.equal(get(chatMessages)[0].text, "Partial answer");
  assert.equal(get(chatMessages)[0].streaming, false);
  assert.equal(get(chatConversationState).requestInFlight, false);
  assert.equal(get(chatConversationState).activeConversationId, "old");
  flow.resetChatConversationRuntimeState();
});

test("old responses and late acknowledgements cannot switch the active conversation", async () => {
  const { flow, chatConversationState } = conversationFixture();
  chatConversationState.beginRequest("old-request");
  const sent = [];
  const pending = flow.loadChatConversation(
    { send: async (message) => sent.push(message) },
    "session",
    "new",
  );
  await turn();
  assert.equal(flow.isConversationEventCurrent({ request_id: "old-request" }), false);
  flow.applyChatSessionPayload({ conversation_id: "new" });
  await pending;
  assert.equal(sent[0].type, "chat.cancel");
  assert.equal(flow.isConversationEventCurrent({ conversation_id: "old" }), false);
  assert.equal(flow.isConversationEventCurrent({ request_id: "old-request" }), false);
  assert.equal(flow.isConversationEventCurrent({ conversation_id: "new" }), true);
  assert.equal(flow.applyChatSessionPayload({ conversation_id: "old" }), false);
  flow.resetChatConversationRuntimeState();
});

test("session device identifiers cannot escape the credential namespace", () => {
  for (const device_id of [
    "../gemini_api",
    "..\\gemini_api",
    "C:\\secret",
    "",
    "x".repeat(129),
    "NUL",
    "COM1",
  ]) {
    assert.equal(protocol.normalizeSessionAcceptedPayload({ session_id: "test", device_id }), null);
  }
  assert.equal(
    protocol.normalizeSessionAcceptedPayload({ session_id: "test", device_id: "device_abc-123" })
      .device_id,
    "device_abc-123",
  );
});
