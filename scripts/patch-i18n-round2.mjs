#!/usr/bin/env node
/** Second-pass fixes for remaining English phrases and mock preset labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const messagesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/lib/i18n/messages",
);

/** @type {Record<string, Record<string, string>>} */
const PATCHES = {
  cs: {
    "settings.connection.websocket.title": "WebSocketový server",
    "settingsPreset.loopbackMock.label": "Loopback (simulace)",
    "companionPresence.label.offline": "Nepřipojeno",
    "speechBanner.provider.offline": "Nepřipojeno",
  },
  da: {
    "settings.speech.asrStatus.downloadButton": "Hent model",
    "settingsPreset.loopbackMock.label": "Loopback (simuleret)",
    "companionPresence.label.offline": "Frakoblet",
    "shellApproval.stopSession": "Afslut session",
    "speechBanner.provider.offline": "Frakoblet",
    "settings.speech.hybridTtsBackend.label": "TTS (Hybrid)",
  },
  de: {
    "settings.section.appearance.hint": "Design & Oberfläche",
    "settings.speech.subsection.tests": "Tests & API",
    "settingsPreset.loopbackMock.label": "Loopback (Simulation)",
    "companionPresence.label.offline": "Getrennt",
    "speechBanner.provider.offline": "Getrennt",
    "uiSoundTheme.modern": "Modern",
    "uiSoundTheme.warm": "Warm",
  },
  el: {
    "settingsPreset.loopbackMock.label": "Loopback (δοκιμαστικό)",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge (edge-tts, διαδικτυακά)",
  },
  es: {
    "settingsPreset.loopbackMock.label": "Loopback (simulado)",
  },
  fr: {
    "statusBar.session.accepted": "Session active",
    "settingsPreset.loopbackMock.label": "Loopback (simulation)",
    "chatView.history.messageCount": "{count} messages",
    "settings.appearance.uiSounds.volume": "Volume ({percent} %)",
  },
  hi: {
    "settingsPreset.loopbackMock.label": "Loopback (नकली)",
  },
  it: {
    "settingsPreset.loopbackMock.label": "Loopback (simulato)",
    "companionPresence.label.offline": "Disconnesso",
    "speechBanner.provider.offline": "Disconnesso",
    "settings.speech.subsection.provider": "Fornitore",
    "settings.health.speech.provider": "Fornitore: {provider}",
    "settings.appearance.uiSounds.volume": "Volume ({percent}%)",
  },
  ja: {
    "settingsPreset.loopbackMock.label": "Loopback (モック)",
  },
  nl: {
    "settingsPreset.loopbackMock.label": "Loopback (simulatie)",
    "companionPresence.label.offline": "Niet verbonden",
    "speechBanner.provider.offline": "Niet verbonden",
    "settings.speech.subsection.provider": "Aanbieder",
    "settings.appearance.uiSounds.volume": "Volume ({percent}%)",
    "update.banner.later": "Later",
  },
  no: {
    "settingsPreset.loopbackMock.label": "Loopback (simulert)",
    "companionPresence.label.offline": "Frakoblet",
    "speechBanner.provider.offline": "Frakoblet",
    "settings.speech.hybridTtsBackend.label": "TTS (Hybrid)",
  },
  pl: {
    "settingsPreset.loopbackMock.label": "Loopback (symulacja)",
    "companionPresence.label.offline": "Niedostępny",
    "speechBanner.provider.offline": "Niedostępny",
  },
  pt: {
    "settingsPreset.loopbackMock.label": "Loopback (simulado)",
    "companionPresence.label.offline": "Desligado",
    "speechBanner.provider.offline": "Desligado",
    "settings.appearance.uiSounds.volume": "Volume ({percent}%)",
  },
  sv: {
    "settingsPreset.loopbackMock.label": "Loopback (simulerad)",
    "companionPresence.label.offline": "Frånkopplad",
    "speechBanner.provider.offline": "Frånkopplad",
    "settings.speech.hybridTtsBackend.label": "TTS (Hybrid)",
  },
};

for (const [locale, patch] of Object.entries(PATCHES)) {
  const file = path.join(messagesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  let updated = 0;
  for (const [key, value] of Object.entries(patch)) {
    if (data[key] !== value) {
      data[key] = value;
      updated += 1;
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`${locale}: ${updated} keys`);
}
