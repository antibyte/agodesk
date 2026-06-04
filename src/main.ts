import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { initLocale } from "./lib/i18n/store";
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
    mount(App, { target });
  })();
}
