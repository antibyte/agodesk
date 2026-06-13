#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const messagesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/lib/i18n/messages",
);

const PATCH_KEYS = [
  "warnings.title",
  "warnings.toggle.ariaLabel",
  "warnings.empty",
  "warnings.unacknowledged",
  "warnings.unacknowledgedLabel",
  "warnings.acknowledge",
  "warnings.acknowledgeAll",
  "warnings.acknowledged",
  "warnings.severity.info",
  "warnings.severity.warning",
  "warnings.severity.error",
];

/** @type {Record<string, Record<string, string>>} */
const TRANSLATIONS = {
  fr: {
    "warnings.title": "Avertissements système",
    "warnings.toggle.ariaLabel": "Afficher ou masquer les avertissements système",
    "warnings.empty": "Aucun avertissement.",
    "warnings.unacknowledged": "{count} non confirmé(s)",
    "warnings.unacknowledgedLabel": "non confirmé",
    "warnings.acknowledge": "Confirmer",
    "warnings.acknowledgeAll": "Tout confirmer",
    "warnings.acknowledged": "Confirmé",
    "warnings.severity.info": "Info",
    "warnings.severity.warning": "Avertissement",
    "warnings.severity.error": "Erreur",
  },
  es: {
    "warnings.title": "Avisos del sistema",
    "warnings.toggle.ariaLabel": "Mostrar u ocultar avisos del sistema",
    "warnings.empty": "No hay avisos.",
    "warnings.unacknowledged": "{count} sin confirmar",
    "warnings.unacknowledgedLabel": "sin confirmar",
    "warnings.acknowledge": "Confirmar",
    "warnings.acknowledgeAll": "Confirmar todo",
    "warnings.acknowledged": "Confirmado",
    "warnings.severity.info": "Info",
    "warnings.severity.warning": "Advertencia",
    "warnings.severity.error": "Error",
  },
  zh: {
    "warnings.title": "系统警告",
    "warnings.toggle.ariaLabel": "显示或隐藏系统警告",
    "warnings.empty": "无警告。",
    "warnings.unacknowledged": "{count} 条未确认",
    "warnings.unacknowledgedLabel": "未确认",
    "warnings.acknowledge": "确认",
    "warnings.acknowledgeAll": "全部确认",
    "warnings.acknowledged": "已确认",
    "warnings.severity.info": "信息",
    "warnings.severity.warning": "警告",
    "warnings.severity.error": "错误",
  },
  ja: {
    "warnings.title": "システム警告",
    "warnings.toggle.ariaLabel": "システム警告の表示/非表示",
    "warnings.empty": "警告はありません。",
    "warnings.unacknowledged": "未確認 {count} 件",
    "warnings.unacknowledgedLabel": "未確認",
    "warnings.acknowledge": "確認",
    "warnings.acknowledgeAll": "すべて確認",
    "warnings.acknowledged": "確認済み",
    "warnings.severity.info": "情報",
    "warnings.severity.warning": "警告",
    "warnings.severity.error": "エラー",
  },
  nl: {
    "warnings.title": "Systeemwaarschuwingen",
    "warnings.toggle.ariaLabel": "Systeemwaarschuwingen tonen of verbergen",
    "warnings.empty": "Geen waarschuwingen.",
    "warnings.unacknowledged": "{count} onbevestigd",
    "warnings.unacknowledgedLabel": "onbevestigd",
    "warnings.acknowledge": "Bevestigen",
    "warnings.acknowledgeAll": "Alles bevestigen",
    "warnings.acknowledged": "Bevestigd",
    "warnings.severity.info": "Info",
    "warnings.severity.warning": "Waarschuwing",
    "warnings.severity.error": "Fout",
  },
  pt: {
    "warnings.title": "Avisos do sistema",
    "warnings.toggle.ariaLabel": "Mostrar ou ocultar avisos do sistema",
    "warnings.empty": "Sem avisos.",
    "warnings.unacknowledged": "{count} por confirmar",
    "warnings.unacknowledgedLabel": "por confirmar",
    "warnings.acknowledge": "Confirmar",
    "warnings.acknowledgeAll": "Confirmar tudo",
    "warnings.acknowledged": "Confirmado",
    "warnings.severity.info": "Info",
    "warnings.severity.warning": "Aviso",
    "warnings.severity.error": "Erro",
  },
  pl: {
    "warnings.title": "Ostrzeżenia systemowe",
    "warnings.toggle.ariaLabel": "Pokaż lub ukryj ostrzeżenia systemowe",
    "warnings.empty": "Brak ostrzeżeń.",
    "warnings.unacknowledged": "{count} niepotwierdzone",
    "warnings.unacknowledgedLabel": "niepotwierdzone",
    "warnings.acknowledge": "Potwierdź",
    "warnings.acknowledgeAll": "Potwierdź wszystkie",
    "warnings.acknowledged": "Potwierdzone",
    "warnings.severity.info": "Info",
    "warnings.severity.warning": "Ostrzeżenie",
    "warnings.severity.error": "Błąd",
  },
  cs: {
    "warnings.title": "Systémová upozornění",
    "warnings.toggle.ariaLabel": "Zobrazit nebo skrýt systémová upozornění",
    "warnings.empty": "Žádná upozornění.",
    "warnings.unacknowledged": "{count} nepotvrzeno",
    "warnings.unacknowledgedLabel": "nepotvrzeno",
    "warnings.acknowledge": "Potvrdit",
    "warnings.acknowledgeAll": "Potvrdit vše",
    "warnings.acknowledged": "Potvrzeno",
    "warnings.severity.info": "Info",
    "warnings.severity.warning": "Varování",
    "warnings.severity.error": "Chyba",
  },
  it: {
    "warnings.title": "Avvisi di sistema",
    "warnings.toggle.ariaLabel": "Mostra o nascondi gli avvisi di sistema",
    "warnings.empty": "Nessun avviso.",
    "warnings.unacknowledged": "{count} non confermati",
    "warnings.unacknowledgedLabel": "non confermato",
    "warnings.acknowledge": "Conferma",
    "warnings.acknowledgeAll": "Conferma tutto",
    "warnings.acknowledged": "Confermato",
    "warnings.severity.info": "Info",
    "warnings.severity.warning": "Avviso",
    "warnings.severity.error": "Errore",
  },
  sv: {
    "warnings.title": "Systemvarningar",
    "warnings.toggle.ariaLabel": "Visa eller dölj systemvarningar",
    "warnings.empty": "Inga varningar.",
    "warnings.unacknowledged": "{count} obekräftade",
    "warnings.unacknowledgedLabel": "obekräftad",
    "warnings.acknowledge": "Bekräfta",
    "warnings.acknowledgeAll": "Bekräfta alla",
    "warnings.acknowledged": "Bekräftad",
    "warnings.severity.info": "Info",
    "warnings.severity.warning": "Varning",
    "warnings.severity.error": "Fel",
  },
  no: {
    "warnings.title": "Systemvarsler",
    "warnings.toggle.ariaLabel": "Vis eller skjul systemvarsler",
    "warnings.empty": "Ingen varsler.",
    "warnings.unacknowledged": "{count} ubekreftet",
    "warnings.unacknowledgedLabel": "ubekreftet",
    "warnings.acknowledge": "Bekreft",
    "warnings.acknowledgeAll": "Bekreft alle",
    "warnings.acknowledged": "Bekreftet",
    "warnings.severity.info": "Info",
    "warnings.severity.warning": "Advarsel",
    "warnings.severity.error": "Feil",
  },
  da: {
    "warnings.title": "Systemadvarsler",
    "warnings.toggle.ariaLabel": "Vis eller skjul systemadvarsler",
    "warnings.empty": "Ingen advarsler.",
    "warnings.unacknowledged": "{count} ubekræftet",
    "warnings.unacknowledgedLabel": "ubekræftet",
    "warnings.acknowledge": "Bekræft",
    "warnings.acknowledgeAll": "Bekræft alle",
    "warnings.acknowledged": "Bekræftet",
    "warnings.severity.info": "Info",
    "warnings.severity.warning": "Advarsel",
    "warnings.severity.error": "Fejl",
  },
  el: {
    "warnings.title": "Προειδοποιήσεις συστήματος",
    "warnings.toggle.ariaLabel": "Εμφάνιση ή απόκρυψη προειδοποιήσεων συστήματος",
    "warnings.empty": "Καμία προειδοποίηση.",
    "warnings.unacknowledged": "{count} μη επιβεβαιωμένα",
    "warnings.unacknowledgedLabel": "μη επιβεβαιωμένο",
    "warnings.acknowledge": "Επιβεβαίωση",
    "warnings.acknowledgeAll": "Επιβεβαίωση όλων",
    "warnings.acknowledged": "Επιβεβαιωμένο",
    "warnings.severity.info": "Πληροφορία",
    "warnings.severity.warning": "Προειδοποίηση",
    "warnings.severity.error": "Σφάλμα",
  },
  hi: {
    "warnings.title": "सिस्टम चेतावनियाँ",
    "warnings.toggle.ariaLabel": "सिस्टम चेतावनियाँ दिखाएँ या छिपाएँ",
    "warnings.empty": "कोई चेतावनी नहीं।",
    "warnings.unacknowledged": "{count} बिना पुष्टि",
    "warnings.unacknowledgedLabel": "बिना पुष्टि",
    "warnings.acknowledge": "पुष्टि करें",
    "warnings.acknowledgeAll": "सभी की पुष्टि करें",
    "warnings.acknowledged": "पुष्टि की गई",
    "warnings.severity.info": "जानकारी",
    "warnings.severity.warning": "चेतावनी",
    "warnings.severity.error": "त्रुटि",
  },
};

function writeJson(filePath, data) {
  const lines = Object.entries(data).map(([key, value]) => `  "${key}": ${JSON.stringify(value)}`);
  fs.writeFileSync(filePath, `{\n${lines.join(",\n")}\n}\n`, "utf8");
}

for (const locale of Object.keys(TRANSLATIONS)) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const patch = TRANSLATIONS[locale];

  for (const key of PATCH_KEYS) {
    if (!(key in patch)) {
      throw new Error(`Missing translation ${locale}.${key}`);
    }
    data[key] = patch[key];
  }

  writeJson(filePath, data);
  console.log(`Updated ${locale}.json (${PATCH_KEYS.length} keys)`);
}

console.log("Done.");
