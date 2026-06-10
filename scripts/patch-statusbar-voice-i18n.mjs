#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const messagesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/lib/i18n/messages");
const en = JSON.parse(fs.readFileSync(path.join(messagesDir, "en.json"), "utf8"));
const fr = JSON.parse(fs.readFileSync(path.join(messagesDir, "fr.json"), "utf8"));

const TRANSLATIONS = {
  fr: {
    "statusBar.voiceOutput.on.title": "Synthèse vocale activée",
    "statusBar.voiceOutput.off.title": "Synthèse vocale désactivée",
    "statusBar.voiceOutput.toggle.ariaLabel": "Activer/désactiver la synthèse vocale",
  },
  es: {
    "statusBar.voiceOutput.on.title": "Salida de voz activada",
    "statusBar.voiceOutput.off.title": "Salida de voz desactivada",
    "statusBar.voiceOutput.toggle.ariaLabel": "Activar/desactivar salida de voz",
  },
  zh: {
    "statusBar.voiceOutput.on.title": "语音输出已开启",
    "statusBar.voiceOutput.off.title": "语音输出已关闭",
    "statusBar.voiceOutput.toggle.ariaLabel": "切换语音输出",
  },
  ja: {
    "statusBar.voiceOutput.on.title": "音声出力オン",
    "statusBar.voiceOutput.off.title": "音声出力オフ",
    "statusBar.voiceOutput.toggle.ariaLabel": "音声出力を切り替え",
  },
  nl: {
    "statusBar.voiceOutput.on.title": "Spraakuitvoer aan",
    "statusBar.voiceOutput.off.title": "Spraakuitvoer uit",
    "statusBar.voiceOutput.toggle.ariaLabel": "Spraakuitvoer in-/uitschakelen",
  },
  pt: {
    "statusBar.voiceOutput.on.title": "Saída de voz ativada",
    "statusBar.voiceOutput.off.title": "Saída de voz desativada",
    "statusBar.voiceOutput.toggle.ariaLabel": "Alternar saída de voz",
  },
  pl: {
    "statusBar.voiceOutput.on.title": "Wyjście głosowe włączone",
    "statusBar.voiceOutput.off.title": "Wyjście głosowe wyłączone",
    "statusBar.voiceOutput.toggle.ariaLabel": "Przełącz wyjście głosowe",
  },
  cs: {
    "statusBar.voiceOutput.on.title": "Hlasový výstup zapnut",
    "statusBar.voiceOutput.off.title": "Hlasový výstup vypnut",
    "statusBar.voiceOutput.toggle.ariaLabel": "Přepnout hlasový výstup",
  },
  it: {
    "statusBar.voiceOutput.on.title": "Uscita vocale attiva",
    "statusBar.voiceOutput.off.title": "Uscita vocale disattivata",
    "statusBar.voiceOutput.toggle.ariaLabel": "Attiva/disattiva uscita vocale",
  },
  sv: {
    "statusBar.voiceOutput.on.title": "Röstutmatning på",
    "statusBar.voiceOutput.off.title": "Röstutmatning av",
    "statusBar.voiceOutput.toggle.ariaLabel": "Växla röstutmatning",
  },
  no: {
    "statusBar.voiceOutput.on.title": "Taleutdata på",
    "statusBar.voiceOutput.off.title": "Taleutdata av",
    "statusBar.voiceOutput.toggle.ariaLabel": "Slå taleutdata av/på",
  },
  da: {
    "statusBar.voiceOutput.on.title": "Taleoutput til",
    "statusBar.voiceOutput.off.title": "Taleoutput fra",
    "statusBar.voiceOutput.toggle.ariaLabel": "Slå taleoutput til/fra",
  },
  el: {
    "statusBar.voiceOutput.on.title": "Φωνητική έξοδος ενεργή",
    "statusBar.voiceOutput.off.title": "Φωνητική έξοδος ανενεργή",
    "statusBar.voiceOutput.toggle.ariaLabel": "Εναλλαγή φωνητικής εξόδου",
  },
  hi: {
    "statusBar.voiceOutput.on.title": "वाक् आउटपुट चालू",
    "statusBar.voiceOutput.off.title": "वाक् आउटपुट बंद",
    "statusBar.voiceOutput.toggle.ariaLabel": "वाक् आउटपुट टॉगल करें",
  },
};

const KEYS = Object.keys(TRANSLATIONS.fr);

function writeJson(filePath, data) {
  const lines = Object.entries(data).map(
    ([key, value]) => `  "${key}": ${JSON.stringify(value)}`,
  );
  fs.writeFileSync(filePath, `{\n${lines.join(",\n")}\n}\n`, "utf8");
}

for (const locale of Object.keys(TRANSLATIONS)) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  for (const key of KEYS) {
    data[key] = TRANSLATIONS[locale][key];
  }
  writeJson(filePath, data);
  console.log(`Updated ${locale}.json`);
}
