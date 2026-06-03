import type { AppLocale } from "./locales";
import type { Messages } from "./types";

import de from "./messages/de.json";
import en from "./messages/en.json";
import fr from "./messages/fr.json";
import es from "./messages/es.json";
import zh from "./messages/zh.json";
import ja from "./messages/ja.json";
import nl from "./messages/nl.json";
import pt from "./messages/pt.json";
import pl from "./messages/pl.json";
import cs from "./messages/cs.json";
import it from "./messages/it.json";
import sv from "./messages/sv.json";
import no from "./messages/no.json";
import da from "./messages/da.json";
import el from "./messages/el.json";
import hi from "./messages/hi.json";

const MESSAGE_CATALOG: Record<AppLocale, Messages> = {
  de: de as Messages,
  en: en as Messages,
  fr: fr as Messages,
  es: es as Messages,
  zh: zh as Messages,
  ja: ja as Messages,
  nl: nl as Messages,
  pt: pt as Messages,
  pl: pl as Messages,
  cs: cs as Messages,
  it: it as Messages,
  sv: sv as Messages,
  no: no as Messages,
  da: da as Messages,
  el: el as Messages,
  hi: hi as Messages,
};

function mergeMessages(locale: AppLocale): Messages {
  return {
    ...(de as Messages),
    ...(en as Messages),
    ...MESSAGE_CATALOG[locale],
  };
}

export function loadMessages(locale: AppLocale): Messages {
  return mergeMessages(locale);
}

export function getDeMessages(): Messages {
  return de as Messages;
}

export function getEnMessages(): Messages {
  return en as Messages;
}
