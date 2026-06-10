<script lang="ts">
  import { fetchIntegrationDisplayUrl } from "../services/integration-asset-fetch";

  interface Props {
    icon?: string;
    webhostUrl?: string;
    serverUrl?: string;
    label?: string;
  }

  let {
    icon = "",
    webhostUrl = "",
    serverUrl = "",
    label = "",
  }: Props = $props();

  let displayUrl = $state("");
  let failed = $state(false);
  let loadGeneration = 0;

  $effect(() => {
    const iconValue = icon;
    const webhost = webhostUrl;
    const server = serverUrl;
    const generation = ++loadGeneration;
    failed = false;
    displayUrl = "";

    if (!iconValue && !webhost) {
      failed = true;
      return;
    }

    void (async () => {
      const next = await fetchIntegrationDisplayUrl(server, iconValue || undefined, webhost);
      if (generation !== loadGeneration) {
        return;
      }
      displayUrl = next;
      failed = !next;
    })();
  });
</script>

{#if displayUrl && !failed}
  <img class="icon" src={displayUrl} alt="" />
{:else}
  <span class="icon-fallback" aria-hidden="true">{label.trim().charAt(0).toUpperCase() || "⎔"}</span>
{/if}

<style>
  .icon {
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-md);
    object-fit: cover;
    flex-shrink: 0;
  }

  .icon-fallback {
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: white;
    flex-shrink: 0;
    font-size: 0.8125rem;
    font-weight: 700;
  }
</style>
