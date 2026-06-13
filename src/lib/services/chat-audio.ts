type ChatAudioImpl = typeof import("./chat-audio-impl");

let impl: ChatAudioImpl | null = null;
let loading: Promise<ChatAudioImpl> | null = null;

function loadImpl(): Promise<ChatAudioImpl> {
  if (impl) {
    return Promise.resolve(impl);
  }
  if (!loading) {
    loading = import("./chat-audio-impl").then((module) => {
      impl = module;
      return module;
    });
  }
  return loading;
}

export function enqueueChatAudio(
  serverUrl: string,
  conversationId: string,
  requestId: string,
  path: string,
  mimeType?: string,
): void {
  void loadImpl().then((module) =>
    module.enqueueChatAudio(serverUrl, conversationId, requestId, path, mimeType),
  );
}

export function stopChatAudioPlayback(): void {
  if (impl) {
    impl.stopChatAudioPlayback();
    return;
  }
  void loadImpl().then((module) => module.stopChatAudioPlayback());
}

export function stopAllChatAssistantTts(requestId?: string): void {
  if (impl) {
    impl.stopAllChatAssistantTts(requestId);
    return;
  }
  void loadImpl().then((module) => module.stopAllChatAssistantTts(requestId));
}
