import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChatMediaUrlCandidates,
  buildChatMediaUrlCandidatesFromRefs,
  buildMediaUrlCandidates,
  collectChatMediaAssetRefs,
  isSignedAgodeskMediaPath,
  resolveAuraGoMediaUrl,
  resolveAuraGoChatMediaUrl,
} from "./server-asset-fetch.ts";

test("buildMediaUrlCandidates nutzt /api/agodesk/tts fuer reine Dateinamen", () => {
  const candidates = buildMediaUrlCandidates(
    "wss://aurago.example.com/api/agodesk/ws",
    "adb36fd734e6c6aec96c54f446c78215.mp3",
  );
  assert.ok(
    candidates.includes(
      "https://aurago.example.com/api/agodesk/tts/adb36fd734e6c6aec96c54f446c78215.mp3",
    ),
  );
  assert.ok(
    !candidates.includes(
      "https://aurago.example.com/tts/adb36fd734e6c6aec96c54f446c78215.mp3",
    ),
  );
});

test("buildMediaUrlCandidates laesst AuraGo-TTS-Pfade unveraendert", () => {
  const candidates = buildMediaUrlCandidates(
    "wss://aurago.example.com/api/agodesk/ws",
    "/api/agodesk/tts/abc.mp3",
  );
  assert.deepEqual(candidates, ["https://aurago.example.com/api/agodesk/tts/abc.mp3"]);
});

test("resolveAuraGoMediaUrl bevorzugt den AuraGo-TTS-Pfad", () => {
  assert.equal(
    resolveAuraGoMediaUrl(
      "wss://aurago.example.com/api/agodesk/ws",
      "/api/agodesk/tts/abc.mp3",
    ),
    "https://aurago.example.com/api/agodesk/tts/abc.mp3",
  );
});

test("resolveAuraGoMediaUrl laesst absolute https-URLs unveraendert", () => {
  assert.equal(
    resolveAuraGoMediaUrl("wss://aurago.example.com/ws", "https://cdn.example.com/a.mp3"),
    "https://cdn.example.com/a.mp3",
  );
});

test("isSignedAgodeskMediaPath erkennt agodesk_exp und agodesk_sig", () => {
  assert.equal(
    isSignedAgodeskMediaPath(
      "/api/agodesk/media/generated_images/chart.png?agodesk_exp=1780833600&agodesk_sig=abc",
    ),
    true,
  );
  assert.equal(
    isSignedAgodeskMediaPath("/api/agodesk/media/generated_images/chart.png"),
    false,
  );
});

test("buildChatMediaUrlCandidates nutzt signierte Media-URLs unveraendert", () => {
  const signed =
    "/api/agodesk/media/generated_images/img_1780947889201.jpeg?agodesk_exp=1780833600&agodesk_sig=abc";
  const candidates = buildChatMediaUrlCandidates(
    "wss://aurago.example.com/api/agodesk/ws",
    signed,
  );
  assert.deepEqual(candidates, [`https://aurago.example.com${signed}`]);
});

test("buildChatMediaUrlCandidates erzeugt keine unsignierten Media-URLs fuer Dateinamen", () => {
  const candidates = buildChatMediaUrlCandidates(
    "wss://aurago.example.com/api/agodesk/ws",
    "img_1780947889201.jpeg",
  );
  assert.deepEqual(candidates, []);
});

test("buildChatMediaUrlCandidates mappt /files/ nicht mehr auf unsignierte Media-URLs", () => {
  const candidates = buildChatMediaUrlCandidates(
    "wss://aurago.example.com/api/agodesk/ws",
    "/files/generated_images/img_1780947889201.jpeg?token=abc",
  );
  assert.deepEqual(candidates, []);
});

test("buildChatMediaUrlCandidatesFromRefs bevorzugt signiertes path vor url", () => {
  const signedPath =
    "/api/agodesk/media/generated_images/img_1781026240421.jpeg?agodesk_exp=1780833600&agodesk_sig=abc";
  const candidates = buildChatMediaUrlCandidatesFromRefs(
    "wss://aurago.example.com/api/agodesk/ws",
    {
      path: signedPath,
      url: "/files/generated_images/img_1781026240421.jpeg",
    },
  );
  assert.deepEqual(candidates, [`https://aurago.example.com${signedPath}`]);
});

test("collectChatMediaAssetRefs priorisiert path vor url", () => {
  assert.deepEqual(
    collectChatMediaAssetRefs({
      path: "/a.png",
      url: "/b.png",
      preview_url: "/c.png",
      filename: "d.png",
    }),
    ["/a.png", "/c.png", "/b.png", "d.png"],
  );
});

test("resolveAuraGoChatMediaUrl nutzt signierte Media-URLs", () => {
  const signed =
    "/api/agodesk/media/generated_images/img_1780947889201.jpeg?agodesk_exp=1&agodesk_sig=x";
  assert.equal(
    resolveAuraGoChatMediaUrl("wss://aurago.example.com/api/agodesk/ws", signed),
    `https://aurago.example.com${signed}`,
  );
});

test("resolveAuraGoChatMediaUrl laesst AuraGo-Media-Pfade unveraendert", () => {
  assert.equal(
    resolveAuraGoChatMediaUrl(
      "wss://aurago.example.com/api/agodesk/ws",
      "/api/agodesk/media/generated_images/chart.png?agodesk_exp=1&agodesk_sig=x",
    ),
    "https://aurago.example.com/api/agodesk/media/generated_images/chart.png?agodesk_exp=1&agodesk_sig=x",
  );
});
