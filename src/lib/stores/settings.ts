import { writable } from "svelte/store";
import type { AppSettings } from "../types/protocol";
import { DEFAULT_SETTINGS } from "../types/protocol";

export const settings = writable<AppSettings>({ ...DEFAULT_SETTINGS });

export function updateSettings(partial: Partial<AppSettings>): void {
  settings.update((current) => ({ ...current, ...partial }));
}
