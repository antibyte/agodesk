#!/usr/bin/env node
/** Localize companion presence "Ready" and settings health status labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const messagesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/lib/i18n/messages");

/** @type {Record<string, Record<string, string>>} */
const TRANSLATIONS = {
  cs: {
    "companionPresence.label.ready": "Připraven",
    "settings.health.status.ready": "Připraven",
    "settings.health.status.blocked": "Zkontrolovat",
    "settings.health.status.error": "Chyba",
  },
  da: {
    "companionPresence.label.ready": "Klar",
    "settings.health.status.ready": "Klar",
    "settings.health.status.blocked": "Tjek",
    "settings.health.status.error": "Fejl",
  },
  el: {
    "companionPresence.label.ready": "Έτοιμο",
    "settings.health.status.ready": "Έτοιμο",
    "settings.health.status.blocked": "Έλεγχος",
    "settings.health.status.error": "Σφάλμα",
  },
  es: {
    "companionPresence.label.ready": "Listo",
    "settings.health.status.ready": "Listo",
    "settings.health.status.blocked": "Revisar",
    "settings.health.status.error": "Error",
  },
  fr: {
    "companionPresence.label.ready": "Prêt",
    "settings.health.status.ready": "Prêt",
    "settings.health.status.blocked": "Vérifier",
    "settings.health.status.error": "Erreur",
  },
  hi: {
    "companionPresence.label.ready": "तैयार",
    "settings.health.status.ready": "तैयार",
    "settings.health.status.blocked": "जाँचें",
    "settings.health.status.error": "त्रुटि",
  },
  it: {
    "companionPresence.label.ready": "Pronto",
    "settings.health.status.ready": "Pronto",
    "settings.health.status.blocked": "Controlla",
    "settings.health.status.error": "Errore",
  },
  ja: {
    "companionPresence.label.ready": "準備完了",
    "settings.health.status.ready": "準備完了",
    "settings.health.status.blocked": "確認",
    "settings.health.status.error": "エラー",
    "settings.health.status.thinking": "稼働中",
  },
  nl: {
    "companionPresence.label.ready": "Gereed",
    "settings.health.status.ready": "Gereed",
    "settings.health.status.blocked": "Controleren",
    "settings.health.status.error": "Fout",
  },
  no: {
    "companionPresence.label.ready": "Klar",
    "settings.health.status.ready": "Klar",
    "settings.health.status.blocked": "Sjekk",
    "settings.health.status.error": "Feil",
  },
  pl: {
    "companionPresence.label.ready": "Gotowy",
    "settings.health.status.ready": "Gotowy",
    "settings.health.status.blocked": "Sprawdź",
    "settings.health.status.error": "Błąd",
  },
  pt: {
    "companionPresence.label.ready": "Pronto",
    "settings.health.status.ready": "Pronto",
    "settings.health.status.blocked": "Verificar",
    "settings.health.status.error": "Erro",
  },
  sv: {
    "companionPresence.label.ready": "Redo",
    "settings.health.status.ready": "Redo",
    "settings.health.status.blocked": "Kontrollera",
    "settings.health.status.error": "Fel",
  },
  zh: {
    "companionPresence.label.ready": "就绪",
    "settings.health.status.ready": "就绪",
    "settings.health.status.blocked": "检查",
    "settings.health.status.error": "错误",
  },
};

for (const [locale, patch] of Object.entries(TRANSLATIONS)) {
  const file = path.join(messagesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(patch)) {
    data[key] = value;
  }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

console.log(`patched ${Object.keys(TRANSLATIONS).length} locale files`);