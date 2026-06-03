import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { loadSettings } from "./lib/services/settings";

const target = document.getElementById("app");

if (target) {
  void loadSettings().then(() => {
    mount(App, { target });
  });
}
