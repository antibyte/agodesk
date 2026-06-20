#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../src/lib/i18n/messages");

const patch = {
  fr: {
    "settings.about.checkForUpdates": "Rechercher des mises à jour",
    "settings.about.checkingForUpdates": "Recherche de mises à jour…",
    "update.banner.title": "Mise à jour disponible",
    "update.banner.description":
      "La version {version} est disponible. Installez maintenant pour rester à jour.",
    "update.banner.install": "Installer maintenant",
    "update.banner.installing": "Installation de la mise à jour…",
    "update.banner.later": "Plus tard",
    "update.banner.progress": "{percent} % téléchargé",
    "update.toast.upToDate": "agodesk est déjà à jour.",
    "update.toast.failed": "Échec de la vérification des mises à jour.",
    "update.toast.installed": "Mise à jour installée. Redémarrage de l’application…",
  },
  es: {
    "settings.about.checkForUpdates": "Buscar actualizaciones",
    "settings.about.checkingForUpdates": "Buscando actualizaciones…",
    "update.banner.title": "Actualización disponible",
    "update.banner.description":
      "La versión {version} está disponible. Instala ahora para mantenerte al día.",
    "update.banner.install": "Instalar ahora",
    "update.banner.installing": "Instalando actualización…",
    "update.banner.later": "Más tarde",
    "update.banner.progress": "{percent} % descargado",
    "update.toast.upToDate": "agodesk ya está actualizado.",
    "update.toast.failed": "Error al comprobar actualizaciones.",
    "update.toast.installed": "Actualización instalada. Reiniciando la aplicación…",
  },
  it: {
    "settings.about.checkForUpdates": "Cerca aggiornamenti",
    "settings.about.checkingForUpdates": "Ricerca aggiornamenti…",
    "update.banner.title": "Aggiornamento disponibile",
    "update.banner.description":
      "La versione {version} è disponibile. Installa ora per restare aggiornato.",
    "update.banner.install": "Installa ora",
    "update.banner.installing": "Installazione aggiornamento…",
    "update.banner.later": "Più tardi",
    "update.banner.progress": "{percent}% scaricato",
    "update.toast.upToDate": "agodesk è già aggiornato.",
    "update.toast.failed": "Controllo aggiornamenti non riuscito.",
    "update.toast.installed": "Aggiornamento installato. Riavvio dell’app…",
  },
  pt: {
    "settings.about.checkForUpdates": "Verificar atualizações",
    "settings.about.checkingForUpdates": "A procurar atualizações…",
    "update.banner.title": "Atualização disponível",
    "update.banner.description":
      "A versão {version} está disponível. Instale agora para se manter atualizado.",
    "update.banner.install": "Instalar agora",
    "update.banner.installing": "A instalar atualização…",
    "update.banner.later": "Mais tarde",
    "update.banner.progress": "{percent}% transferido",
    "update.toast.upToDate": "O agodesk já está atualizado.",
    "update.toast.failed": "Falha ao verificar atualizações.",
    "update.toast.installed": "Atualização instalada. A reiniciar a aplicação…",
  },
  nl: {
    "settings.about.checkForUpdates": "Controleren op updates",
    "settings.about.checkingForUpdates": "Updates zoeken…",
    "update.banner.title": "Update beschikbaar",
    "update.banner.description":
      "Versie {version} is beschikbaar. Installeer nu om up-to-date te blijven.",
    "update.banner.install": "Nu installeren",
    "update.banner.installing": "Update installeren…",
    "update.banner.later": "Later",
    "update.banner.progress": "{percent}% gedownload",
    "update.toast.upToDate": "agodesk is al up-to-date.",
    "update.toast.failed": "Updatecontrole mislukt.",
    "update.toast.installed": "Update geïnstalleerd. App wordt opnieuw gestart…",
  },
  pl: {
    "settings.about.checkForUpdates": "Sprawdź aktualizacje",
    "settings.about.checkingForUpdates": "Wyszukiwanie aktualizacji…",
    "update.banner.title": "Dostępna aktualizacja",
    "update.banner.description":
      "Wersja {version} jest dostępna. Zainstaluj teraz, aby pozostać na bieżąco.",
    "update.banner.install": "Zainstaluj teraz",
    "update.banner.installing": "Instalowanie aktualizacji…",
    "update.banner.later": "Później",
    "update.banner.progress": "Pobrano {percent}%",
    "update.toast.upToDate": "agodesk jest już aktualny.",
    "update.toast.failed": "Sprawdzenie aktualizacji nie powiodło się.",
    "update.toast.installed": "Aktualizacja zainstalowana. Ponowne uruchamianie aplikacji…",
  },
  cs: {
    "settings.about.checkForUpdates": "Zkontrolovat aktualizace",
    "settings.about.checkingForUpdates": "Hledání aktualizací…",
    "update.banner.title": "Dostupná aktualizace",
    "update.banner.description":
      "Verze {version} je k dispozici. Nainstalujte nyní, abyste zůstali aktuální.",
    "update.banner.install": "Nainstalovat nyní",
    "update.banner.installing": "Instalace aktualizace…",
    "update.banner.later": "Později",
    "update.banner.progress": "Staženo {percent} %",
    "update.toast.upToDate": "agodesk je již aktuální.",
    "update.toast.failed": "Kontrola aktualizací selhala.",
    "update.toast.installed": "Aktualizace nainstalována. Restartování aplikace…",
  },
  sv: {
    "settings.about.checkForUpdates": "Sök efter uppdateringar",
    "settings.about.checkingForUpdates": "Söker efter uppdateringar…",
    "update.banner.title": "Uppdatering tillgänglig",
    "update.banner.description":
      "Version {version} är tillgänglig. Installera nu för att hålla dig uppdaterad.",
    "update.banner.install": "Installera nu",
    "update.banner.installing": "Installerar uppdatering…",
    "update.banner.later": "Senare",
    "update.banner.progress": "{percent} % nedladdat",
    "update.toast.upToDate": "agodesk är redan uppdaterad.",
    "update.toast.failed": "Uppdateringskontroll misslyckades.",
    "update.toast.installed": "Uppdatering installerad. Startar om appen…",
  },
  no: {
    "settings.about.checkForUpdates": "Se etter oppdateringer",
    "settings.about.checkingForUpdates": "Søker etter oppdateringer…",
    "update.banner.title": "Oppdatering tilgjengelig",
    "update.banner.description":
      "Versjon {version} er tilgjengelig. Installer nå for å holde deg oppdatert.",
    "update.banner.install": "Installer nå",
    "update.banner.installing": "Installerer oppdatering…",
    "update.banner.later": "Senere",
    "update.banner.progress": "{percent} % lastet ned",
    "update.toast.upToDate": "agodesk er allerede oppdatert.",
    "update.toast.failed": "Oppdateringssjekk mislyktes.",
    "update.toast.installed": "Oppdatering installert. Starter appen på nytt…",
  },
  da: {
    "settings.about.checkForUpdates": "Søg efter opdateringer",
    "settings.about.checkingForUpdates": "Søger efter opdateringer…",
    "update.banner.title": "Opdatering tilgængelig",
    "update.banner.description":
      "Version {version} er tilgængelig. Installer nu for at holde dig opdateret.",
    "update.banner.install": "Installer nu",
    "update.banner.installing": "Installerer opdatering…",
    "update.banner.later": "Senere",
    "update.banner.progress": "{percent} % downloadet",
    "update.toast.upToDate": "agodesk er allerede opdateret.",
    "update.toast.failed": "Opdateringstjek mislykkedes.",
    "update.toast.installed": "Opdatering installeret. Genstarter appen…",
  },
  el: {
    "settings.about.checkForUpdates": "Έλεγχος για ενημερώσεις",
    "settings.about.checkingForUpdates": "Αναζήτηση ενημερώσεων…",
    "update.banner.title": "Διαθέσιμη ενημέρωση",
    "update.banner.description":
      "Η έκδοση {version} είναι διαθέσιμη. Εγκαταστήστε τώρα για να μείνετε ενημερωμένοι.",
    "update.banner.install": "Εγκατάσταση τώρα",
    "update.banner.installing": "Εγκατάσταση ενημέρωσης…",
    "update.banner.later": "Αργότερα",
    "update.banner.progress": "{percent}% λήφθηκε",
    "update.toast.upToDate": "Το agodesk είναι ήδη ενημερωμένο.",
    "update.toast.failed": "Ο έλεγχος ενημερώσεων απέτυχε.",
    "update.toast.installed": "Η ενημέρωση εγκαταστάθηκε. Επανεκκίνηση εφαρμογής…",
  },
  hi: {
    "settings.about.checkForUpdates": "अपडेट जांचें",
    "settings.about.checkingForUpdates": "अपडेट खोजे जा रहे हैं…",
    "update.banner.title": "अपडेट उपलब्ध",
    "update.banner.description":
      "संस्करण {version} उपलब्ध है। अप-टू-डेट रहने के लिए अभी इंस्टॉल करें।",
    "update.banner.install": "अभी इंस्टॉल करें",
    "update.banner.installing": "अपडेट इंस्टॉल हो रहा है…",
    "update.banner.later": "बाद में",
    "update.banner.progress": "{percent}% डाउनलोड",
    "update.toast.upToDate": "agodesk पहले से अप-टू-डेट है।",
    "update.toast.failed": "अपडेट जांच विफल।",
    "update.toast.installed": "अपडेट इंस्टॉल हुआ। ऐप पुनः प्रारंभ हो रहा है…",
  },
  ja: {
    "settings.about.checkForUpdates": "アップデートを確認",
    "settings.about.checkingForUpdates": "アップデートを確認中…",
    "update.banner.title": "アップデートがあります",
    "update.banner.description":
      "バージョン {version} が利用可能です。最新の状態を保つために今すぐインストールしてください。",
    "update.banner.install": "今すぐインストール",
    "update.banner.installing": "アップデートをインストール中…",
    "update.banner.later": "後で",
    "update.banner.progress": "{percent}% ダウンロード済み",
    "update.toast.upToDate": "agodesk は最新です。",
    "update.toast.failed": "アップデートの確認に失敗しました。",
    "update.toast.installed": "アップデートをインストールしました。アプリを再起動します…",
  },
  zh: {
    "settings.about.checkForUpdates": "检查更新",
    "settings.about.checkingForUpdates": "正在检查更新…",
    "update.banner.title": "有可用更新",
    "update.banner.description": "版本 {version} 已可用。立即安装以保持最新。",
    "update.banner.install": "立即安装",
    "update.banner.installing": "正在安装更新…",
    "update.banner.later": "稍后",
    "update.banner.progress": "已下载 {percent}%",
    "update.toast.upToDate": "agodesk 已是最新版本。",
    "update.toast.failed": "更新检查失败。",
    "update.toast.installed": "更新已安装。正在重启应用…",
  },
};

function writeJson(filePath, data) {
  const lines = Object.entries(data).map(([key, value]) => `  "${key}": ${JSON.stringify(value)}`);
  fs.writeFileSync(filePath, `{\n${lines.join(",\n")}\n}\n`, "utf8");
}

for (const [locale, translations] of Object.entries(patch)) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  Object.assign(data, translations);
  writeJson(filePath, data);
  console.log(`Patched ${locale}.json`);
}
