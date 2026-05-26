<script lang="ts">
  import ChatView from "./lib/components/ChatView.svelte";
</script>

<main>
  <ChatView />
</main>

<style>
  main {
    height: 100vh;
    overflow: hidden;
    background: var(--color-bg);
    color: var(--color-text);
  }
</style>
