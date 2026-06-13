import test from "node:test";
import assert from "node:assert/strict";
import { APP_LOCALES, LOCALE_LABELS, normalizeLocaleSetting, resolveLocale } from "./locales.ts";
import { getDeMessages, getEnMessages, loadMessages } from "./loader.ts";
import { translate } from "./translate.ts";
import type { MessageKey } from "./types.ts";
import { formatDayLabel } from "./format.ts";
import { initLocale } from "./store.ts";

test("normalizeLocaleSetting akzeptiert system und gueltige Locales", () => {
  assert.equal(normalizeLocaleSetting("system"), "system");
  assert.equal(normalizeLocaleSetting("de"), "de");
  assert.equal(normalizeLocaleSetting("invalid"), "system");
});

test("resolveLocale mappt system auf fallback en ohne navigator", () => {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { language: "xx-XX", languages: ["xx-XX"] },
  });
  try {
    assert.equal(resolveLocale("system"), "en");
    assert.equal(resolveLocale("de"), "de");
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: original,
    });
  }
});

test("resolveLocale erkennt navigator.language", () => {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { language: "fr-FR", languages: ["fr-FR", "en"] },
  });
  try {
    assert.equal(resolveLocale("system"), "fr");
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: original,
    });
  }
});

test("loadMessages fallback: leere fr-Locale nutzt en/de", () => {
  const fr = loadMessages("fr");
  assert.equal(fr["settings.title"], "Paramètres");
  assert.equal(fr["chatFormat.day.today"], "Aujourd'hui");
});

test("translate ersetzt Platzhalter", () => {
  const de = getDeMessages();
  assert.equal(
    translate(de, "settings.appearance.uiSounds.volume" as MessageKey, {
      percent: 50,
    }),
    "Lautstärke (50 %)",
  );
});

test("en.json enthaelt alle de.json Keys", () => {
  const de = getDeMessages();
  const en = getEnMessages();
  for (const key of Object.keys(de)) {
    assert.ok(typeof en[key] === "string" && en[key].length > 0, `missing en: ${key}`);
  }
});

test("alle Locale-Dateien enthalten alle de.json Keys", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const de = getDeMessages();
  const dir = path.dirname(fileURLToPath(import.meta.url)) + "/messages";
  for (const locale of APP_LOCALES) {
    if (locale === "de") {
      continue;
    }
    const raw = fs.readFileSync(path.join(dir, `${locale}.json`), "utf8");
    const data = JSON.parse(raw) as Record<string, string>;
    for (const key of Object.keys(de)) {
      assert.ok(typeof data[key] === "string" && data[key].length > 0, `missing ${locale}: ${key}`);
    }
  }
});

test("formatDayLabel lokalisiert Heute/Today", async () => {
  const now = new Date("2026-05-30T12:00:00Z");
  await initLocale("de");
  assert.equal(formatDayLabel("2026-05-30T10:00:00Z", "de", now), "Heute");
  await initLocale("en");
  assert.equal(formatDayLabel("2026-05-30T10:00:00Z", "en", now), "Today");
});

test("LOCALE_LABELS deckt alle APP_LOCALES ab", () => {
  for (const locale of APP_LOCALES) {
    assert.ok(LOCALE_LABELS[locale].length > 0);
  }
});
