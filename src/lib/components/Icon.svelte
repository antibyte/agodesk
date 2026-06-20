<script lang="ts">
  import { getIcon, type IconName } from "../services/icons";

  interface Props {
    name: IconName;
    size?: number;
    class?: string;
    ariaLabel?: string;
    ariaHidden?: boolean;
  }

  let {
    name,
    size = 16,
    class: className = "",
    ariaLabel,
    ariaHidden = ariaLabel ? false : true,
  }: Props = $props();

  const def = $derived(getIcon(name));
</script>

<svg
  class={className}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={def.fill ? "currentColor" : "none"}
  stroke={def.fill ? "none" : "currentColor"}
  stroke-width={def.strokeWidth ?? 2}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden={ariaHidden}
  aria-label={ariaLabel}
  role={ariaLabel ? "img" : undefined}
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- static SVG fragments from icons.ts, no user input -->
  {@html def.paths}
</svg>
