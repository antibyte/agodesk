import test from "node:test";
import assert from "node:assert/strict";
import { chatMediaStableKey, chatMediaState, mergeChatMediaItem } from "./chat-media-state.ts";
import type { ChatMediaItem } from "../types/protocol.ts";

function audioItem(overrides: Partial<ChatMediaItem> = {}): ChatMediaItem {
  return {
    id: "media-1",
    conversation_id: "conv-1",
    request_id: "req-1",
    kind: "audio",
    path: "/api/agodesk/media/audio/music_abc.mp3?agodesk_exp=1&agodesk_sig=aaa",
    ...overrides,
  };
}

test("chatMediaStableKey ignoriert Signatur und id", () => {
  assert.equal(
    chatMediaStableKey(
      audioItem({
        id: "a",
        path: "/api/agodesk/media/audio/music_abc.mp3?agodesk_exp=1&agodesk_sig=aaa",
      }),
    ),
    chatMediaStableKey(
      audioItem({
        id: "b",
        path: "/api/agodesk/media/audio/music_abc.mp3`?agodesk_exp=2&agodesk_sig=bbb",
      }),
    ),
  );
});

test("mergeChatMediaItem behält die erste id und aktualisiert den Pfad", () => {
  const merged = mergeChatMediaItem(
    audioItem({ id: "keep", title: "Song" }),
    audioItem({
      id: "new",
      path: "/api/agodesk/media/audio/music_abc.mp3?agodesk_exp=2&agodesk_sig=bbb",
    }),
  );
  assert.equal(merged.id, "keep");
  assert.equal(merged.title, "Song");
  assert.equal(merged.path, "/api/agodesk/media/audio/music_abc.mp3?agodesk_exp=2&agodesk_sig=bbb");
});

test("appendMediaItem zeigt dieselbe Datei nur einmal und aktualisiert die Signatur", () => {
  chatMediaState.reset();
  chatMediaState.appendMediaItem("conv-1", audioItem({ id: "first" }));
  chatMediaState.appendMediaItem(
    "conv-1",
    audioItem({
      id: "second",
      path: "/api/agodesk/media/audio/music_abc.mp3?agodesk_exp=2&agodesk_sig=bbb",
    }),
  );
  chatMediaState.appendMediaItem(
    "conv-1",
    audioItem({
      id: "third",
      path: "/api/agodesk/media/audio/music_abc.mp3&?agodesk_exp=3&agodesk_sig=ccc",
    }),
  );

  let items: ChatMediaItem[] = [];
  const unsubscribe = chatMediaState.subscribe((state) => {
    items = state.mediaByConversation.get("conv-1") ?? [];
  });
  unsubscribe();

  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, "first");
  assert.equal(
    items[0]?.path,
    "/api/agodesk/media/audio/music_abc.mp3?agodesk_exp=3&agodesk_sig=ccc",
  );
  chatMediaState.reset();
});
