import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(__dirname, "..", "src", "lib", "i18n", "messages");

const KEY = "settings.llmProviders.editor.requiredFieldsMissing";

const translations = {
  de: "Bitte Name und Provider-Typ ausfüllen, bevor gespeichert wird.",
  en: "Please fill in the name and provider type before saving.",
  ja: "保存する前に名前とプロバイダーの種類を入力してください。",
  zh: "保存前请填写名称和提供商类型。",
  hi: "सहेजने से पहले कृपया नाम और प्रदाता प्रकार भरें।",
  el: "Συμπληρώστε το όνομα και τον τύπο παρόχου πριν την αποθήκευση.",
  da: "Udfyld venligst navn og udbydertype, før du gemmer.",
  no: "Vennligst fyll ut navn og leverandørtype før du lagrer.",
  sv: "Fyll i namn och leverantörstyp innan du sparar.",
  cs: "Před uložením vyplňte prosím název a typ poskytovatele.",
  pl: "Przed zapisaniem wypełnij nazwę i typ dostawcy.",
  pt: "Preencha o nome e o tipo de provedor antes de salvar.",
  nl: "Vul de naam en het providertype in voordat u opslaat.",
  it: "Inserisci il nome e il tipo di provider prima di salvare.",
  es: "Completa el nombre y el tipo de proveedor antes de guardar.",
  fr: "Veuillez renseigner le nom et le type de fournisseur avant d'enregistrer.",
};

const anchorKey = "settings.llmProviders.editor.saveAndAuthorize";

for (const [locale, value] of Object.entries(translations)) {
  const filePath = join(messagesDir, `${locale}.json`);
  const raw = readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  if (Object.prototype.hasOwnProperty.call(data, KEY)) {
    continue;
  }
  const ordered = {};
  let inserted = false;
  for (const [k, v] of Object.entries(data)) {
    if (!inserted && k > anchorKey) {
      ordered[KEY] = value;
      inserted = true;
    }
    ordered[k] = v;
  }
  if (!inserted) {
    ordered[KEY] = value;
  }
  writeFileSync(filePath, JSON.stringify(ordered, null, 2) + "\n", "utf8");
  console.log(`patched ${locale}.json`);
}
