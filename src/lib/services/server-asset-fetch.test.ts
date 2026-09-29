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
import { registerSignedAttachmentPaths } from "./chat-attachment-paths.ts";

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
    !candidates.includes("https://aurago.example.com/tts/adb36fd734e6c6aec96c54f446c78215.mp3"),
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
    resolveAuraGoMediaUrl("wss://aurago.example.com/api/agodesk/ws", "/api/agodesk/tts/abc.mp3"),
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
  assert.equal(isSignedAgodeskMediaPath("/api/agodesk/media/generated_images/chart.png"), false);
});

test("buildChatMediaUrlCandidates nutzt signierte Media-URLs unveraendert", () => {
  const signed =
    "/api/agodesk/media/generated_images/img_1780947889201.jpeg?agodesk_exp=1780833600&agodesk_sig=abc";
  const candidates = buildChatMediaUrlCandidates("wss://aurago.example.com/api/agodesk/ws", signed);
  assert.deepEqual(candidates, [`https://aurago.example.com${signed}`]);
});

test("buildChatMediaUrlCandidates repariert Streu-& zwischen Dateiname und Query", () => {
  // Echtfall aus asset-fetch.log: Server liefert `…mp3&?agodesk_exp=…` → HTTP 404.
  const broken =
    "/api/agodesk/media/audio/music_8c0807c0-889e-46b9-bdfd-16f4aff01930.mp3&?agodesk_exp=1789237789&agodesk_sig=e4a4";
  const candidates = buildChatMediaUrlCandidates("wss://aurago.example.com/api/agodesk/ws", broken);
  assert.deepEqual(candidates, [
    "https://aurago.example.com/api/agodesk/media/audio/music_8c0807c0-889e-46b9-bdfd-16f4aff01930.mp3?agodesk_exp=1789237789&agodesk_sig=e4a4",
  ]);
});

test("buildChatMediaUrlCandidates dekodiert literale JSON-Escapes im Pfad", () => {
  // Echtfall: doppelt kodiertes `&` kommt als literales `\u0026` an.
  const broken =
    "/api/agodesk/media/audio/music_8c0807c0.mp3\\u0026?agodesk_exp=1789237785&agodesk_sig=5aa2";
  const candidates = buildChatMediaUrlCandidates("wss://aurago.example.com/api/agodesk/ws", broken);
  assert.deepEqual(candidates, [
    "https://aurago.example.com/api/agodesk/media/audio/music_8c0807c0.mp3?agodesk_exp=1789237785&agodesk_sig=5aa2",
  ]);
  assert.equal(isSignedAgodeskMediaPath(broken), true);
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

test("buildChatMediaUrlCandidatesFromRefs synthetisiert Media-Pfad aus attachment_id", () => {
  const candidates = buildChatMediaUrlCandidatesFromRefs(
    "wss://aurago.example.com/api/agodesk/ws",
    {
      attachment_id: "att-abc",
      filename: "maja.jpg",
    },
  );
  assert.deepEqual(candidates, ["https://aurago.example.com/api/agodesk/media/att-abc/maja.jpg"]);
});

test("buildChatMediaUrlCandidatesFromRefs ignoriert Persona-Pfade bei attachment_id", () => {
  const candidates = buildChatMediaUrlCandidatesFromRefs(
    "wss://aurago.example.com/api/agodesk/ws",
    {
      attachment_id: "att-abc",
      filename: "maja.jpg",
      path: "/img/personas/punk.png",
    },
  );
  assert.deepEqual(candidates, ["https://aurago.example.com/api/agodesk/media/att-abc/maja.jpg"]);
});

test("buildChatMediaUrlCandidatesFromRefs bevorzugt signierten Cache-Pfad", () => {
  registerSignedAttachmentPaths([
    {
      attachment_id: "att-abc",
      path: "/api/agodesk/media/att-abc/maja.jpg?agodesk_exp=1&agodesk_sig=x",
    },
  ]);
  const candidates = buildChatMediaUrlCandidatesFromRefs(
    "wss://aurago.example.com/api/agodesk/ws",
    {
      attachment_id: "att-abc",
      filename: "maja.jpg",
    },
  );
  assert.equal(
    candidates[0],
    "https://aurago.example.com/api/agodesk/media/att-abc/maja.jpg?agodesk_exp=1&agodesk_sig=x",
  );
});
