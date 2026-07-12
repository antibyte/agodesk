import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "../src/lib/i18n/messages");
const locales = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

const translations = {
  en: {
    captureUnavailable:
      "This shortcut is already used by the system or another app. Please choose a different one.",
    checkingAvailability: "Checking whether this shortcut is available…",
  },
  de: {
    captureUnavailable:
      "Diese Tastenkombination ist bereits vom System oder einer anderen App belegt. Bitte wähle eine andere.",
    checkingAvailability: "Prüfe, ob diese Tastenkombination verfügbar ist…",
  },
  fr: {
    captureUnavailable:
      "Ce raccourci est déjà utilisé par le système ou une autre application. Veuillez en choisir un autre.",
    checkingAvailability: "Vérification de la disponibilité de ce raccourci…",
  },
  es: {
    captureUnavailable:
      "Este atajo ya lo usa el sistema u otra aplicación. Elige otro distinto.",
    checkingAvailability: "Comprobando si este atajo está disponible…",
  },
  it: {
    captureUnavailable:
      "Questa scorciatoia è già usata dal sistema o da un'altra app. Scegline un'altra.",
    checkingAvailability: "Verifica se questa scorciatoia è disponibile…",
  },
  nl: {
    captureUnavailable:
      "Deze sneltoets wordt al gebruikt door het systeem of een andere app. Kies een andere.",
    checkingAvailability: "Controleren of deze sneltoets beschikbaar is…",
  },
  pl: {
    captureUnavailable:
      "Ten skrót jest już używany przez system lub inną aplikację. Wybierz inny.",
    checkingAvailability: "Sprawdzanie, czy ten skrót jest dostępny…",
  },
  pt: {
    captureUnavailable:
      "Este atalho já é usado pelo sistema ou por outra app. Escolha outro.",
    checkingAvailability: "A verificar se este atalho está disponível…",
  },
  cs: {
    captureUnavailable:
      "Tato zkratka je již používána systémem nebo jinou aplikací. Zvolte jinou.",
    checkingAvailability: "Kontrola, zda je tato zkratka dostupná…",
  },
  da: {
    captureUnavailable:
      "Denne genvej bruges allerede af systemet eller en anden app. Vælg en anden.",
    checkingAvailability: "Tjekker om denne genvej er ledig…",
  },
  sv: {
    captureUnavailable:
      "Denna genväg används redan av systemet eller en annan app. Välj en annan.",
    checkingAvailability: "Kontrollerar om genvägen är ledig…",
  },
  no: {
    captureUnavailable:
      "Denne snarveien brukes allerede av systemet eller en annen app. Velg en annen.",
    checkingAvailability: "Sjekker om snarveien er ledig…",
  },
  el: {
    captureUnavailable:
      "Αυτή η συντόμευση χρησιμοποιείται ήδη από το σύστημα ή άλλη εφαρμογή. Επιλέξτε άλλη.",
    checkingAvailability: "Έλεγχος διαθεσιμότητας συντόμευσης…",
  },
  ja: {
    captureUnavailable:
      "このショートカットはシステムまたは他のアプリで既に使用されています。別のものを選んでください。",
    checkingAvailability: "このショートカットが利用可能か確認しています…",
  },
  zh: {
    captureUnavailable: "此快捷键已被系统或其他应用占用。请选择其他组合。",
    checkingAvailability: "正在检查此快捷键是否可用…",
  },
  hi: {
    captureUnavailable:
      "यह शॉर्टकट पहले से सिस्टम या किसी अन्य ऐप द्वारा उपयोग में है। कृपया कोई और चुनें।",
    checkingAvailability: "जाँच रहा है कि यह शॉर्टकट उपलब्ध है…",
  },
};

const prefixes = [
  "settings.appearance.showWindowHotkey",
  "settings.speech.hotkey",
];

/**
 * Insert new keys immediately after an anchor key, preserving existing order.
 */
function insertAfter(data, anchorKey, entries) {
  if (!(anchorKey in data)) {
    for (const [k, v] of entries) {
      data[k] = v;
    }
    return data;
  }
  const next = {};
  for (const [k, v] of Object.entries(data)) {
    next[k] = v;
    if (k === anchorKey) {
      for (const [nk, nv] of entries) {
        next[nk] = nv;
      }
    }
  }
  // If keys already existed earlier, overwrite was done above only at insert point;
  // remove accidental duplicates by rebuilding without prior copies of new keys.
  const newKeySet = new Set(entries.map(([k]) => k));
  const cleaned = {};
  for (const [k, v] of Object.entries(next)) {
    if (newKeySet.has(k) && cleaned[k] !== undefined) {
      continue;
    }
    cleaned[k] = v;
  }
  // Ensure final values for new keys
  for (const [k, v] of entries) {
    cleaned[k] = v;
  }
  return cleaned;
}

for (const locale of locales) {
  const filePath = path.join(dir, `${locale}.json`);
  let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const t = translations[locale] ?? translations.en;

  for (const prefix of prefixes) {
    data = insertAfter(data, `${prefix}.captureInvalid`, [
      [`${prefix}.captureUnavailable`, t.captureUnavailable],
      [`${prefix}.checkingAvailability`, t.checkingAvailability],
    ]);
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log("ok", locale);
}
