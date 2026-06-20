<script lang="ts">
  import { onMount } from "svelte";
  import ChatView from "./lib/components/ChatView.svelte";
  import UiSoundBridge from "./lib/components/UiSoundBridge.svelte";
  import OpenPetsBridge from "./lib/components/OpenPetsBridge.svelte";
  import ToastContainer from "./lib/components/ToastContainer.svelte";

  onMount(() => {
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      void getCurrentWindow().setShadow(false);
    });
  });
</script>

<div class="app-window">
  <UiSoundBridge />
  <OpenPetsBridge />
  <ToastContainer />
  <ChatView />
</div>

<style>
  .app-window {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border-radius: var(--radius-window);
    clip-path: inset(0 round var(--radius-window));
    isolation: isolate;
    border: 1px solid var(--glass-border);
    background:
      radial-gradient(
        ellipse 720px 420px at 50% -120px,
        color-mix(in srgb, var(--color-accent) 16%, transparent),
        transparent 72%
      ),
      radial-gradient(
        ellipse 480px 360px at 105% 92%,
        color-mix(in srgb, var(--color-accent) 7%, transparent),
        transparent 68%
      ),
      radial-gradient(
        ellipse 520px 380px at -8% 42%,
        color-mix(in srgb, var(--color-accent) 5%, transparent),
        transparent 70%
      ),
      var(--color-bg);
    color: var(--color-text);
    transition: background var(--transition-base);
  }

  .app-window::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    border-radius: inherit;
    opacity: 0.045;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  .app-window > :global(.app-shell) {
    position: relative;
    flex: 1;
    min-height: 0;
    z-index: 1;
  }
</style>
