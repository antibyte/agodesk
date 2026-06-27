#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const messagesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/lib/i18n/messages",
);
const en = JSON.parse(fs.readFileSync(path.join(messagesDir, "en.json"), "utf8"));

const KEEP_ENGLISH = new Set([
  "common.brand.agodesk",
  "common.brand.aurago",
  "common.emDash",
  "messageBubble.userAvatar",
  "messageBubble.sender.default",
  "chatMessageBody.codeLanguageFallback",
  "inputBox.shortcut.ctrlSend",
  "inputBox.shortcut.send",
  "settings.connection.serverUrl.placeholder",
  "settings.connection.origin.label",
  "settings.connection.transport.label",
  "settings.connection.transport.wss",
  "settings.device.deviceId.label",
  "settings.device.sessionId.label",
  "settings.about.endpoint.label",
  "notifications.preview.codePlaceholder",
  "settings.speech.apiKey.freeKeyLink",
  "settings.speech.apiKey.placeholderNew",
  "settings.speech.modelId.placeholder",
  "settings.speech.provider.gemini_live.title",
  "settings.speech.hybridTtsBackend.azure",
  "settingsPreset.auragoLan.label",
  "settings.section.openpets.label",
  "settings.section.speech.hint",
  "settings.section.shell.label",
  "settings.shellAccess.shell",
  "speechBanner.mode.autoSend",
  "speechBanner.provider.gemini_live",
  "tray.tooltip",
  "session.status.loopback",
  "settings.health.companion.title",
  "settings.device.hostname.label",
  "settings.about.version.label",
  "settings.connection.session.label",
  "shellApproval.timeout",
  "shellApproval.timeoutValue",
  "warnings.severity.info",
]);

/** Keys that are valid cognates or loanwords when identical to English. */
const COGNATE_KEYS = new Set([
  "certModal.host.label",
  "chatPlan.title",
  "chatPlan.tasks.total",
  "chatView.stop.label",
  "connection.status.error",
  "integrations.embed.title",
  "locale.setting.system",
  "remoteControl.operation.screenshot",
  "session.status.error",
  "settings.about.protocol.label",
  "settings.connection.status.label",
  "settings.desktop.screenshots.label",
  "settings.device.platform.label",
  "settings.health.status.error",
  "settings.section.desktop.label",
  "settings.speech.apiKey.statusLabel",
  "settings.speech.bargeInMode.silero",
  "settings.speech.hybridTtsBackend.edgeTts",
  "settings.speech.provider.hybrid.title",
  "settings.speech.subsection.tests",
  "speechBanner.mode.agent",
  "speechBanner.provider.hybrid",
  "theme.system",
  "uiSoundTheme.modern",
  "uiSoundTheme.warm",
  "warnings.severity.error",
  "chatView.history.messageCount",
  "settings.appearance.uiSounds.volume",
  "statusBar.session.accepted",
  "update.banner.later",
]);

const locales = fs
  .readdirSync(messagesDir)
  .filter((f) => f.endsWith(".json") && f !== "en.json")
  .map((f) => f.replace(".json", ""));

const gaps = {};
for (const locale of locales) {
  const data = JSON.parse(fs.readFileSync(path.join(messagesDir, `${locale}.json`), "utf8"));
  gaps[locale] = [];
  for (const key of Object.keys(en)) {
    if (KEEP_ENGLISH.has(key) || COGNATE_KEYS.has(key)) continue;
    if (data[key] === en[key] && /[A-Za-z]{3,}/.test(en[key])) {
      gaps[locale].push(key);
    }
  }
}

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "i18n-remaining-gaps.json");
fs.writeFileSync(out, `${JSON.stringify(gaps, null, 2)}\n`, "utf8");

for (const locale of locales) {
  console.log(`${locale}: ${gaps[locale].length} gaps`);
}

const union = new Set();
for (const keys of Object.values(gaps)) keys.forEach((k) => union.add(k));
console.log(`unique gap keys across locales: ${union.size}`);
