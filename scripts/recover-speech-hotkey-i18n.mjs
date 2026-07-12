import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.resolve(__dirname, "../src/lib/i18n/messages");
const sessionsRoot =
  "C:/Users/andre/.grok/sessions/C%3A%5CUsers%5Candre%5CDocuments%5Crepo%5Cagodesk";

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && (e.name.endsWith(".jsonl") || e.name.endsWith(".md"))) out.push(p);
  }
  return out;
}

const re =
  /settings\.speech\.hotkey\.[a-zA-Z]+["']?\s*:\s*["']((?:\\.|[^"'\\])*)["']/g;

const byKey = new Map();
for (const f of walk(sessionsRoot)) {
  let text;
  try {
    text = fs.readFileSync(f, "utf8");
  } catch {
    continue;
  }
  // Unescape common JSONL escape layers
  const candidates = [text, text.replace(/\\"/g, '"').replace(/\\\\/g, "\\")];
  for (const t of candidates) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t))) {
      const full = m[0];
      const keyMatch = full.match(/settings\.speech\.hotkey\.[a-zA-Z]+/);
      if (!keyMatch) continue;
      const key = keyMatch[0];
      let value = m[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
      if (!byKey.has(key)) byKey.set(key, new Set());
      byKey.get(key).add(value);
    }
  }
}

console.log("Recovered keys from sessions:");
for (const [k, vals] of [...byKey.entries()].sort()) {
  console.log(k, "=>", [...vals].map((v) => v.slice(0, 80)));
}

// Rebuild speech.hotkey block for all locales by cloning showWindowHotkey + known speech-specific strings.
const speechSpecific = {
  en: {
    title: "Speech-to-text hotkey",
    help: "Global shortcut to start and stop speech recognition. Default: Alt + Shift + M.",
    conflictWarning:
      "This shortcut is the same as the show-window hotkey. Please choose a different one.",
    invalidWarning: "Invalid format. Example: Alt+Shift+M",
    captureInvalid:
      "Invalid combination — use at least one modifier plus a letter, number, or function key.",
    error: "Could not register the speech-to-text hotkey (it may already be used by another app).",
  },
  de: {
    title: "Speech-to-Text-Hotkey",
    help: "Globaler Tastenkürzel zum Starten und Stoppen der Spracherkennung. Standard: Alt + Shift + M.",
    conflictWarning:
      "Diese Tastenkombination ist identisch mit dem Fenster-Hotkey. Bitte wähle eine andere.",
    invalidWarning: "Ungültiges Format. Beispiel: Alt+Shift+M",
    captureInvalid:
      "Ungültige Kombination — bitte mindestens eine Umschalttaste plus Buchstabe/Zahl/F-Taste.",
    error:
      "Der Speech-to-Text-Hotkey konnte nicht registriert werden (evtl. bereits von einer anderen App belegt).",
  },
  fr: {
    title: "Raccourci speech-to-text",
    help: "Raccourci global pour démarrer et arrêter la reconnaissance vocale. Défaut : Alt + Shift + M.",
    conflictWarning:
      "Ce raccourci est identique au raccourci d'affichage de la fenêtre. Veuillez en choisir un autre.",
    invalidWarning: "Format invalide. Exemple : Alt+Shift+M",
    captureInvalid:
      "Combinaison invalide — utilisez au moins un modificateur plus une lettre, un chiffre ou une touche de fonction.",
    error:
      "Impossible d'enregistrer le raccourci speech-to-text (il est peut-être déjà utilisé par une autre application).",
  },
  es: {
    title: "Atajo de speech-to-text",
    help: "Atajo global para iniciar y detener el reconocimiento de voz. Predeterminado: Alt + Shift + M.",
    conflictWarning:
      "Este atajo es el mismo que el de mostrar ventana. Elige otro distinto.",
    invalidWarning: "Formato no válido. Ejemplo: Alt+Shift+M",
    captureInvalid:
      "Combinación no válida: usa al menos un modificador más una letra, número o tecla de función.",
    error:
      "No se pudo registrar el atajo de speech-to-text (puede estar en uso por otra app).",
  },
  it: {
    title: "Scorciatoia speech-to-text",
    help: "Scorciatoia globale per avviare e arrestare il riconoscimento vocale. Predefinito: Alt + Shift + M.",
    conflictWarning:
      "Questa scorciatoia è uguale a quella per mostrare la finestra. Scegline un'altra.",
    invalidWarning: "Formato non valido. Esempio: Alt+Shift+M",
    captureInvalid:
      "Combinazione non valida: usa almeno un modificatore più una lettera, un numero o un tasto funzione.",
    error:
      "Impossibile registrare la scorciatoia speech-to-text (potrebbe essere già usata da un'altra app).",
  },
  nl: {
    title: "Speech-to-text-sneltoets",
    help: "Globale sneltoets om spraakherkenning te starten en te stoppen. Standaard: Alt + Shift + M.",
    conflictWarning:
      "Deze sneltoets is hetzelfde als de venster-sneltoets. Kies een andere.",
    invalidWarning: "Ongeldig formaat. Voorbeeld: Alt+Shift+M",
    captureInvalid:
      "Ongeldige combinatie — gebruik minstens één modifier plus een letter, cijfer of functietoets.",
    error:
      "Speech-to-text-sneltoets kon niet worden geregistreerd (mogelijk al in gebruik door een andere app).",
  },
  pl: {
    title: "Skrót speech-to-text",
    help: "Globalny skrót do uruchamiania i zatrzymywania rozpoznawania mowy. Domyślnie: Alt + Shift + M.",
    conflictWarning:
      "Ten skrót jest taki sam jak skrót pokazywania okna. Wybierz inny.",
    invalidWarning: "Nieprawidłowy format. Przykład: Alt+Shift+M",
    captureInvalid:
      "Nieprawidłowa kombinacja — użyj co najmniej jednego modyfikatora oraz litery, cyfry lub klawisza funkcyjnego.",
    error:
      "Nie udało się zarejestrować skrótu speech-to-text (może być już używany przez inną aplikację).",
  },
  pt: {
    title: "Atalho speech-to-text",
    help: "Atalho global para iniciar e parar o reconhecimento de voz. Predefinição: Alt + Shift + M.",
    conflictWarning:
      "Este atalho é o mesmo que o de mostrar janela. Escolha outro.",
    invalidWarning: "Formato inválido. Exemplo: Alt+Shift+M",
    captureInvalid:
      "Combinação inválida — use pelo menos um modificador mais uma letra, número ou tecla de função.",
    error:
      "Não foi possível registar o atalho speech-to-text (pode já estar em uso por outra app).",
  },
  cs: {
    title: "Zkratka speech-to-text",
    help: "Globální zkratka pro spuštění a zastavení rozpoznávání řeči. Výchozí: Alt + Shift + M.",
    conflictWarning:
      "Tato zkratka je stejná jako zkratka pro zobrazení okna. Zvolte jinou.",
    invalidWarning: "Neplatný formát. Příklad: Alt+Shift+M",
    captureInvalid:
      "Neplatná kombinace — použijte alespoň jeden modifikátor plus písmeno, číslo nebo funkční klávesu.",
    error:
      "Klávesovou zkratku speech-to-text se nepodařilo zaregistrovat (možná již používá jiná aplikace).",
  },
  da: {
    title: "Speech-to-text-genvej",
    help: "Global genvej til at starte og stoppe talegenkendelse. Standard: Alt + Shift + M.",
    conflictWarning:
      "Denne genvej er identisk med vindue-genvejen. Vælg en anden.",
    invalidWarning: "Ugyldigt format. Eksempel: Alt+Shift+M",
    captureInvalid:
      "Ugyldig kombination — brug mindst én modifier plus et bogstav, tal eller funktionstast.",
    error:
      "Speech-to-text-genvej kunne ikke registreres (måske allerede i brug af en anden app).",
  },
  sv: {
    title: "Speech-to-text-genväg",
    help: "Global genväg för att starta och stoppa taligenkänning. Standard: Alt + Shift + M.",
    conflictWarning:
      "Denna genväg är densamma som fönster-genvägen. Välj en annan.",
    invalidWarning: "Ogiltigt format. Exempel: Alt+Shift+M",
    captureInvalid:
      "Ogiltig kombination — använd minst en modifierare plus en bokstav, siffra eller funktionstangent.",
    error:
      "Speech-to-text-genväg kunde inte registreras (kan redan användas av en annan app).",
  },
  no: {
    title: "Speech-to-text-snarvei",
    help: "Global snarvei for å starte og stoppe talegjenkjenning. Standard: Alt + Shift + M.",
    conflictWarning:
      "Denne snarveien er den samme som vindu-snarveien. Velg en annen.",
    invalidWarning: "Ugyldig format. Eksempel: Alt+Shift+M",
    captureInvalid:
      "Ugyldig kombinasjon — bruk minst én modifier pluss en bokstav, et tall eller en funksjonstast.",
    error:
      "Speech-to-text-snarvei kunne ikke registreres (kan allerede være i bruk av en annen app).",
  },
  el: {
    title: "Συντόμευση speech-to-text",
    help: "Καθολική συντόμευση για έναρξη και διακοπή αναγνώρισης ομιλίας. Προεπιλογή: Alt + Shift + M.",
    conflictWarning:
      "Αυτή η συντόμευση είναι ίδια με τη συντόμευση εμφάνισης παραθύρου. Επιλέξτε άλλη.",
    invalidWarning: "Μη έγκυρη μορφή. Παράδειγμα: Alt+Shift+M",
    captureInvalid:
      "Μη έγκυρος συνδυασμός — χρησιμοποιήστε τουλάχιστον έναν τροποποιητή και γράμμα, αριθμό ή πλήκτρο λειτουργίας.",
    error:
      "Δεν ήταν δυνατή η καταχώριση συντόμευσης speech-to-text (μπορεί να χρησιμοποιείται ήδη από άλλη εφαρμογή).",
  },
  ja: {
    title: "音声入力ホットキー",
    help: "音声認識の開始と停止用のグローバルショートカット。既定: Alt + Shift + M。",
    conflictWarning: "このショートカットはウィンドウ表示ホットキーと同じです。別のものを選んでください。",
    invalidWarning: "形式が無効です。例: Alt+Shift+M",
    captureInvalid:
      "無効な組み合わせです。修飾キーと文字・数字・ファンクションキーを組み合わせてください。",
    error: "音声入力ホットキーを登録できませんでした（他のアプリが使用中の可能性があります）。",
  },
  zh: {
    title: "语音转文字快捷键",
    help: "用于开始和停止语音识别的全局快捷键。默认：Alt + Shift + M。",
    conflictWarning: "此快捷键与显示窗口快捷键相同。请选择其他组合。",
    invalidWarning: "格式无效。示例：Alt+Shift+M",
    captureInvalid: "无效组合 — 请至少使用一个修饰键加上字母、数字或功能键。",
    error: "无法注册语音转文字快捷键（可能已被其他应用占用）。",
  },
  hi: {
    title: "स्पीच-टू-टेक्स्ट शॉर्टकट",
    help: "स्पीच पहचान शुरू/रोकने के लिए वैश्विक शॉर्टकट। डिफ़ॉल्ट: Alt + Shift + M।",
    conflictWarning: "यह शॉर्टकट विंडो दिखाने वाले शॉर्टकट के समान है। कृपया कोई और चुनें।",
    invalidWarning: "अमान्य प्रारूप। उदाहरण: Alt+Shift+M",
    captureInvalid:
      "अमान्य संयोजन — कम से कम एक संशोधक तथा अक्षर, संख्या या फ़ंक्शन कुंजी का उपयोग करें।",
    error: "स्पीच-टू-टेक्स्ट शॉर्टकट पंजीकृत नहीं हो सकी (शायद अन्य ऐप द्वारा उपयोग में)।",
  },
};

const sharedFromShowWindow = [
  "disable",
  "disabled",
  "record",
  "recording",
  "recordingHelp",
  "reservedWarning",
  "reset",
];

for (const file of fs.readdirSync(messagesDir).filter((f) => f.endsWith(".json"))) {
  const locale = file.replace(/\.json$/, "");
  const filePath = path.join(messagesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const specific = speechSpecific[locale] ?? speechSpecific.en;

  // Shared action labels from show-window hotkey strings where present.
  for (const suffix of sharedFromShowWindow) {
    const src = data[`settings.appearance.showWindowHotkey.${suffix}`];
    if (src) {
      data[`settings.speech.hotkey.${suffix}`] = src;
    }
  }

  data["settings.speech.hotkey.title"] = specific.title;
  data["settings.speech.hotkey.help"] = specific.help;
  data["settings.speech.hotkey.conflictWarning"] = specific.conflictWarning;
  data["settings.speech.hotkey.invalidWarning"] = specific.invalidWarning;
  data["settings.speech.hotkey.captureInvalid"] = specific.captureInvalid;
  data["chatView.error.speechHotkey"] = specific.error;

  // Keep probe keys if already present.
  if (!data["settings.speech.hotkey.captureUnavailable"]) {
    data["settings.speech.hotkey.captureUnavailable"] =
      data["settings.appearance.showWindowHotkey.captureUnavailable"] ??
      speechSpecific.en.captureInvalid;
  }
  if (!data["settings.speech.hotkey.checkingAvailability"]) {
    data["settings.speech.hotkey.checkingAvailability"] =
      data["settings.appearance.showWindowHotkey.checkingAvailability"] ??
      "Checking…";
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log("restored", locale);
}
