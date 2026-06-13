#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const messagesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/lib/i18n/messages",
);

const PATCH_KEYS = [
  "integrations.title",
  "integrations.toggle.ariaLabel",
  "integrations.empty",
  "integrations.status.running",
  "integrations.status.starting",
  "integrations.status.stopped",
  "integrations.embed.title",
  "integrations.embed.openExternal",
  "integrations.embed.loading",
  "integrations.embed.unavailable",
];

/** @type {Record<string, Record<string, string>>} */
const TRANSLATIONS = {
  fr: {
    "integrations.title": "Intégrations",
    "integrations.toggle.ariaLabel": "Afficher ou masquer les intégrations",
    "integrations.empty": "Aucune intégration webhost disponible.",
    "integrations.status.running": "En cours",
    "integrations.status.starting": "Démarrage",
    "integrations.status.stopped": "Arrêté",
    "integrations.embed.title": "Intégration",
    "integrations.embed.openExternal": "Ouvrir dans le navigateur",
    "integrations.embed.loading": "Chargement de l'aperçu…",
    "integrations.embed.unavailable":
      "L'aperçu intégré n'est pas disponible. Ouvrez l'intégration dans le navigateur.",
  },
  es: {
    "integrations.title": "Integraciones",
    "integrations.toggle.ariaLabel": "Mostrar u ocultar integraciones",
    "integrations.empty": "No hay integraciones webhost disponibles.",
    "integrations.status.running": "En ejecución",
    "integrations.status.starting": "Iniciando",
    "integrations.status.stopped": "Detenido",
    "integrations.embed.title": "Integración",
    "integrations.embed.openExternal": "Abrir en el navegador",
    "integrations.embed.loading": "Cargando vista previa…",
    "integrations.embed.unavailable":
      "La vista previa integrada no está disponible. Abre la integración en el navegador.",
  },
  zh: {
    "integrations.title": "集成",
    "integrations.toggle.ariaLabel": "显示或隐藏集成",
    "integrations.empty": "没有可用的 Webhost 集成。",
    "integrations.status.running": "运行中",
    "integrations.status.starting": "启动中",
    "integrations.status.stopped": "已停止",
    "integrations.embed.title": "集成",
    "integrations.embed.openExternal": "在浏览器中打开",
    "integrations.embed.loading": "正在加载预览…",
    "integrations.embed.unavailable": "嵌入式预览不可用。请在浏览器中打开该集成。",
  },
  ja: {
    "integrations.title": "連携",
    "integrations.toggle.ariaLabel": "連携パネルの表示/非表示",
    "integrations.empty": "利用可能な Webhost 連携がありません。",
    "integrations.status.running": "実行中",
    "integrations.status.starting": "起動中",
    "integrations.status.stopped": "停止",
    "integrations.embed.title": "連携",
    "integrations.embed.openExternal": "ブラウザで開く",
    "integrations.embed.loading": "プレビューを読み込み中…",
    "integrations.embed.unavailable":
      "埋め込みプレビューは利用できません。ブラウザで連携を開いてください。",
  },
  nl: {
    "integrations.title": "Integraties",
    "integrations.toggle.ariaLabel": "Integraties tonen of verbergen",
    "integrations.empty": "Geen webhost-integraties beschikbaar.",
    "integrations.status.running": "Actief",
    "integrations.status.starting": "Starten",
    "integrations.status.stopped": "Gestopt",
    "integrations.embed.title": "Integratie",
    "integrations.embed.openExternal": "Openen in browser",
    "integrations.embed.loading": "Voorbeeld laden…",
    "integrations.embed.unavailable":
      "Ingesloten voorbeeld is niet beschikbaar. Open de integratie in de browser.",
  },
  pt: {
    "integrations.title": "Integrações",
    "integrations.toggle.ariaLabel": "Mostrar ou ocultar integrações",
    "integrations.empty": "Nenhuma integração webhost disponível.",
    "integrations.status.running": "Em execução",
    "integrations.status.starting": "A iniciar",
    "integrations.status.stopped": "Parado",
    "integrations.embed.title": "Integração",
    "integrations.embed.openExternal": "Abrir no navegador",
    "integrations.embed.loading": "A carregar pré-visualização…",
    "integrations.embed.unavailable":
      "A pré-visualização incorporada não está disponível. Abra a integração no navegador.",
  },
  pl: {
    "integrations.title": "Integracje",
    "integrations.toggle.ariaLabel": "Pokaż lub ukryj integracje",
    "integrations.empty": "Brak dostępnych integracji webhost.",
    "integrations.status.running": "Działa",
    "integrations.status.starting": "Uruchamianie",
    "integrations.status.stopped": "Zatrzymane",
    "integrations.embed.title": "Integracja",
    "integrations.embed.openExternal": "Otwórz w przeglądarce",
    "integrations.embed.loading": "Ładowanie podglądu…",
    "integrations.embed.unavailable":
      "Osadzony podgląd jest niedostępny. Otwórz integrację w przeglądarce.",
  },
  cs: {
    "integrations.title": "Integrace",
    "integrations.toggle.ariaLabel": "Zobrazit nebo skrýt integrace",
    "integrations.empty": "Nejsou k dispozici žádné webhost integrace.",
    "integrations.status.running": "Běží",
    "integrations.status.starting": "Spouštění",
    "integrations.status.stopped": "Zastaveno",
    "integrations.embed.title": "Integrace",
    "integrations.embed.openExternal": "Otevřít v prohlížeči",
    "integrations.embed.loading": "Načítání náhledu…",
    "integrations.embed.unavailable":
      "Vložený náhled není k dispozici. Otevřete integraci v prohlížeči.",
  },
  it: {
    "integrations.title": "Integrazioni",
    "integrations.toggle.ariaLabel": "Mostra o nascondi le integrazioni",
    "integrations.empty": "Nessuna integrazione webhost disponibile.",
    "integrations.status.running": "In esecuzione",
    "integrations.status.starting": "Avvio",
    "integrations.status.stopped": "Fermata",
    "integrations.embed.title": "Integrazione",
    "integrations.embed.openExternal": "Apri nel browser",
    "integrations.embed.loading": "Caricamento anteprima…",
    "integrations.embed.unavailable":
      "L'anteprima incorporata non è disponibile. Apri l'integrazione nel browser.",
  },
  sv: {
    "integrations.title": "Integrationer",
    "integrations.toggle.ariaLabel": "Visa eller dölj integrationer",
    "integrations.empty": "Inga webhost-integrationer tillgängliga.",
    "integrations.status.running": "Körs",
    "integrations.status.starting": "Startar",
    "integrations.status.stopped": "Stoppad",
    "integrations.embed.title": "Integration",
    "integrations.embed.openExternal": "Öppna i webbläsaren",
    "integrations.embed.loading": "Laddar förhandsgranskning…",
    "integrations.embed.unavailable":
      "Inbäddad förhandsgranskning är inte tillgänglig. Öppna integrationen i webbläsaren.",
  },
  no: {
    "integrations.title": "Integrasjoner",
    "integrations.toggle.ariaLabel": "Vis eller skjul integrasjoner",
    "integrations.empty": "Ingen webhost-integrasjoner tilgjengelig.",
    "integrations.status.running": "Kjører",
    "integrations.status.starting": "Starter",
    "integrations.status.stopped": "Stoppet",
    "integrations.embed.title": "Integrasjon",
    "integrations.embed.openExternal": "Åpne i nettleseren",
    "integrations.embed.loading": "Laster forhåndsvisning…",
    "integrations.embed.unavailable":
      "Innebygd forhåndsvisning er ikke tilgjengelig. Åpne integrasjonen i nettleseren.",
  },
  da: {
    "integrations.title": "Integrationer",
    "integrations.toggle.ariaLabel": "Vis eller skjul integrationer",
    "integrations.empty": "Ingen webhost-integrationer tilgængelige.",
    "integrations.status.running": "Kører",
    "integrations.status.starting": "Starter",
    "integrations.status.stopped": "Stoppet",
    "integrations.embed.title": "Integration",
    "integrations.embed.openExternal": "Åbn i browser",
    "integrations.embed.loading": "Indlæser forhåndsvisning…",
    "integrations.embed.unavailable":
      "Indlejret forhåndsvisning er ikke tilgængelig. Åbn integrationen i browseren.",
  },
  el: {
    "integrations.title": "Ενσωματώσεις",
    "integrations.toggle.ariaLabel": "Εμφάνιση ή απόκρυψη ενσωματώσεων",
    "integrations.empty": "Δεν υπάρχουν διαθέσιμες ενσωματώσεις webhost.",
    "integrations.status.running": "Εκτελείται",
    "integrations.status.starting": "Εκκίνηση",
    "integrations.status.stopped": "Σταματημένο",
    "integrations.embed.title": "Ενσωμάτωση",
    "integrations.embed.openExternal": "Άνοιγμα στο πρόγραμμα περιήγησης",
    "integrations.embed.loading": "Φόρτωση προεπισκόπησης…",
    "integrations.embed.unavailable":
      "Η ενσωματωμένη προεπισκόπηση δεν είναι διαθέσιμη. Ανοίξτε την ενσωμάτωση στο πρόγραμμα περιήγησης.",
  },
  hi: {
    "integrations.title": "इंटीग्रेशन",
    "integrations.toggle.ariaLabel": "इंटीग्रेशन दिखाएँ या छिपाएँ",
    "integrations.empty": "कोई वेबहोस्ट इंटीग्रेशन उपलब्ध नहीं।",
    "integrations.status.running": "चल रहा है",
    "integrations.status.starting": "शुरू हो रहा है",
    "integrations.status.stopped": "रुका हुआ",
    "integrations.embed.title": "इंटीग्रेशन",
    "integrations.embed.openExternal": "ब्राउज़र में खोलें",
    "integrations.embed.loading": "पूर्वावलोकन लोड हो रहा है…",
    "integrations.embed.unavailable":
      "एम्बेडेड पूर्वावलोकन उपलब्ध नहीं है। ब्राउज़र में इंटीग्रेशन खोलें।",
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
