<script lang="ts">
  import ChatView from "./lib/components/ChatView.svelte";
  import UiSoundBridge from "./lib/components/UiSoundBridge.svelte";
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
    background:
      radial-gradient(ellipse 90% 60% at 50% -15%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent),
      radial-gradient(ellipse 60% 40% at 100% 100%, color-mix(in srgb, var(--color-accent) 6%, transparent), transparent),
      var(--color-bg);
    color: var(--color-text);
  }
</style>
