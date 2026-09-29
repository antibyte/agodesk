import type { AppLocale } from "./locales";
import type { Messages } from "./types";
import de from "./messages/de.json";
import en from "./messages/en.json";

const fallback: Messages = { ...de, ...en };
const loaders = {
  fr: () => import("./messages/fr.json"),
  es: () => import("./messages/es.json"),
  zh: () => import("./messages/zh.json"),
  ja: () => import("./messages/ja.json"),
  nl: () => import("./messages/nl.json"),
  pt: () => import("./messages/pt.json"),
  pl: () => import("./messages/pl.json"),
  cs: () => import("./messages/cs.json"),
  it: () => import("./messages/it.json"),
  sv: () => import("./messages/sv.json"),
  no: () => import("./messages/no.json"),
  da: () => import("./messages/da.json"),
  el: () => import("./messages/el.json"),
  hi: () => import("./messages/hi.json"),
};
const cache = new Map<AppLocale, Promise<Messages>>();

export function loadMessages(locale: AppLocale): Promise<Messages> {
  if (locale === "de") return Promise.resolve({ ...fallback, ...de });
  if (locale === "en") return Promise.resolve(fallback);
  let pending = cache.get(locale);
  if (!pending) {
    pending = loaders[locale]().then((module) => ({ ...fallback, ...module.default }));
    cache.set(locale, pending);
    void pending.catch(() => cache.delete(locale));
  }
  return pending;
}

export function getDeMessages(): Messages {
  return de;
}
export function getEnMessages(): Messages {
  return fallback;
}
