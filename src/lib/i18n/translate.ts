import type { Messages } from "./types";
import type { MessageKey } from "./types";

export type TranslateParams = Record<string, string | number>;

export function translate(
  messages: Messages,
  key: MessageKey,
  params?: TranslateParams,
): string {
  let text = messages[key];

  if (text === undefined) {
    if (import.meta.env?.DEV) {
      console.warn(`[i18n missing: ${String(key)}]`);
    }
    return String(key);
  }

  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }

  return text;
}

/** Non-reactive translate for services/tests. */
export function tStatic(
  messages: Messages,
  key: MessageKey,
  params?: TranslateParams,
): string {
  return translate(messages, key, params);
}
