#!/usr/bin/env node
/** Localize UI-refresh keys (settings save, speech subsections, status bar overflow, chat plan dismiss). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const messagesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/lib/i18n/messages",
);

const PATCH_KEYS = [
  "settings.saveSuccess",
  "settings.speech.subsection.provider",
  "settings.speech.subsection.asr",
  "settings.speech.subsection.tts",
  "settings.speech.subsection.tests",
  "statusBar.overflow.title",
  "statusBar.overflow.ariaLabel",
  "statusBar.overflow.close",
  "chatPlan.dismiss",
  "chatPlan.dismiss.ariaLabel",
];

/** @type {Record<string, Record<string, string>>} */
const TRANSLATIONS = {
  fr: {
    "settings.saveSuccess": "Paramètres enregistrés. Reconnexion en cours…",
    "settings.speech.subsection.provider": "Fournisseur",
    "settings.speech.subsection.asr": "Reconnaissance vocale",
    "settings.speech.subsection.tts": "Synthèse vocale",
    "settings.speech.subsection.tests": "Tests et API",
    "statusBar.overflow.title": "Plus d'actions",
    "statusBar.overflow.ariaLabel": "Afficher plus d'actions",
    "statusBar.overflow.close": "Fermer le menu",
    "chatPlan.dismiss": "Masquer",
    "chatPlan.dismiss.ariaLabel": "Masquer le panneau de plan",
  },
  es: {
    "settings.saveSuccess": "Ajustes guardados. Reconectando…",
    "settings.speech.subsection.provider": "Proveedor",
    "settings.speech.subsection.asr": "Reconocimiento de voz",
    "settings.speech.subsection.tts": "Salida de voz",
    "settings.speech.subsection.tests": "Pruebas y API",
    "statusBar.overflow.title": "Más acciones",
    "statusBar.overflow.ariaLabel": "Mostrar más acciones",
    "statusBar.overflow.close": "Cerrar menú",
    "chatPlan.dismiss": "Ocultar",
    "chatPlan.dismiss.ariaLabel": "Ocultar panel del plan",
  },
  zh: {
    "settings.saveSuccess": "设置已保存，正在重新连接…",
    "settings.speech.subsection.provider": "提供商",
    "settings.speech.subsection.asr": "语音识别",
    "settings.speech.subsection.tts": "语音输出",
    "settings.speech.subsection.tests": "测试与 API",
    "statusBar.overflow.title": "更多操作",
    "statusBar.overflow.ariaLabel": "显示更多操作",
    "statusBar.overflow.close": "关闭菜单",
    "chatPlan.dismiss": "隐藏",
    "chatPlan.dismiss.ariaLabel": "隐藏计划面板",
  },
  ja: {
    "settings.saveSuccess": "設定を保存しました。再接続しています…",
    "settings.speech.subsection.provider": "プロバイダー",
    "settings.speech.subsection.asr": "音声認識",
    "settings.speech.subsection.tts": "音声出力",
    "settings.speech.subsection.tests": "テストと API",
    "statusBar.overflow.title": "その他の操作",
    "statusBar.overflow.ariaLabel": "その他の操作を表示",
    "statusBar.overflow.close": "メニューを閉じる",
    "chatPlan.dismiss": "非表示",
    "chatPlan.dismiss.ariaLabel": "プランパネルを非表示",
  },
  nl: {
    "settings.saveSuccess": "Instellingen opgeslagen. Opnieuw verbinden…",
    "settings.speech.subsection.provider": "Provider",
    "settings.speech.subsection.asr": "Spraakherkenning",
    "settings.speech.subsection.tts": "Spraakuitvoer",
    "settings.speech.subsection.tests": "Tests en API",
    "statusBar.overflow.title": "Meer acties",
    "statusBar.overflow.ariaLabel": "Meer acties tonen",
    "statusBar.overflow.close": "Menu sluiten",
    "chatPlan.dismiss": "Verbergen",
    "chatPlan.dismiss.ariaLabel": "Planpaneel verbergen",
  },
  pt: {
    "settings.saveSuccess": "Definições guardadas. A reconectar…",
    "settings.speech.subsection.provider": "Fornecedor",
    "settings.speech.subsection.asr": "Reconhecimento de voz",
    "settings.speech.subsection.tts": "Saída de voz",
    "settings.speech.subsection.tests": "Testes e API",
    "statusBar.overflow.title": "Mais ações",
    "statusBar.overflow.ariaLabel": "Mostrar mais ações",
    "statusBar.overflow.close": "Fechar menu",
    "chatPlan.dismiss": "Ocultar",
    "chatPlan.dismiss.ariaLabel": "Ocultar painel do plano",
  },
  pl: {
    "settings.saveSuccess": "Ustawienia zapisane. Ponowne łączenie…",
    "settings.speech.subsection.provider": "Dostawca",
    "settings.speech.subsection.asr": "Rozpoznawanie mowy",
    "settings.speech.subsection.tts": "Wyjście głosowe",
    "settings.speech.subsection.tests": "Testy i API",
    "statusBar.overflow.title": "Więcej akcji",
    "statusBar.overflow.ariaLabel": "Pokaż więcej akcji",
    "statusBar.overflow.close": "Zamknij menu",
    "chatPlan.dismiss": "Ukryj",
    "chatPlan.dismiss.ariaLabel": "Ukryj panel planu",
  },
  cs: {
    "settings.saveSuccess": "Nastavení uloženo. Obnovuje se připojení…",
    "settings.speech.subsection.provider": "Poskytovatel",
    "settings.speech.subsection.asr": "Rozpoznávání řeči",
    "settings.speech.subsection.tts": "Hlasový výstup",
    "settings.speech.subsection.tests": "Testy a API",
    "statusBar.overflow.title": "Další akce",
    "statusBar.overflow.ariaLabel": "Zobrazit další akce",
    "statusBar.overflow.close": "Zavřít menu",
    "chatPlan.dismiss": "Skrýt",
    "chatPlan.dismiss.ariaLabel": "Skrýt panel plánu",
  },
  it: {
    "settings.saveSuccess": "Impostazioni salvate. Riconnessione in corso…",
    "settings.speech.subsection.provider": "Provider",
    "settings.speech.subsection.asr": "Riconoscimento vocale",
    "settings.speech.subsection.tts": "Uscita vocale",
    "settings.speech.subsection.tests": "Test e API",
    "statusBar.overflow.title": "Altre azioni",
    "statusBar.overflow.ariaLabel": "Mostra altre azioni",
    "statusBar.overflow.close": "Chiudi menu",
    "chatPlan.dismiss": "Nascondi",
    "chatPlan.dismiss.ariaLabel": "Nascondi pannello piano",
  },
  sv: {
    "settings.saveSuccess": "Inställningar sparade. Återansluter…",
    "settings.speech.subsection.provider": "Leverantör",
    "settings.speech.subsection.asr": "Taligenkänning",
    "settings.speech.subsection.tts": "Röstutmatning",
    "settings.speech.subsection.tests": "Tester och API",
    "statusBar.overflow.title": "Fler åtgärder",
    "statusBar.overflow.ariaLabel": "Visa fler åtgärder",
    "statusBar.overflow.close": "Stäng meny",
    "chatPlan.dismiss": "Dölj",
    "chatPlan.dismiss.ariaLabel": "Dölj planpanel",
  },
  no: {
    "settings.saveSuccess": "Innstillinger lagret. Kobler til på nytt…",
    "settings.speech.subsection.provider": "Leverandør",
    "settings.speech.subsection.asr": "Talegjenkjenning",
    "settings.speech.subsection.tts": "Taleutdata",
    "settings.speech.subsection.tests": "Tester og API",
    "statusBar.overflow.title": "Flere handlinger",
    "statusBar.overflow.ariaLabel": "Vis flere handlinger",
    "statusBar.overflow.close": "Lukk meny",
    "chatPlan.dismiss": "Skjul",
    "chatPlan.dismiss.ariaLabel": "Skjul planpanel",
  },
  da: {
    "settings.saveSuccess": "Indstillinger gemt. Genopretter forbindelse…",
    "settings.speech.subsection.provider": "Udbyder",
    "settings.speech.subsection.asr": "Talegenkendelse",
    "settings.speech.subsection.tts": "Taleoutput",
    "settings.speech.subsection.tests": "Tests og API",
    "statusBar.overflow.title": "Flere handlinger",
    "statusBar.overflow.ariaLabel": "Vis flere handlinger",
    "statusBar.overflow.close": "Luk menu",
    "chatPlan.dismiss": "Skjul",
    "chatPlan.dismiss.ariaLabel": "Skjul planpanel",
  },
  el: {
    "settings.saveSuccess": "Οι ρυθμίσεις αποθηκεύτηκαν. Επανασύνδεση…",
    "settings.speech.subsection.provider": "Πάροχος",
    "settings.speech.subsection.asr": "Αναγνώριση ομιλίας",
    "settings.speech.subsection.tts": "Φωνητική έξοδος",
    "settings.speech.subsection.tests": "Δοκιμές και API",
    "statusBar.overflow.title": "Περισσότερες ενέργειες",
    "statusBar.overflow.ariaLabel": "Εμφάνιση περισσότερων ενεργειών",
    "statusBar.overflow.close": "Κλείσιμο μενού",
    "chatPlan.dismiss": "Απόκρυψη",
    "chatPlan.dismiss.ariaLabel": "Απόκρυψη πίνακα σχεδίου",
  },
  hi: {
    "settings.saveSuccess": "सेटिंग्स सहेजी गईं। पुनः कनेक्ट हो रहा है…",
    "settings.speech.subsection.provider": "प्रदाता",
    "settings.speech.subsection.asr": "वाक् पहचान",
    "settings.speech.subsection.tts": "वाक् आउटपुट",
    "settings.speech.subsection.tests": "परीक्षण और API",
    "statusBar.overflow.title": "और क्रियाएँ",
    "statusBar.overflow.ariaLabel": "और क्रियाएँ दिखाएँ",
    "statusBar.overflow.close": "मेनू बंद करें",
    "chatPlan.dismiss": "छिपाएँ",
    "chatPlan.dismiss.ariaLabel": "योजना पैनल छिपाएँ",
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
