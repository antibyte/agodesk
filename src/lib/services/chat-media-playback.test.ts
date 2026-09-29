import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import {
  buildChatMediaAudioDedupKey,
  chatMediaPlaybackState,
  registerActiveChatMediaElement,
  stopChatMediaPlayback,
} from "./chat-media-playback.ts";

test("buildChatMediaAudioDedupKey ignoriert Query und Streuzeichen", () => {
  assert.equal(
    buildChatMediaAudioDedupKey(
      "req-1",
      "/api/agodesk/media/audio/music_abc.mp3?agodesk_exp=1&agodesk_sig=aaa",
    ),
    buildChatMediaAudioDedupKey(
      "req-1",
      "/api/agodesk/media/audio/music_abc.mp3%60?agodesk_exp=2&agodesk_sig=bbb",
    ),
  );
});

test("stopChatMediaPlayback pausiert sichtbare Player ohne src zu loeschen", () => {
  const listeners = new Map<string, Set<() => void>>();
  const element = {
    paused: false,
    ended: false,
    currentTime: 42,
    src: "data:audio/mpeg;base64,AAA",
    addEventListener(type: string, handler: () => void) {
      const set = listeners.get(type) ?? new Set();
      set.add(handler);
      listeners.set(type, set);
    },
    removeEventListener(type: string, handler: () => void) {
      listeners.get(type)?.delete(handler);
    },
    pause() {
      this.paused = true;
      for (const handler of listeners.get("pause") ?? []) {
        handler();
      }
    },
  };

  const unregister = registerActiveChatMediaElement(element as unknown as HTMLMediaElement);
  for (const handler of listeners.get("play") ?? []) {
    handler();
  }
  assert.equal(get(chatMediaPlaybackState).playing, true);

  stopChatMediaPlayback();
  assert.equal(element.paused, true);
  assert.equal(element.currentTime, 0);
  assert.equal(element.src, "data:audio/mpeg;base64,AAA");
  assert.equal(get(chatMediaPlaybackState).playing, false);

  unregister();
});
