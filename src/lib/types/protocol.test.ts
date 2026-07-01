import test from "node:test";
import assert from "node:assert/strict";
import {
  agodeskClientCapabilities,
  AGODESK_BASE_CAPABILITIES,
  AGODESK_CLIENT_CAPABILITIES,
  canExecuteDesktopCommands,
  canSendChat,
  DEFAULT_SETTINGS,
  isFileOperation,
  normalizeDesktopCommandPayload,
  normalizeFileCommandParams,
  resolveFileCommandPath,
  normalizePersonaAssetsPayload,
  normalizeSessionAcceptedPayload,
  normalizeSessionClearPayload,
  normalizeChatPlanUpdatePayload,
  normalizeChatResponsePayload,
  normalizeAgentMoodMetadata,
  normalizeAgoDeskPlan,
  hasAdvertisedAgentMetadata,
  hasAdvertisedFileRead,
  hasAdvertisedFileWrite,
  hasAdvertisedPlanUpdates,
  buildShellAccessSessionPayload,
  isShellOperation,
  normalizeShellExecParams,
  hasAdvertisedChatSessions,
  hasAdvertisedChatCancel,
  auragoServerTtsAvailable,
  AGODESK_AGENT_METADATA_CAPABILITY,
  AGODESK_PLAN_UPDATES_CAPABILITY,
  AGODESK_CHAT_SESSIONS_CAPABILITY,
  AGODESK_CHAT_VOICE_OUTPUT_STATUS_CAPABILITY,
  AGODESK_CHAT_MEDIA_EVENTS_CAPABILITY,
  AGODESK_CHAT_MEDIA_UPLOAD_CAPABILITY,
  AGODESK_CHAT_ATTACHMENTS_CAPABILITY,
  AGODESK_INTEGRATIONS_WEBHOSTS_CAPABILITY,
  AGODESK_SYSTEM_WARNINGS_CAPABILITY,
  normalizeChatVoiceOutputStatusPayload,
  normalizeChatMediaPayload,
  normalizeChatAttachmentAcceptedPayload,
  normalizeIntegrationsWebhostsPayload,
  normalizeSystemWarningsPayload,
  hasAdvertisedChatMediaEvents,
  hasAdvertisedChatMediaUpload,
  canUseChatAttachments,
  isChatAttachmentNegotiationError,
  resolveChatAttachmentErrorDisplay,
  hasAdvertisedIntegrationsWebhosts,
  normalizeChatAttachmentItem,
  normalizeChatAttachmentPreparedPayload,
  normalizeLoadedConversationMessage,
  hasAdvertisedSystemWarnings,
  AGODESK_CHAT_CANCEL_CAPABILITY,
  normalizeChatSessionsPayload,
  normalizeChatSessionPayload,
  normalizeChatCancelledPayload,
  normalizeChatAudioPayload,
  filterVisibleChatSessions,
  extractConversationIdFromPayload,
  requiresLocalDesktopApproval,
  requiresRemoteControlBanner,
  resolvePersonaAssetUrl,
  normalizeConfigProvider,
  normalizeConfigProvidersPayload,
  normalizeConfigProviderCatalogPayload,
  normalizeConfigProviderTestResultPayload,
  normalizeConfigProviderOauthStartedPayload,
  normalizeConfigProviderOauthStatusPayload,
  hasAdvertisedConfigProvidersRead,
  hasAdvertisedConfigProvidersWrite,
  hasAdvertisedConfigProvidersOauth,
  AGODESK_CONFIG_PROVIDERS_READ_CAPABILITY,
  AGODESK_CONFIG_PROVIDERS_WRITE_CAPABILITY,
  AGODESK_CONFIG_PROVIDERS_OAUTH_CAPABILITY,
} from "./protocol.ts";

test("normalizeSessionAcceptedPayload akzeptiert snake_case", () => {
  assert.deepEqual(
    normalizeSessionAcceptedPayload({
      session_id: "sess-1",
      device_id: "dev-1",
      shared_key: "abc123",
    }),
    {
      session_id: "sess-1",
      device_id: "dev-1",
      shared_key: "abc123",
    },
  );
});

test("normalizeSessionAcceptedPayload akzeptiert camelCase von AuraGo", () => {
  assert.deepEqual(
    normalizeSessionAcceptedPayload({
      sessionId: "sess-2",
      deviceId: "dev-2",
      sharedKey: "def456",
    }),
    {
      session_id: "sess-2",
      device_id: "dev-2",
      shared_key: "def456",
    },
  );
});

test("normalizeSessionAcceptedPayload lehnt ungueltige Payloads ab", () => {
  assert.equal(normalizeSessionAcceptedPayload(null), null);
  assert.equal(normalizeSessionAcceptedPayload({ session_id: "x" }), null);
});

test("canSendChat erlaubt accepted nur mit session_id", () => {
  assert.equal(canSendChat("accepted", "connected", ""), false);
  assert.equal(canSendChat("accepted", "connected", "sess-acc-1"), true);
  assert.equal(canSendChat("loopback", "connected", ""), true);
  assert.equal(canSendChat("pairing", "connected", "sess-1"), false);
});

test("normalizeDesktopCommandPayload akzeptiert snake_case", () => {
  assert.deepEqual(
    normalizeDesktopCommandPayload({
      command_id: "cmd-1",
      operation: "desktop_screenshot",
      params: { display_id: "display-0", format: "png" },
    }),
    {
      command_id: "cmd-1",
      operation: "desktop_screenshot",
      params: { display_id: "display-0", window_id: undefined, format: "png", quality: undefined },
    },
  );
});

test("normalizeDesktopCommandPayload akzeptiert camelCase", () => {
  assert.deepEqual(
    normalizeDesktopCommandPayload({
      commandId: "cmd-2",
      operation: "desktop_input",
      params: { kind: "mouse_move", x: 10, y: 20, absolute: true },
    }),
    {
      command_id: "cmd-2",
      operation: "desktop_input",
      params: {
        kind: "mouse_move",
        x: 10,
        y: 20,
        button: undefined,
        action: undefined,
        key: undefined,
        code: undefined,
        text: undefined,
        absolute: true,
      },
    },
  );
});

test("normalizeFileCommandParams akzeptiert search_type Alias", () => {
  assert.deepEqual(
    normalizeFileCommandParams({
      rootId: "ws",
      path: ".",
      search_type: "grep_recursive",
      pattern: "Johannes",
    }),
    {
      root_id: "ws",
      path: ".",
      recursive: false,
      encoding: undefined,
      content: undefined,
      expected_hash: undefined,
      create_only: false,
      operation: "grep_recursive",
      pattern: "Johannes",
      glob: undefined,
      output_mode: undefined,
    },
  );
});

test("normalizeFileCommandParams akzeptiert file_path Alias", () => {
  assert.deepEqual(normalizeFileCommandParams({ filePath: "src/main.ts", rootId: "ws" }), {
    root_id: "ws",
    path: "src/main.ts",
    recursive: false,
    encoding: undefined,
    content: undefined,
    expected_hash: undefined,
    create_only: false,
    operation: undefined,
    pattern: undefined,
    glob: undefined,
    output_mode: undefined,
  });
});

test("resolveFileCommandPath defaultet auf Root", () => {
  assert.equal(resolveFileCommandPath({ path: "" }), ".");
  assert.equal(resolveFileCommandPath({ path: "  " }), ".");
  assert.equal(resolveFileCommandPath({ path: "docs" }), "docs");
  assert.equal(resolveFileCommandPath({ path: "" }, { required: true }), null);
});

test("normalizeDesktopCommandPayload normalisiert file_list", () => {
  assert.deepEqual(
    normalizeDesktopCommandPayload({
      command_id: "cmd-file",
      operation: "file_list",
      params: { rootId: "workspace", path: "src", recursive: true },
    }),
    {
      command_id: "cmd-file",
      operation: "file_list",
      params: {
        root_id: "workspace",
        path: "src",
        recursive: true,
        encoding: undefined,
        content: undefined,
        expected_hash: undefined,
        create_only: false,
        operation: undefined,
        pattern: undefined,
        glob: undefined,
        output_mode: undefined,
      },
    },
  );
});

test("canExecuteDesktopCommands erlaubt accepted und loopback", () => {
  assert.equal(canExecuteDesktopCommands("accepted"), true);
  assert.equal(canExecuteDesktopCommands("loopback"), true);
  assert.equal(canExecuteDesktopCommands("pairing"), false);
  assert.equal(canExecuteDesktopCommands("awaiting_pairing"), false);
});

test("agodeskClientCapabilities respektiert Desktop-Einstellung", () => {
  assert.deepEqual(agodeskClientCapabilities(true), [...AGODESK_CLIENT_CAPABILITIES]);
  assert.deepEqual(agodeskClientCapabilities(false), [...AGODESK_BASE_CAPABILITIES]);
  assert.deepEqual(agodeskClientCapabilities(), [...AGODESK_CLIENT_CAPABILITIES]);
});

test("agodeskClientCapabilities advertised Browser nur bei browserControlEnabled", () => {
  const withBrowser = agodeskClientCapabilities(true, DEFAULT_SETTINGS.fileAccess, true);
  assert.ok(withBrowser.includes("remote.desktop.browser"));
  const withoutBrowser = agodeskClientCapabilities(true, DEFAULT_SETTINGS.fileAccess, false);
  assert.ok(!withoutBrowser.includes("remote.desktop.browser"));
  assert.ok(withoutBrowser.includes("remote.desktop.discovery"));
  assert.ok(withoutBrowser.includes("remote.desktop.ui_automation"));
});

test("agodeskClientCapabilities advertised Datei-Capabilities nur bei Freigabe", () => {
  const fileAccess = {
    enabled: true,
    maxReadBytes: 1024,
    maxWriteBytes: 1024,
    roots: [
      {
        rootId: "workspace",
        label: "Workspace",
        canonicalPath: "C:/tmp/workspace",
        pathDisplay: "C:/tmp/workspace",
        readEnabled: true,
        writeEnabled: true,
      },
    ],
  };
  const caps = agodeskClientCapabilities(true, fileAccess);
  assert.ok(caps.includes("remote.files.read"));
  assert.ok(caps.includes("remote.files.write"));
  assert.deepEqual(agodeskClientCapabilities(true, { ...fileAccess, enabled: false }), [
    ...AGODESK_CLIENT_CAPABILITIES,
  ]);
});

test("isFileOperation erkennt file_list/file_read/file_write/file_search", () => {
  assert.equal(isFileOperation("file_list"), true);
  assert.equal(isFileOperation("file_read"), true);
  assert.equal(isFileOperation("file_write"), true);
  assert.equal(isFileOperation("file_search"), true);
  assert.equal(isFileOperation("desktop_screenshot"), false);
});

test("normalizeDesktopCommandPayload normalisiert file_search", () => {
  assert.deepEqual(
    normalizeDesktopCommandPayload({
      command_id: "cmd-search",
      operation: "file_search",
      params: {
        rootId: "workspace",
        path: "src",
        operation: "grep_recursive",
        pattern: "TODO",
        glob: "*.ts",
        outputMode: "content",
      },
    }),
    {
      command_id: "cmd-search",
      operation: "file_search",
      params: {
        root_id: "workspace",
        path: "src",
        recursive: false,
        encoding: undefined,
        content: undefined,
        expected_hash: undefined,
        create_only: false,
        operation: "grep_recursive",
        pattern: "TODO",
        glob: "*.ts",
        output_mode: "content",
      },
    },
  );
});

test("requiresLocalDesktopApproval gilt fuer Input- und UI-/Browser-Aktionen", () => {
  assert.equal(requiresLocalDesktopApproval("desktop_input"), true);
  assert.equal(requiresLocalDesktopApproval("desktop_ui_action"), true);
  assert.equal(requiresLocalDesktopApproval("desktop_browser_action"), true);
  assert.equal(requiresLocalDesktopApproval("desktop_screenshot"), false);
  assert.equal(requiresLocalDesktopApproval("desktop_stream_start"), false);
  assert.equal(requiresLocalDesktopApproval("desktop_stream_stop"), false);
  assert.equal(requiresLocalDesktopApproval("desktop_ui_tree"), false);
  assert.equal(requiresLocalDesktopApproval("desktop_permission_request"), false);
});

test("normalizeDesktopCommandPayload normalisiert desktop_stream_start", () => {
  assert.deepEqual(
    normalizeDesktopCommandPayload({
      command_id: "cmd-stream-1",
      operation: "desktop_stream_start",
      params: {
        displayId: "display-0",
        format: "jpeg",
        quality: 55,
        fps: 3,
      },
    }),
    {
      command_id: "cmd-stream-1",
      operation: "desktop_stream_start",
      params: {
        display_id: "display-0",
        window_id: undefined,
        format: "jpeg",
        quality: 55,
        fps: 3,
      },
    },
  );
});

test("agodeskClientCapabilities enthaelt remote.desktop.stream", () => {
  assert.ok(agodeskClientCapabilities(true).includes("remote.desktop.stream"));
});

test("requiresRemoteControlBanner ohne Screenshot und UI-Tree", () => {
  assert.equal(requiresRemoteControlBanner("desktop_screenshot"), false);
  assert.equal(requiresRemoteControlBanner("desktop_ui_tree"), false);
  assert.equal(requiresRemoteControlBanner("desktop_input"), true);
  assert.equal(requiresRemoteControlBanner("desktop_ui_action"), true);
  assert.equal(requiresRemoteControlBanner("desktop_browser_action"), true);
  assert.equal(requiresRemoteControlBanner("desktop_permission_request"), true);
});

test("DEFAULT_SETTINGS enthaelt uiSounds, locale und browserControlEnabled", () => {
  assert.equal(DEFAULT_SETTINGS.locale, "system");
  assert.equal(DEFAULT_SETTINGS.uiSounds.enabled, true);
  assert.equal(DEFAULT_SETTINGS.uiSounds.theme, "soft");
  assert.equal(DEFAULT_SETTINGS.uiSounds.volume, 0.2);
  assert.equal(DEFAULT_SETTINGS.fileAccess.enabled, false);
  assert.equal(DEFAULT_SETTINGS.browserControlEnabled, true);
  assert.equal(DEFAULT_SETTINGS.desktopControlEnabled, true);
});

test("normalizePersonaAssetsPayload akzeptiert snake_case", () => {
  assert.deepEqual(
    normalizePersonaAssetsPayload({
      session_id: "sess-1",
      persona: "Aura",
      icon_key: "spark",
      avatar_image_url: "/assets/avatar.png",
      icon_url: "/assets/icon.png",
      asset_version: "v1",
      persona_prompt: "Du bist hilfsbereit.",
    }),
    {
      session_id: "sess-1",
      persona: "Aura",
      icon_key: "spark",
      avatar_image_url: "/assets/avatar.png",
      icon_url: "/assets/icon.png",
      asset_version: "v1",
      persona_prompt: "Du bist hilfsbereit.",
    },
  );
});

test("normalizeDesktopCommandPayload mappt browser connect port und auto_launch", () => {
  assert.deepEqual(
    normalizeDesktopCommandPayload({
      command_id: "cmd-1",
      operation: "desktop_browser_connect",
      params: {
        port: 9333,
        auto_launch: false,
        url: "https://example.com",
      },
    }),
    {
      command_id: "cmd-1",
      operation: "desktop_browser_connect",
      params: {
        endpoint: undefined,
        port: 9333,
        auto_launch: false,
        url: "https://example.com",
      },
    },
  );
});

test("normalizeDesktopCommandPayload mappt browser snapshot v2 und list_tabs", () => {
  assert.deepEqual(
    normalizeDesktopCommandPayload({
      command_id: "cmd-2",
      operation: "desktop_browser_snapshot",
      params: {
        include_screenshot: true,
        screenshot_format: "png",
        quality: 80,
        full_page: true,
        tab_id: "target-1",
      },
    }),
    {
      command_id: "cmd-2",
      operation: "desktop_browser_snapshot",
      params: {
        selector: undefined,
        include_html: false,
        include_screenshot: true,
        screenshot_format: "png",
        quality: 80,
        full_page: true,
        tab_id: "target-1",
      },
    },
  );
  assert.deepEqual(
    normalizeDesktopCommandPayload({
      command_id: "cmd-3",
      operation: "desktop_browser_list_tabs",
      params: {},
    }),
    {
      command_id: "cmd-3",
      operation: "desktop_browser_list_tabs",
      params: {},
    },
  );
});

test("browser tab actions brauchen keine lokale Freigabe", () => {
  assert.equal(
    requiresLocalDesktopApproval("desktop_browser_action", { action: "select_tab" }),
    false,
  );
  assert.equal(requiresRemoteControlBanner("desktop_browser_action", { action: "new_tab" }), false);
  assert.equal(
    requiresLocalDesktopApproval("desktop_browser_action", {
      action: "new_tab",
      value: "about:blank",
    }),
    false,
  );
  assert.equal(
    requiresLocalDesktopApproval("desktop_browser_action", {
      action: "new_tab",
      value: "https://example.com",
    }),
    true,
  );
  assert.equal(
    requiresRemoteControlBanner("desktop_browser_action", {
      action: "new_tab",
      value: "https://example.com",
    }),
    true,
  );
  assert.equal(
    requiresLocalDesktopApproval("desktop_browser_action", { action: "wait_for_selector" }),
    false,
  );
  assert.equal(
    requiresRemoteControlBanner("desktop_browser_action", { action: "wait_for_navigation" }),
    false,
  );
  assert.equal(requiresLocalDesktopApproval("desktop_browser_action", { action: "click" }), true);
});

test("normalizeSessionClearPayload akzeptiert snake_case und camelCase", () => {
  assert.deepEqual(
    normalizeSessionClearPayload({
      session_id: "sess-new",
      reason: "Neuer Agent-Kontext",
      clear_chat: true,
    }),
    {
      session_id: "sess-new",
      reason: "Neuer Agent-Kontext",
      clear_chat: true,
    },
  );
  assert.deepEqual(
    normalizeSessionClearPayload({
      sessionId: "sess-2",
      clearChat: false,
    }),
    {
      session_id: "sess-2",
      clear_chat: false,
    },
  );
  assert.deepEqual(normalizeSessionClearPayload({}), {});
  assert.equal(normalizeSessionClearPayload(null), null);
});

test("resolvePersonaAssetUrl loest relative Pfade auf", () => {
  assert.equal(
    resolvePersonaAssetUrl("wss://192.168.1.10:8443/api/agodesk/ws", "/static/persona.png"),
    "https://192.168.1.10:8443/static/persona.png",
  );
  assert.equal(
    resolvePersonaAssetUrl("ws://127.0.0.1:8080/api/agodesk/ws", "/static/persona.png"),
    "http://127.0.0.1:8080/static/persona.png",
  );
});

test("resolvePersonaAssetUrl laesst data-URLs unveraendert", () => {
  const dataUrl = "data:image/svg+xml;base64,PHN2Zy8+";
  assert.equal(resolvePersonaAssetUrl("ws://127.0.0.1:8080/api/agodesk/ws", dataUrl), dataUrl);
});

test("agodeskClientCapabilities enthaelt Mood- und Plan-Capabilities", () => {
  const caps = agodeskClientCapabilities(false);
  assert.ok(caps.includes(AGODESK_AGENT_METADATA_CAPABILITY));
  assert.ok(caps.includes(AGODESK_PLAN_UPDATES_CAPABILITY));
  assert.ok(AGODESK_BASE_CAPABILITIES.includes(AGODESK_AGENT_METADATA_CAPABILITY));
});

test("hasAdvertisedFileRead/Write prueft verhandelte Datei-Caps", () => {
  const caps = ["remote.files.read", "remote.files.write"];
  assert.equal(hasAdvertisedFileRead(caps), true);
  assert.equal(hasAdvertisedFileWrite(caps), true);
  assert.equal(hasAdvertisedFileRead(["remote.files.write"]), false);
});

test("hasAdvertisedCapability prueft verhandelte Server-Caps", () => {
  const caps = ["chat.full_response", AGODESK_PLAN_UPDATES_CAPABILITY];
  assert.equal(hasAdvertisedPlanUpdates(caps), true);
  assert.equal(hasAdvertisedAgentMetadata(caps), false);
});

test("normalizeAgentMoodMetadata laesst unbekannte Felder durch", () => {
  assert.deepEqual(
    normalizeAgentMoodMetadata({
      mood: "playful",
      future_field: "ok",
    }),
    {
      mood: "playful",
      future_field: "ok",
    },
  );
});

test("normalizeChatPlanUpdatePayload akzeptiert plan null", () => {
  assert.deepEqual(
    normalizeChatPlanUpdatePayload({
      session_id: "sess-1",
      request_id: "req-1",
      plan: null,
    }),
    {
      session_id: "sess-1",
      request_id: "req-1",
      plan: null,
    },
  );
});

test("normalizeChatResponsePayload parst metadata.agent_mood und metadata.plan", () => {
  const payload = normalizeChatResponsePayload({
    session_id: "sess-1",
    request_id: "req-1",
    text: "Fertig",
    metadata: {
      agent_mood: { mood: "focused" },
      plan: { id: "p1", title: "Plan", status: "completed" },
      source: "aurago",
    },
  });
  assert.equal(payload?.text, "Fertig");
  assert.equal(payload?.metadata?.agent_mood?.mood, "focused");
  assert.equal(normalizeAgoDeskPlan(payload?.metadata?.plan)?.title, "Plan");
  assert.equal(payload?.metadata?.source, "aurago");
});

test("agodeskClientCapabilities enthaelt Chat-Session- und TTS-Capabilities", () => {
  const caps = agodeskClientCapabilities(false);
  assert.ok(caps.includes(AGODESK_CHAT_SESSIONS_CAPABILITY));
  assert.ok(caps.includes(AGODESK_CHAT_CANCEL_CAPABILITY));
  assert.ok(caps.includes("chat.audio_events"));
  assert.ok(caps.includes("chat.voice_output"));
  assert.ok(caps.includes(AGODESK_CHAT_VOICE_OUTPUT_STATUS_CAPABILITY));
});

test("normalizeChatSessionsPayload parst Session-Liste", () => {
  const payload = normalizeChatSessionsPayload({
    session_id: "agodesk:dev-1",
    sessions: [
      {
        id: "sess-abc",
        preview: "Hello",
        created_at: "2026-06-07T10:00:00Z",
        last_active_at: "2026-06-07T11:00:00Z",
        message_count: 2,
      },
    ],
  });
  assert.equal(payload?.session_id, "agodesk:dev-1");
  assert.equal(payload?.sessions.length, 1);
  assert.equal(payload?.sessions[0]?.id, "sess-abc");
});

test("normalizeChatSessionPayload parst Nachrichten beim Laden", () => {
  const payload = normalizeChatSessionPayload({
    session_id: "agodesk:dev-1",
    conversation_id: "sess-abc",
    session: {
      id: "sess-abc",
      preview: "Hello",
      created_at: "2026-06-07T10:00:00Z",
      last_active_at: "2026-06-07T11:00:00Z",
      message_count: 1,
    },
    messages: [{ role: "user", content: "Hi", timestamp: "2026-06-07T10:00:00Z" }],
  });
  assert.equal(payload?.conversation_id, "sess-abc");
  assert.equal(payload?.messages?.[0]?.content, "Hi");
});

test("normalizeChatSessionPayload synthetisiert session ohne session-Objekt", () => {
  const payload = normalizeChatSessionPayload({
    session_id: "agodesk:dev-1",
    conversation_id: "sess-new",
  });
  assert.equal(payload?.conversation_id, "sess-new");
  assert.equal(payload?.session.id, "sess-new");
});

test("normalizeChatSessionPayload akzeptiert UUID als session_id", () => {
  const payload = normalizeChatSessionPayload({
    session_id: "adb36fd734e6c6aec96c54f446c78215",
    ok: true,
  });
  assert.equal(payload?.conversation_id, "adb36fd734e6c6aec96c54f446c78215");
});

test("normalizeChatSessionPayload unwrappt data-Envelope", () => {
  const payload = normalizeChatSessionPayload({
    ok: true,
    status: "ok",
    data: {
      conversation_id: "adb36fd734e6c6aec96c54f446c78215",
    },
  });
  assert.equal(payload?.conversation_id, "adb36fd734e6c6aec96c54f446c78215");
});

test("normalizeChatSessionPayload akzeptiert sess-* als session_id", () => {
  const payload = normalizeChatSessionPayload({
    session_id: "sess-abc",
    messages: [],
  });
  assert.equal(payload?.conversation_id, "sess-abc");
  assert.equal(payload?.session.id, "sess-abc");
});

test("extractConversationIdFromPayload findet verschiedene Feldnamen", () => {
  assert.equal(extractConversationIdFromPayload({ session_id: "sess-xyz" }), "sess-xyz");
  assert.equal(extractConversationIdFromPayload({ session: { id: "sess-nested" } }), "sess-nested");
});

test("normalizeChatSessionsPayload toleriert fehlende transport session_id", () => {
  const payload = normalizeChatSessionsPayload({
    sessions: [
      {
        id: "sess-1",
        preview: "Hi",
        created_at: "2026-06-07T10:00:00Z",
        last_active_at: "2026-06-07T11:00:00Z",
        message_count: 1,
      },
    ],
  });
  assert.equal(payload?.sessions.length, 1);
  assert.equal(payload?.session_id, "");
});

test("filterVisibleChatSessions entfernt leere Chats", () => {
  assert.deepEqual(
    filterVisibleChatSessions([
      {
        id: "sess-empty",
        preview: "",
        created_at: "2026-06-07T10:00:00Z",
        last_active_at: "2026-06-07T10:00:00Z",
        message_count: 0,
      },
      {
        id: "sess-1",
        preview: "Hi",
        created_at: "2026-06-07T09:00:00Z",
        last_active_at: "2026-06-07T11:00:00Z",
        message_count: 2,
      },
    ]).map((session) => session.id),
    ["sess-1"],
  );
});

test("normalizeChatCancelledPayload und normalizeChatAudioPayload", () => {
  assert.deepEqual(
    normalizeChatCancelledPayload({
      session_id: "agodesk:dev-1",
      conversation_id: "sess-abc",
      request_id: "req-1",
      status: "cancelled",
    }),
    {
      session_id: "agodesk:dev-1",
      conversation_id: "sess-abc",
      request_id: "req-1",
      status: "cancelled",
    },
  );

  assert.equal(
    normalizeChatAudioPayload({
      session_id: "agodesk:dev-1",
      conversation_id: "sess-abc",
      request_id: "req-1",
      path: "/api/agodesk/tts/a.mp3",
      mime_type: "audio/mpeg",
    })?.path,
    "/api/agodesk/tts/a.mp3",
  );
});

test("normalizeChatVoiceOutputStatusPayload parst speaker_mode und ack", () => {
  const payload = normalizeChatVoiceOutputStatusPayload({
    session_id: "agodesk:dev-1",
    conversation_id: "sess-abc",
    speaker_mode: false,
    mode: "off",
    reason: "user_disabled",
    status: "ok",
  });
  assert.equal(payload?.speaker_mode, false);
  assert.equal(payload?.mode, "off");
  assert.equal(payload?.status, "ok");
});

test("auragoServerTtsAvailable prueft verhandelte Voice-Caps", () => {
  assert.equal(auragoServerTtsAvailable(["chat.voice_output", "chat.audio_events"]), true);
  assert.equal(auragoServerTtsAvailable(["chat.voice_output"]), false);
  assert.equal(hasAdvertisedChatSessions(["chat.sessions"]), true);
  assert.equal(hasAdvertisedChatCancel(["chat.cancel"]), true);
});

test("agodeskClientCapabilities enthaelt Media-, Integrations- und Warning-Caps", () => {
  const caps = agodeskClientCapabilities(false);
  assert.ok(caps.includes(AGODESK_CHAT_MEDIA_EVENTS_CAPABILITY));
  assert.ok(caps.includes(AGODESK_CHAT_MEDIA_UPLOAD_CAPABILITY));
  assert.ok(caps.includes(AGODESK_CHAT_ATTACHMENTS_CAPABILITY));
  assert.ok(caps.includes(AGODESK_INTEGRATIONS_WEBHOSTS_CAPABILITY));
  assert.ok(caps.includes(AGODESK_SYSTEM_WARNINGS_CAPABILITY));
});

test("normalizeChatMediaPayload parst flaches und verschachteltes Item", () => {
  const nested = normalizeChatMediaPayload({
    session_id: "agodesk:dev-1",
    conversation_id: "sess-abc",
    request_id: "req-1",
    item: {
      id: "media-1",
      kind: "image",
      path: "/api/agodesk/media/chart.png",
      title: "Chart",
    },
  });
  assert.equal(nested?.item.kind, "image");
  assert.equal(nested?.item.path, "/api/agodesk/media/chart.png");

  const flat = normalizeChatMediaPayload({
    session_id: "agodesk:dev-1",
    conversation_id: "sess-abc",
    kind: "link",
    url: "https://example.com",
    title: "Example",
  });
  assert.equal(flat?.item.kind, "link");
  assert.equal(flat?.item.url, "https://example.com");
});

test("normalizeChatMediaPayload mappt agent_path auf path", () => {
  const payload = normalizeChatMediaPayload({
    session_id: "agodesk:dev-1",
    conversation_id: "sess-abc",
    request_id: "req-1",
    item: {
      id: "media-jpg",
      kind: "image",
      filename: "maja.jpg",
      agent_path:
        "/api/agodesk/media/attachments/agodesk/sess-abc/converted-hash?agodesk_exp=1&agodesk_sig=x",
      title: "maja.jpg – konvertiert aus maja.png",
    },
  });
  assert.equal(
    payload?.item.path,
    "/api/agodesk/media/attachments/agodesk/sess-abc/converted-hash?agodesk_exp=1&agodesk_sig=x",
  );
  assert.equal(
    payload?.item.agent_path,
    "/api/agodesk/media/attachments/agodesk/sess-abc/converted-hash?agodesk_exp=1&agodesk_sig=x",
  );
});

test("normalizeChatAttachmentAcceptedPayload parst metadata.storage_filename", () => {
  const payload = normalizeChatAttachmentAcceptedPayload({
    session_id: "agodesk:dev-1",
    conversation_id: "sess-abc",
    request_id: "msg-1",
    attachments: [
      {
        attachment_id: "att-1",
        status: "accepted",
        path: "/api/agodesk/media/attachments/agodesk/sess-abc/hash",
        metadata: {
          storage_filename: "20260604_maja.png",
        },
      },
    ],
  });
  assert.equal(payload?.attachments[0]?.metadata?.storage_filename, "20260604_maja.png");
});

test("normalizeIntegrationsWebhostsPayload parst Webhost-Liste", () => {
  const payload = normalizeIntegrationsWebhostsPayload({
    session_id: "agodesk:dev-1",
    webhosts: [
      {
        id: "grafana",
        name: "Grafana",
        status: "running",
        url: "http://127.0.0.1:3000",
      },
    ],
  });
  assert.equal(payload?.webhosts.length, 1);
  assert.equal(payload?.webhosts[0]?.name, "Grafana");
});

test("normalizeSystemWarningsPayload parst Warnungen und Zaehler", () => {
  const payload = normalizeSystemWarningsPayload({
    session_id: "agodesk:dev-1",
    warnings: [
      {
        id: "w1",
        severity: "warning",
        title: "Disk space",
        acknowledged: false,
      },
    ],
    total: 1,
    unacknowledged: 1,
  });
  assert.equal(payload?.warnings[0]?.title, "Disk space");
  assert.equal(payload?.unacknowledged, 1);
  assert.equal(hasAdvertisedChatMediaEvents(["chat.media_events"]), true);
  assert.equal(hasAdvertisedIntegrationsWebhosts(["integrations.webhosts"]), true);
  assert.equal(hasAdvertisedSystemWarnings(["system.warnings"]), true);
});

test("normalizeChatAttachmentItem parst Attachment-Referenzen", () => {
  const item = normalizeChatAttachmentItem({
    attachment_id: "att-1",
    filename: "shot.png",
    mime_type: "image/png",
    path: "/api/agodesk/media/att-1/shot.png?agodesk_exp=1&agodesk_sig=abc",
    kind: "image",
  });
  assert.equal(item?.attachment_id, "att-1");
  assert.equal(item?.kind, "image");
});

test("normalizeChatAttachmentPreparedPayload parst Upload-Metadaten", () => {
  const payload = normalizeChatAttachmentPreparedPayload({
    session_id: "sess-a",
    conversation_id: "sess-b",
    prepare_id: "prep-1",
    attachment_id: "att-1",
    upload_url: "https://aurago.local/api/agodesk/media/upload/att-1?agodesk_exp=1&agodesk_sig=abc",
    upload_method: "POST",
    upload_field: "file",
    expires_at: "2026-06-04T12:05:00.000Z",
    max_bytes: 8388608,
  });
  assert.equal(payload?.attachment_id, "att-1");
  assert.equal(payload?.upload_field, "file");
});

test("hasAdvertisedChatMediaUpload erkennt Upload-Capability", () => {
  assert.equal(hasAdvertisedChatMediaUpload(["chat.media_upload"]), true);
  assert.equal(hasAdvertisedChatMediaUpload(["chat.media_events"]), false);
});

test("canUseChatAttachments braucht Upload- und Attachments-Cap", () => {
  assert.equal(canUseChatAttachments(["chat.media_upload", "chat.attachments"]), true);
  assert.equal(canUseChatAttachments(["chat.media_upload"]), false);
  assert.equal(canUseChatAttachments(["chat.attachments"]), false);
});

test("isChatAttachmentNegotiationError erkennt Attachments-Fehler", () => {
  assert.equal(
    isChatAttachmentNegotiationError({
      code: "ATTACHMENT_REJECTED",
      message: "rejected",
    }),
    true,
  );
  assert.equal(
    isChatAttachmentNegotiationError({
      code: "INVALID",
      message: "chat.message attachments requires chat.attachments",
    }),
    true,
  );
});

test("resolveChatAttachmentErrorDisplay unterscheidet fehlende Caps und Serverfehler", () => {
  const missing = resolveChatAttachmentErrorDisplay(
    {
      code: "INVALID",
      message: "chat.message attachments requires chat.attachments",
    },
    ["chat.media_upload"],
  );
  assert.equal(missing.messageKey, "chatView.error.attachmentsNotSupported");

  const serverReject = resolveChatAttachmentErrorDisplay(
    {
      code: "INVALID",
      message: "chat.message attachments requires chat.attachments",
    },
    ["chat.media_upload", "chat.attachments"],
  );
  assert.equal(serverReject.messageKey, undefined);
  assert.equal(serverReject.text, "chat.message attachments requires chat.attachments");
});

test("normalizeLoadedConversationMessage erlaubt reine Attachment-Nachrichten", () => {
  const message = normalizeLoadedConversationMessage({
    role: "user",
    content: "",
    attachments: [
      {
        attachment_id: "att-1",
        filename: "notes.txt",
        mime_type: "text/plain",
      },
    ],
  });
  assert.equal(message?.attachments?.length, 1);
  assert.equal(message?.content, "");
});

test("agodeskClientCapabilities advertises remote.shell.exec only when shell enabled", () => {
  const disabled = agodeskClientCapabilities(true, DEFAULT_SETTINGS.fileAccess, false, {
    ...DEFAULT_SETTINGS.shellAccess,
    enabled: false,
  });
  assert.equal(disabled.includes("remote.shell.exec"), false);

  const enabled = agodeskClientCapabilities(true, DEFAULT_SETTINGS.fileAccess, false, {
    ...DEFAULT_SETTINGS.shellAccess,
    enabled: true,
    allowedCwds: [
      {
        cwdId: "workspace",
        label: "Workspace",
        canonicalPath: "C:/Projects/demo",
        pathDisplay: "~/Projects/demo",
      },
    ],
  });
  assert.equal(enabled.includes("remote.shell.exec"), true);
});

test("buildShellAccessSessionPayload omits canonical paths", () => {
  const payload = buildShellAccessSessionPayload({
    ...DEFAULT_SETTINGS.shellAccess,
    enabled: true,
    allowedCwds: [
      {
        cwdId: "workspace",
        label: "Workspace",
        canonicalPath: "C:/secret/path",
        pathDisplay: "~/Projects/demo",
      },
    ],
  });
  assert.equal(payload?.enabled, true);
  assert.equal(payload?.allowed_cwds[0]?.path_display, "~/Projects/demo");
  assert.equal((payload?.allowed_cwds[0] as { canonicalPath?: string }).canonicalPath, undefined);
});

test("isShellOperation erkennt shell_exec", () => {
  assert.equal(isShellOperation("shell_exec"), true);
  assert.equal(isShellOperation("file_list"), false);
});

test("normalizeShellExecParams normalisiert snake_case und camelCase", () => {
  const params = normalizeShellExecParams({
    command: "git status",
    cwd_id: "workspace",
    timeout_ms: 15000,
  });
  assert.equal(params.command, "git status");
  assert.equal(params.cwd_id, "workspace");
  assert.equal(params.timeout_ms, 15000);
});

test("normalizeConfigProvider accepts safe provider shape", () => {
  const provider = normalizeConfigProvider({
    id: "openrouter",
    name: "OpenRouter",
    type: "openrouter",
    auth_type: "api_key",
    secrets: { api_key: { present: true } },
    oauth: { authorized: false, missing_fields: ["api_key"] },
    references: [{ path: "llm.primary", role: "primary_llm" }],
  });
  assert.ok(provider);
  assert.equal(provider?.secrets?.api_key?.present, true);
  assert.deepEqual(provider?.oauth?.missing_fields, ["api_key"]);
  assert.equal(provider?.references?.[0]?.role, "primary_llm");
});

test("normalizeConfigProvidersPayload reads snake_case list", () => {
  const payload = normalizeConfigProvidersPayload({
    session_id: "sess-1",
    providers: [{ id: "p1", name: "P1", type: "custom" }],
  });
  assert.equal(payload?.providers.length, 1);
});

test("normalizeConfigProviderCatalogPayload reads catalog entries", () => {
  const payload = normalizeConfigProviderCatalogPayload({
    session_id: "sess-1",
    enabled: true,
    providers: [
      {
        id: "google",
        name: "Google",
        oauth_setup: { auth_url: "https://example.com/auth", scopes: ["email"] },
      },
    ],
  });
  assert.equal(payload?.providers[0]?.oauth_setup?.auth_url, "https://example.com/auth");
});

test("normalizeConfigProviderTestResultPayload requires ok boolean", () => {
  assert.ok(
    normalizeConfigProviderTestResultPayload({
      session_id: "sess-1",
      provider_id: "p1",
      ok: true,
      message: "ok",
    }),
  );
});

test("normalizeConfigProviderOauthStartedPayload reads auth_url", () => {
  const payload = normalizeConfigProviderOauthStartedPayload({
    session_id: "sess-1",
    provider_id: "google",
    auth_url: "https://example.com/oauth",
    fallback_modes: ["manual_paste"],
  });
  assert.equal(payload?.fallback_modes?.[0], "manual_paste");
});

test("normalizeConfigProviderOauthStatusPayload reads authorization flags", () => {
  const payload = normalizeConfigProviderOauthStatusPayload({
    session_id: "sess-1",
    provider_id: "google",
    authorized: true,
    has_refresh_token: true,
  });
  assert.equal(payload?.authorized, true);
});

test("hasAdvertisedConfigProviders helpers match capability strings", () => {
  const caps = [
    AGODESK_CONFIG_PROVIDERS_READ_CAPABILITY,
    AGODESK_CONFIG_PROVIDERS_WRITE_CAPABILITY,
    AGODESK_CONFIG_PROVIDERS_OAUTH_CAPABILITY,
  ];
  assert.equal(hasAdvertisedConfigProvidersRead(caps), true);
  assert.equal(hasAdvertisedConfigProvidersWrite(caps), true);
  assert.equal(hasAdvertisedConfigProvidersOauth(caps), true);
});

test("agodeskClientCapabilities advertises config.providers.* caps", () => {
  const caps = agodeskClientCapabilities();
  assert.equal(caps.includes(AGODESK_CONFIG_PROVIDERS_READ_CAPABILITY), true);
  assert.equal(caps.includes(AGODESK_CONFIG_PROVIDERS_WRITE_CAPABILITY), true);
  assert.equal(caps.includes(AGODESK_CONFIG_PROVIDERS_OAUTH_CAPABILITY), true);
});
