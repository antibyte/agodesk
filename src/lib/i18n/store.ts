import { derived, writable, get } from "svelte/store";
import type { UiLocaleSetting } from "./locales";
import { localeToBcp47, normalizeLocaleSetting, resolveLocale } from "./locales";
import { loadMessages } from "./loader";
import type { Messages } from "./types";
import type { MessageKey } from "./types";
import { translate, type TranslateParams } from "./translate";
import { syncTrayLabels } from "../services/tray";

export const localeSetting = writable<UiLocaleSetting>("system");
export const activeLocale = derived(localeSetting, ($setting) => resolveLocale($setting));
export const messages = writable<Messages>(loadMessages(resolveLocale("system")));

export const i18n = derived([activeLocale, messages], ([, msgs]) => {
  return (key: MessageKey, params?: TranslateParams): string => translate(msgs, key, params);
});

export { normalizeLocaleSetting };

export async function initLocale(setting: UiLocaleSetting): Promise<void> {
  const normalized = normalizeLocaleSetting(setting);
  localeSetting.set(normalized);
  const locale = resolveLocale(normalized);
  const msgs = loadMessages(locale);
  messages.set(msgs);
  if (typeof document !== "undefined") {
    document.documentElement.lang = localeToBcp47(locale);
  }
  await syncTrayLabels({
    show: translate(msgs, "tray.show"),
    quit: translate(msgs, "tray.quit"),
    tooltip: translate(msgs, "tray.tooltip"),
  });
}

export async function applyLocaleSetting(setting: UiLocaleSetting): Promise<void> {
  await initLocale(setting);
}

export function getActiveMessages(): Messages {
  return get(messages);
}

export function getTranslateFn(): (key: MessageKey, params?: TranslateParams) => string {
  return get(i18n);
}
