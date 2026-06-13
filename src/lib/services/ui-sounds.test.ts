import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_UI_SOUND_SETTINGS, UI_SOUND_THEMES } from "../types/protocol.ts";
import { normalizeUiSoundSettings } from "./settings.ts";
import { UI_SOUND_THEME_DEFINITIONS } from "./ui-sound-themes.ts";

test("normalizeUiSoundSettings liefert Defaults bei leerer Eingabe", () => {
  assert.deepEqual(normalizeUiSoundSettings(undefined), DEFAULT_UI_SOUND_SETTINGS);
  assert.deepEqual(normalizeUiSoundSettings(null), DEFAULT_UI_SOUND_SETTINGS);
});

test("normalizeUiSoundSettings begrenzt volume auf 0–1", () => {
  assert.equal(normalizeUiSoundSettings({ volume: 1.5 }).volume, 1);
  assert.equal(normalizeUiSoundSettings({ volume: -0.2 }).volume, 0);
  assert.equal(normalizeUiSoundSettings({ volume: Number.NaN }).volume, 0.2);
});

test("normalizeUiSoundSettings lehnt unbekannte Themes ab", () => {
  assert.equal(
    normalizeUiSoundSettings({ theme: "loud" as never }).theme,
    DEFAULT_UI_SOUND_SETTINGS.theme,
  );
});

test("normalizeUiSoundSettings akzeptiert gueltige Themes", () => {
  for (const theme of UI_SOUND_THEMES) {
    assert.equal(normalizeUiSoundSettings({ theme }).theme, theme);
  }
});

test("normalizeAppSettings behält uiSounds Theme und Lautstärke", async () => {
  const { normalizeAppSettings } = await import("./settings.ts");
  assert.deepEqual(
    normalizeAppSettings({
      uiSounds: { enabled: false, theme: "modern", volume: 0.75 },
    }).uiSounds,
    { enabled: false, theme: "modern", volume: 0.75 },
  );
});

test("UI_SOUND_THEME_DEFINITIONS enthalten alle Events pro Theme", () => {
  const events = ["send", "receive", "success", "error", "notice"] as const;

  for (const theme of UI_SOUND_THEMES) {
    const definition = UI_SOUND_THEME_DEFINITIONS[theme];
    assert.ok(definition.baseGain > 0 && definition.baseGain <= 1);

    for (const event of events) {
      const tones = definition.events[event];
      assert.ok(Array.isArray(tones) && tones.length > 0, `${theme}/${event}`);
      for (const tone of tones) {
        assert.ok(tone.freq > 0);
        assert.ok(tone.peakGain > 0);
        assert.ok(tone.attack + tone.decay <= 0.12);
      }
    }
  }
});

test("normalizeAppSettings normalisiert voiceName und Sprache", async () => {
  const { normalizeAppSettings } = await import("./settings.ts");

  // Ohne gespeicherte Einstellungen:
  const emptyNormalized = normalizeAppSettings({});
  assert.equal(emptyNormalized.speech.voiceName, "Zephyr");
  // In der Node-Testumgebung ist navigator undefined, also sollte es auf "de-DE" fallen:
  assert.equal(emptyNormalized.speech.language, "de-DE");

  // Mit expliziten Einstellungen:
  const customNormalized = normalizeAppSettings({
    speech: {
      enabled: true,
      modelId: "test-model",
      language: "en-GB",
      autoSendToAuraGo: true,
      agentMode: false,
      voiceResponses: false,
      voiceName: "Aoede",
    },
  });

  assert.equal(customNormalized.speech.voiceName, "Aoede");
  assert.equal(customNormalized.speech.language, "en-GB");
});
