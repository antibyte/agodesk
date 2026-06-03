import type { AppLocale } from "./locales";
import { localeToBcp47 } from "./locales";
import { getActiveMessages } from "./store";
import { tStatic } from "./translate";
import type { MessageKey } from "./types";

export function formatDayLabel(
  timestamp: string,
  locale: AppLocale,
  now = new Date(),
): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const startOfDay = (value: Date): Date =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate());

  const dayMs = 86_400_000;
  const diffDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / dayMs,
  );

  const msgs = getActiveMessages();

  if (diffDays === 0) {
    return tStatic(msgs, "chatFormat.day.today");
  }
  if (diffDays === 1) {
    return tStatic(msgs, "chatFormat.day.yesterday");
  }

  const bcp47 = localeToBcp47(locale);
  return date.toLocaleDateString(bcp47, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function formatMessageTime(timestamp: string, locale: AppLocale): string {
  return new Date(timestamp).toLocaleTimeString(localeToBcp47(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type SystemMessageTone = "info" | "success" | "error";

export function systemMessageTone(
  text: string,
  explicitTone?: SystemMessageTone,
): SystemMessageTone {
  if (explicitTone) {
    return explicitTone;
  }

  const lower = text.toLowerCase();
  if (
    lower.includes("freigegeben") ||
    lower.includes("granted") ||
    lower.includes("erfolg") ||
    lower.includes("success") ||
    lower.includes("verbunden") ||
    lower.includes("connected")
  ) {
    return "success";
  }
  if (
    lower.includes("fehler") ||
    lower.includes("error") ||
    lower.includes("abgelehnt") ||
    lower.includes("denied") ||
    lower.includes("unterbrochen") ||
    lower.includes("interrupted") ||
    lower.includes("nicht gesendet") ||
    lower.includes("could not") ||
    lower.includes("failed")
  ) {
    return "error";
  }
  return "info";
}

export function toneFromMessageKey(key: MessageKey): SystemMessageTone {
  const keyStr = String(key);
  if (keyStr.includes(".error.") || keyStr.endsWith(".error")) {
    return "error";
  }
  if (
    keyStr.includes("approved") ||
    keyStr.includes("success") ||
    keyStr.includes("connected")
  ) {
    return "success";
  }
  return "info";
}
