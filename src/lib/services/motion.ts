import { get } from "svelte/store";
import { settings } from "../stores/settings";

export function applyReduceMotionSetting(enabled: boolean): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.setAttribute("data-reduce-motion", enabled ? "true" : "false");
}

export function initMotionSettingsSync(): () => void {
  applyReduceMotionSetting(get(settings).reduceMotion);
  return settings.subscribe((next) => {
    applyReduceMotionSetting(next.reduceMotion);
  });
}
