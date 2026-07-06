import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import "./themes.css";
import { initLocale } from "./lib/i18n/store";
import { initCompanionStateSync } from "./lib/services/companion-state";
import { initMotionSettingsSync } from "./lib/services/motion";
import { loadSettings } from "./lib/services/settings";

const target = document.getElementById("app");

if (target) {
  void (async () => {
    await initLocale("system");
    try {
      await loadSettings();
    } catch {
      // loadSettings wendet bei Fehlern intern DEFAULT_SETTINGS an.
    }
    const stopCompanionStateSync = initCompanionStateSync();
    const stopMotionSettingsSync = initMotionSettingsSync();
    mount(App, { target });
    return () => {
      stopCompanionStateSync();
      stopMotionSettingsSync();
    };
  })();
}
