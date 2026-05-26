import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { applyTheme } from "./lib/services/theme";
import { DEFAULT_SETTINGS } from "./lib/types/protocol";

applyTheme(DEFAULT_SETTINGS.theme);

const target = document.getElementById("app");

if (target) {
  mount(App, { target });
}
