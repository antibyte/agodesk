<script lang="ts">
  import { onMount } from "svelte";
  import ChatView from "./lib/components/ChatView.svelte";
  import UiSoundBridge from "./lib/components/UiSoundBridge.svelte";

  onMount(() => {
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      void getCurrentWindow().setShadow(false);
    });
  });
</script>

<div class="app-window">
  <UiSoundBridge />
  <ChatView />
</div>

<style>
  .app-window {
    height: 100vh;
    overflow: hidden;
    border-radius: var(--radius-window);
    clip-path: inset(0 round var(--radius-window));
    isolation: isolate;
    border: 1px solid var(--glass-border);
    background:
      radial-gradient(
        circle 600px at 50% -150px,
        color-mix(in srgb, var(--color-accent) 14%, transparent),
        transparent 80%
      ),
      radial-gradient(
        circle 400px at 100% 100%,
        color-mix(in srgb, var(--color-danger) 6%, transparent),
        transparent 80%
      ),
      radial-gradient(
        circle 500px at -10% 50%,
        color-mix(in srgb, var(--color-accent) 6%, transparent),
        transparent 75%
      ),
      var(--color-bg);
    color: var(--color-text);
    transition: background var(--transition-base);
  }
</style>
