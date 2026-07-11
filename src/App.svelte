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
  <div class="aurora-layer aurora-layer-a" aria-hidden="true"></div>
  <div class="aurora-layer aurora-layer-b" aria-hidden="true"></div>
  <div class="aurora-layer aurora-layer-c" aria-hidden="true"></div>
  <div class="theme-overlay" aria-hidden="true"></div>
  <div class="minimal-extras" aria-hidden="true">
    <div class="minimal-vignette"></div>
    <div class="minimal-grid"></div>
  </div>
  <div class="blossom-extras" aria-hidden="true">
    <span class="blossom-petal blossom-petal-1"></span>
    <span class="blossom-petal blossom-petal-2"></span>
    <span class="blossom-petal blossom-petal-3"></span>
    <span class="blossom-petal blossom-petal-4"></span>
    <span class="blossom-petal blossom-petal-5"></span>
    <span class="blossom-petal blossom-petal-6"></span>
    <span class="blossom-petal blossom-petal-7"></span>
    <span class="blossom-petal blossom-petal-8"></span>
  </div>
  <div class="chaos-extras" aria-hidden="true">
    <span class="chaos-blob chaos-blob-1">🌈</span>
    <span class="chaos-blob chaos-blob-2">✨</span>
    <span class="chaos-blob chaos-blob-3">💫</span>
    <span class="chaos-blob chaos-blob-4">🎉</span>
    <span class="chaos-blob chaos-blob-5">⚡</span>
  </div>
  <div class="cyber-extras" aria-hidden="true">
    <div class="cyber-carbon"></div>
    <div class="cyber-bloom cyber-bloom-a"></div>
    <div class="cyber-bloom cyber-bloom-b"></div>
    <div class="cyber-bloom cyber-bloom-c"></div>
    <div class="cyber-grid"></div>
    <div class="cyber-hex"></div>
    <div class="cyber-sheen"></div>
    <div class="cyber-beam"></div>
    <div class="cyber-chrome-rim"></div>
    <span class="cyber-hud cyber-hud-tl">SYS::ONLINE</span>
    <span class="cyber-hud cyber-hud-tr">AURA::LINK</span>
    <span class="cyber-hud cyber-hud-bl">NET::SYNC</span>
    <span class="cyber-hud cyber-hud-br">SIG::OK</span>
    <span class="cyber-corner cyber-corner-tl"></span>
    <span class="cyber-corner cyber-corner-tr"></span>
    <span class="cyber-corner cyber-corner-bl"></span>
    <span class="cyber-corner cyber-corner-br"></span>
  </div>
  <div class="papyrus-extras" aria-hidden="true">
    <div class="papyrus-candle"></div>
    <div class="papyrus-ink papyrus-ink-1"></div>
    <div class="papyrus-ink papyrus-ink-2"></div>
    <span class="papyrus-dust papyrus-dust-1"></span>
    <span class="papyrus-dust papyrus-dust-2"></span>
    <span class="papyrus-dust papyrus-dust-3"></span>
    <span class="papyrus-dust papyrus-dust-4"></span>
    <span class="papyrus-dust papyrus-dust-5"></span>
    <span class="papyrus-dust papyrus-dust-6"></span>
  </div>
  <div class="papyrus-frame" aria-hidden="true">
    <div class="papyrus-wood"></div>
    <div class="papyrus-brass-inlay"></div>
    <span class="papyrus-rivet papyrus-rivet-tl"></span>
    <span class="papyrus-rivet papyrus-rivet-tr"></span>
    <span class="papyrus-rivet papyrus-rivet-bl"></span>
    <span class="papyrus-rivet papyrus-rivet-br"></span>
  </div>
  <div class="edge-light" aria-hidden="true"></div>

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
    background: var(--color-bg);
    color: var(--color-text);
    transition: background var(--transition-base);
  }

  .aurora-layer {
    position: absolute;
    pointer-events: none;
    border-radius: 50%;
    filter: blur(72px);
    opacity: 0.55;
    will-change: transform, opacity;
  }

  .aurora-layer-a {
    width: min(68vw, 560px);
    height: min(68vw, 560px);
    top: -18%;
    left: -8%;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--aurora-1) 55%, transparent),
      transparent 68%
    );
    animation: aurora-breathe 14s ease-in-out infinite;
  }

  .aurora-layer-b {
    width: min(72vw, 620px);
    height: min(72vw, 620px);
    top: 18%;
    right: -16%;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--aurora-2) 48%, transparent),
      transparent 70%
    );
    animation: aurora-breathe 18s ease-in-out infinite reverse;
  }

  .aurora-layer-c {
    width: min(56vw, 480px);
    height: min(56vw, 480px);
    bottom: -12%;
    left: 22%;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--aurora-3) 42%, transparent),
      transparent 72%
    );
    animation: aurora-breathe 16s ease-in-out infinite;
    animation-delay: -4s;
  }

  :global(:root[data-companion-state="listening"]) .aurora-layer-b {
    opacity: 0.78;
  }

  :global(:root[data-companion-state="thinking"]) .aurora-layer-a {
    opacity: 0.82;
    animation-duration: 8s;
  }

  :global(:root[data-companion-state="error"]) .aurora-layer-a,
  :global(:root[data-companion-state="error"]) .aurora-layer-b,
  :global(:root[data-companion-state="error"]) .aurora-layer-c {
    opacity: 0.35;
    filter: blur(72px) saturate(0.6);
  }

  .edge-light {
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    box-shadow:
      inset 0 1px 0 var(--edge-light),
      inset 0 0 0 1px color-mix(in srgb, var(--color-companion) 12%, transparent);
    z-index: 0;
  }

  .app-window::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    border-radius: inherit;
    opacity: 0.04;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  .app-window > :global(.app-shell) {
    position: relative;
    flex: 1;
    min-height: 0;
    z-index: 1;
  }

  /* ── Generisches Theme-Overlay (pro Theme umgestylt) ── */
  .theme-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    opacity: 0;
    transition: opacity var(--transition-base);
  }

  /* ── Chaos-Extras (nur bei Chaos sichtbar) ── */
  .chaos-extras {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    display: none;
  }

  .chaos-blob {
    position: absolute;
    font-size: clamp(1.5rem, 4vw, 2.75rem);
    opacity: 0.85;
    filter: drop-shadow(0 0 12px color-mix(in srgb, var(--color-accent) 60%, transparent));
    animation: chaos-float 9s ease-in-out infinite;
  }

  .chaos-blob-1 {
    top: 12%;
    left: 8%;
    animation-duration: 8s;
  }
  .chaos-blob-2 {
    top: 68%;
    left: 16%;
    animation-duration: 11s;
    animation-delay: -2s;
  }
  .chaos-blob-3 {
    top: 24%;
    right: 12%;
    animation-duration: 10s;
    animation-delay: -4s;
  }
  .chaos-blob-4 {
    bottom: 14%;
    right: 18%;
    animation-duration: 12s;
    animation-delay: -1s;
  }
  .chaos-blob-5 {
    top: 46%;
    left: 48%;
    animation-duration: 9.5s;
    animation-delay: -6s;
  }

  /* ── Minimal (dunkel): Layer aus, kein Rauschen, nur feiner Lichtsaum ── */
  :global(:root[data-ui-theme="minimal"]) .aurora-layer {
    display: none;
  }
  :global(:root[data-ui-theme="minimal"]) .app-window::after {
    opacity: 0;
  }
  :global(:root[data-ui-theme="minimal"]) .theme-overlay {
    opacity: 1;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.045) 0%, transparent 18%);
  }
  :global(:root[data-ui-theme="minimal"]) .minimal-extras {
    display: block;
  }

  /* ── Minimal (Schlicht): Vignette + Punkt-Raster, tiefes Schwarz ── */
  .minimal-extras {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    display: none;
    border-radius: inherit;
    overflow: hidden;
  }

  .minimal-vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse 85% 75% at 50% 45%,
      transparent 40%,
      rgba(0, 0, 0, 0.55) 100%
    );
  }

  .minimal-grid {
    position: absolute;
    inset: 0;
    opacity: 0.35;
    background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
    background-size: 28px 28px;
    mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, #000 20%, transparent 100%);
    -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, #000 20%, transparent 100%);
    animation: minimal-grid-drift 24s linear infinite;
  }

  @keyframes minimal-grid-drift {
    from {
      background-position: 0 0;
    }
    to {
      background-position: 28px 28px;
    }
  }

  /* ── Blossom: fallende Blütenblätter + warmer Schimmer ── */
  .blossom-extras {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    display: none;
    overflow: hidden;
    border-radius: inherit;
  }

  :global(:root[data-ui-theme="blossom"]) .blossom-extras {
    display: block;
  }

  :global(:root[data-ui-theme="blossom"]) .theme-overlay {
    opacity: 1;
    background:
      radial-gradient(ellipse 50% 40% at 20% 10%, rgba(244, 114, 182, 0.12), transparent 70%),
      radial-gradient(ellipse 40% 35% at 80% 90%, rgba(192, 132, 252, 0.1), transparent 70%);
  }

  .blossom-petal {
    position: absolute;
    top: -8%;
    width: 14px;
    height: 18px;
    border-radius: 50% 50% 50% 0;
    opacity: 0.75;
    filter: drop-shadow(0 2px 4px rgba(219, 39, 119, 0.2));
    animation: blossom-petal-fall linear infinite;
  }

  .blossom-petal-1 {
    left: 8%;
    background: linear-gradient(135deg, #fbcfe8, #f472b6);
    animation-duration: 14s;
  }
  .blossom-petal-2 {
    left: 22%;
    width: 11px;
    height: 15px;
    background: linear-gradient(135deg, #e9d5ff, #c084fc);
    animation-duration: 18s;
    animation-delay: -4s;
  }
  .blossom-petal-3 {
    left: 38%;
    background: linear-gradient(135deg, #fde68a, #fbbf24);
    animation-duration: 16s;
    animation-delay: -7s;
  }
  .blossom-petal-4 {
    left: 54%;
    width: 12px;
    height: 16px;
    background: linear-gradient(135deg, #fbcfe8, #db2777);
    animation-duration: 20s;
    animation-delay: -2s;
  }
  .blossom-petal-5 {
    left: 68%;
    background: linear-gradient(135deg, #ddd6fe, #a78bfa);
    animation-duration: 15s;
    animation-delay: -9s;
  }
  .blossom-petal-6 {
    left: 82%;
    width: 10px;
    height: 14px;
    background: linear-gradient(135deg, #fecdd3, #fb7185);
    animation-duration: 22s;
    animation-delay: -11s;
  }
  .blossom-petal-7 {
    left: 46%;
    width: 9px;
    height: 12px;
    background: linear-gradient(135deg, #fef3c7, #f59e0b);
    animation-duration: 19s;
    animation-delay: -14s;
  }
  .blossom-petal-8 {
    left: 92%;
    background: linear-gradient(135deg, #f9a8d4, #ec4899);
    animation-duration: 17s;
    animation-delay: -6s;
  }

  @keyframes blossom-petal-fall {
    0% {
      transform: translate3d(0, 0, 0) rotate(0deg);
      opacity: 0;
    }
    8% {
      opacity: 0.8;
    }
    100% {
      transform: translate3d(40px, 110vh, 0) rotate(420deg);
      opacity: 0;
    }
  }

  /* ── Cyberpunk: ruhige Neon-Atmosphäre ohne Flacker/Steps-Animationen ── */
  :global(:root[data-ui-theme="cyberpunk"]) .aurora-layer {
    animation: none;
    filter: blur(72px);
    opacity: 0.28;
    mix-blend-mode: normal;
  }
  :global(:root[data-ui-theme="cyberpunk"]) .aurora-layer-c {
    opacity: 0.12;
  }
  :global(:root[data-ui-theme="cyberpunk"]) .theme-overlay {
    opacity: 1;
    background-image:
      repeating-linear-gradient(
        to bottom,
        rgba(0, 240, 255, 0.035) 0px,
        rgba(0, 240, 255, 0.035) 1px,
        transparent 1px,
        transparent 4px
      ),
      radial-gradient(ellipse 60% 40% at 50% 100%, rgba(255, 69, 0, 0.1), transparent 70%);
    mix-blend-mode: normal;
  }
  :global(:root[data-ui-theme="cyberpunk"]) .cyber-extras {
    display: block;
  }

  /* ── Cyber-Extras: Grid-Horizont, Sweep-Beam, Flicker, Eck-Brackets ── */
  .cyber-extras {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    display: none;
    overflow: hidden;
    border-radius: inherit;
  }

  .cyber-carbon {
    position: absolute;
    inset: 0;
    opacity: 0.14;
    background-image:
      url("data:image/svg+xml,%3Csvg width='48' height='48' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 24h48M24 0v48' stroke='%2300f0ff' stroke-width='0.4' opacity='0.35'/%3E%3Cpath d='M0 0l48 48M48 0L0 48' stroke='%23ff4500' stroke-width='0.3' opacity='0.2'/%3E%3C/svg%3E"),
      repeating-linear-gradient(
        0deg,
        rgba(0, 240, 255, 0.03) 0px,
        rgba(0, 240, 255, 0.03) 1px,
        transparent 1px,
        transparent 3px
      );
    background-size: 48px 48px, 100% 100%;
    mix-blend-mode: screen;
  }

  .cyber-bloom {
    position: absolute;
    border-radius: 50%;
    filter: blur(48px);
    pointer-events: none;
    opacity: 0.55;
  }
  .cyber-bloom-a {
    width: 42%;
    height: 34%;
    top: -8%;
    left: -6%;
    background: radial-gradient(circle, rgba(0, 240, 255, 0.55) 0%, transparent 70%);
  }
  .cyber-bloom-b {
    width: 38%;
    height: 30%;
    right: -8%;
    bottom: 8%;
    background: radial-gradient(circle, rgba(255, 69, 0, 0.5) 0%, transparent 70%);
  }
  .cyber-bloom-c {
    width: 28%;
    height: 22%;
    left: 38%;
    top: 42%;
    background: radial-gradient(circle, rgba(250, 255, 0, 0.22) 0%, transparent 70%);
    opacity: 0.35;
  }

  .cyber-grid {
    position: absolute;
    left: -30%;
    right: -30%;
    bottom: -12%;
    height: 46%;
    background-image:
      linear-gradient(rgba(0, 240, 255, 0.32) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 69, 0, 0.22) 1px, transparent 1px);
    background-size: 44px 44px;
    transform: perspective(420px) rotateX(62deg) translateZ(0);
    transform-origin: 50% 0%;
    mask-image: linear-gradient(180deg, transparent 0%, #000 34%, #000 100%);
    -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 34%, #000 100%);
    animation: cyber-grid-scroll 14s linear infinite;
    opacity: 0.48;
    will-change: transform;
  }

  .cyber-hex {
    position: absolute;
    inset: 0;
    opacity: 0.12;
    background-image: url("data:image/svg+xml,%3Csvg width='56' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M28 0 L56 16 L56 50 L28 66 L0 50 L0 16 Z' fill='none' stroke='%2300f0ff' stroke-width='0.6'/%3E%3C/svg%3E");
    background-size: 56px 100px;
  }

  .cyber-sheen {
    position: absolute;
    inset: -20%;
    background: linear-gradient(
      115deg,
      transparent 36%,
      rgba(255, 255, 255, 0.04) 44%,
      rgba(0, 240, 255, 0.14) 50%,
      rgba(255, 255, 255, 0.06) 56%,
      transparent 64%
    );
    transform: translateX(-40%);
    animation: cyber-sheen-sweep 14s ease-in-out infinite;
    mix-blend-mode: screen;
    opacity: 0.85;
    will-change: transform;
  }

  @keyframes cyber-sheen-sweep {
    0%,
    18% {
      transform: translateX(-45%) translateY(4%);
      opacity: 0;
    }
    28% {
      opacity: 0.9;
    }
    55% {
      transform: translateX(35%) translateY(-2%);
      opacity: 0.75;
    }
    70%,
    100% {
      transform: translateX(55%) translateY(-4%);
      opacity: 0;
    }
  }

  @keyframes cyber-grid-scroll {
    from {
      transform: perspective(420px) rotateX(62deg) translate3d(0, 0, 0);
    }
    to {
      transform: perspective(420px) rotateX(62deg) translate3d(0, 44px, 0);
    }
  }

  .cyber-hud {
    position: absolute;
    font-family: var(--font-mono);
    font-size: 0.625rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(0, 240, 255, 0.62);
    text-shadow: 0 0 10px rgba(0, 240, 255, 0.55);
    opacity: 0.8;
  }

  .cyber-hud-tl {
    top: 14px;
    left: 36px;
  }
  .cyber-hud-tr {
    top: 14px;
    right: 36px;
    color: rgba(255, 69, 0, 0.65);
    text-shadow: 0 0 10px rgba(255, 69, 0, 0.45);
  }
  .cyber-hud-bl {
    bottom: 14px;
    left: 36px;
    color: rgba(250, 255, 0, 0.62);
    text-shadow: 0 0 10px rgba(250, 255, 0, 0.45);
  }
  .cyber-hud-br {
    bottom: 14px;
    right: 36px;
  }

  .cyber-beam {
    position: absolute;
    left: 0;
    right: 0;
    top: -6%;
    height: 2px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(0, 240, 255, 0.55) 30%,
      rgba(0, 240, 255, 0.85) 50%,
      rgba(0, 240, 255, 0.55) 70%,
      transparent 100%
    );
    box-shadow: 0 0 16px rgba(0, 240, 255, 0.55);
    animation: cyber-beam-sweep 18s ease-in-out infinite;
    opacity: 0;
    will-change: transform, opacity;
  }

  @keyframes cyber-beam-sweep {
    0%,
    72% {
      transform: translateY(0);
      opacity: 0;
    }
    74% {
      opacity: 0.45;
    }
    92% {
      opacity: 0.45;
    }
    100% {
      transform: translateY(calc(100vh + 12px));
      opacity: 0;
    }
  }

  .cyber-chrome-rim {
    position: absolute;
    inset: 5px;
    border-radius: inherit;
    pointer-events: none;
    border: 1px solid transparent;
    background:
      linear-gradient(transparent, transparent) padding-box,
      linear-gradient(
          135deg,
          rgba(0, 240, 255, 0.85) 0%,
          rgba(255, 255, 255, 0.35) 28%,
          rgba(255, 69, 0, 0.75) 62%,
          rgba(250, 255, 0, 0.45) 100%
        )
        border-box;
    box-shadow:
      inset 0 0 0 1px rgba(0, 240, 255, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      0 0 28px rgba(0, 240, 255, 0.22),
      0 0 48px rgba(255, 69, 0, 0.12);
    opacity: 0.9;
  }

  .cyber-corner {
    position: absolute;
    width: 26px;
    height: 26px;
    opacity: 0.9;
  }

  .cyber-corner-tl {
    top: 6px;
    left: 6px;
    border-top: 2.5px solid rgba(0, 240, 255, 0.75);
    border-left: 2.5px solid rgba(0, 240, 255, 0.75);
    box-shadow: 0 0 10px rgba(0, 240, 255, 0.45);
  }
  .cyber-corner-tr {
    top: 6px;
    right: 6px;
    border-top: 2.5px solid rgba(255, 69, 0, 0.75);
    border-right: 2.5px solid rgba(255, 69, 0, 0.75);
    box-shadow: 0 0 10px rgba(255, 69, 0, 0.45);
  }
  .cyber-corner-bl {
    bottom: 6px;
    left: 6px;
    border-bottom: 2.5px solid rgba(250, 255, 0, 0.65);
    border-left: 2.5px solid rgba(250, 255, 0, 0.65);
    box-shadow: 0 0 10px rgba(250, 255, 0, 0.45);
  }
  .cyber-corner-br {
    bottom: 6px;
    right: 6px;
    border-bottom: 2.5px solid rgba(0, 240, 255, 0.75);
    border-right: 2.5px solid rgba(0, 240, 255, 0.75);
    box-shadow: 0 0 10px rgba(0, 240, 255, 0.45);
  }

  /* ── Papyrus: Pergament-Textur + Alters-Flecken, Layer statisch warm ── */
  :global(:root[data-ui-theme="papyrus"]) .aurora-layer {
    animation: none;
    opacity: 0.25;
    filter: blur(90px);
  }
  :global(:root[data-ui-theme="papyrus"]) .theme-overlay {
    opacity: 1;
    background-image:
      radial-gradient(ellipse 40% 30% at 12% 8%, rgba(122, 91, 30, 0.12), transparent 70%),
      radial-gradient(ellipse 34% 26% at 88% 86%, rgba(92, 60, 32, 0.14), transparent 70%),
      radial-gradient(ellipse 20% 16% at 78% 12%, rgba(122, 91, 30, 0.08), transparent 70%),
      url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.035 0.09' numOctaves='6' seed='7'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23p)' opacity='0.22'/%3E%3C/svg%3E"),
      repeating-linear-gradient(
        90deg,
        transparent 0px,
        rgba(122, 91, 30, 0.025) 1px,
        transparent 3px,
        transparent 18px
      );
    mix-blend-mode: multiply;
  }
  :global(:root[data-ui-theme="papyrus"]) .app-window {
    background-color: #e9dec4;
    background-image:
      url("data:image/svg+xml,%3Csvg viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='bg'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04 0.1' numOctaves='5' seed='3'/%3E%3CfeColorMatrix values='0 0 0 0 0.38 0 0 0 0 0.28 0 0 0 0 0.15 0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23bg)'/%3E%3C/svg%3E"),
      linear-gradient(180deg, #f0e6cc 0%, #e9dec4 45%, #dfd0b0 100%);
  }
  :global(:root[data-ui-theme="papyrus"]) .papyrus-extras,
  :global(:root[data-ui-theme="papyrus"]) .papyrus-frame {
    display: block;
  }
  :global(:root[data-ui-theme="papyrus"]) .edge-light {
    display: none;
  }
  /* Inhalt hinter dem Holzrahmen freistellen */
  :global(:root[data-ui-theme="papyrus"]) .app-window {
    padding: 11px;
    border-color: #3c2410;
  }

  /* ── Papyrus-Extras: Kerzenschein + schwebender Staub ── */
  .papyrus-extras {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    display: none;
    overflow: hidden;
    border-radius: inherit;
  }

  .papyrus-candle {
    position: absolute;
    right: -12%;
    bottom: -16%;
    width: 60%;
    height: 60%;
    background: radial-gradient(circle, rgba(240, 190, 90, 0.38), transparent 65%);
    animation: papyrus-candle-flicker 5.5s ease-in-out infinite;
  }

  .papyrus-ink {
    position: absolute;
    border-radius: 50%;
    filter: blur(1px);
    opacity: 0.35;
    mix-blend-mode: multiply;
  }

  .papyrus-ink-1 {
    top: 18%;
    left: 6%;
    width: 48px;
    height: 32px;
    background: radial-gradient(ellipse, rgba(42, 31, 16, 0.5) 0%, transparent 70%);
    transform: rotate(-12deg);
  }

  .papyrus-ink-2 {
    bottom: 22%;
    right: 10%;
    width: 36px;
    height: 28px;
    background: radial-gradient(ellipse, rgba(60, 45, 25, 0.45) 0%, transparent 70%);
    transform: rotate(8deg);
  }

  @keyframes papyrus-candle-flicker {
    0%,
    100% {
      opacity: 0.75;
      transform: scale(1);
    }
    23% {
      opacity: 0.95;
      transform: scale(1.05);
    }
    41% {
      opacity: 0.7;
      transform: scale(0.98);
    }
    67% {
      opacity: 1;
      transform: scale(1.03);
    }
    82% {
      opacity: 0.8;
      transform: scale(1);
    }
  }

  .papyrus-dust {
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(240, 217, 140, 0.75);
    filter: blur(1px);
    bottom: -2%;
    animation: papyrus-dust-rise 16s linear infinite;
    opacity: 0;
  }

  .papyrus-dust-1 {
    left: 12%;
    animation-duration: 17s;
  }
  .papyrus-dust-2 {
    left: 30%;
    width: 3px;
    height: 3px;
    animation-duration: 21s;
    animation-delay: -7s;
  }
  .papyrus-dust-3 {
    left: 52%;
    animation-duration: 15s;
    animation-delay: -3s;
  }
  .papyrus-dust-4 {
    left: 66%;
    width: 5px;
    height: 5px;
    animation-duration: 24s;
    animation-delay: -12s;
  }
  .papyrus-dust-5 {
    left: 82%;
    animation-duration: 19s;
    animation-delay: -9s;
  }
  .papyrus-dust-6 {
    left: 44%;
    width: 3px;
    height: 3px;
    animation-duration: 26s;
    animation-delay: -18s;
  }

  @keyframes papyrus-dust-rise {
    0% {
      transform: translate3d(0, 0, 0);
      opacity: 0;
    }
    8% {
      opacity: 0.7;
    }
    50% {
      transform: translate3d(14px, -46vh, 0);
      opacity: 0.45;
    }
    92% {
      opacity: 0.15;
    }
    100% {
      transform: translate3d(-8px, -92vh, 0);
      opacity: 0;
    }
  }

  /* ── Papyrus-Fensterrahmen: Holz mit Maserung + Messing-Einlage + Nieten ── */
  .papyrus-frame {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
    display: none;
    border-radius: inherit;
  }

  .papyrus-wood {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 11px;
    background-color: #5e3c20;
    background-image:
      url("data:image/svg+xml,%3Csvg viewBox='0 0 300 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='w'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.01 0.28' numOctaves='5' seed='4'/%3E%3CfeColorMatrix values='0 0 0 0 0.14 0 0 0 0 0.08 0 0 0 0 0.03 0 0 0 0.65 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23w)'/%3E%3C/svg%3E"),
      repeating-linear-gradient(
        94deg,
        rgba(60, 36, 16, 0.4) 0px,
        transparent 2px,
        rgba(122, 82, 51, 0.35) 6px,
        transparent 10px,
        rgba(40, 24, 10, 0.32) 14px,
        transparent 18px,
        rgba(150, 100, 60, 0.25) 22px
      ),
      linear-gradient(180deg, #7a5233 0%, #5e3c20 38%, #46290f 100%);
    box-shadow:
      inset 0 2px 0 rgba(190, 140, 90, 0.55),
      inset 0 -2px 0 rgba(20, 10, 2, 0.75),
      0 0 0 1px rgba(20, 10, 2, 0.5);
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    mask-composite: exclude;
  }

  .papyrus-brass-inlay {
    position: absolute;
    inset: 8px;
    border-radius: calc(var(--radius-window) - 6px);
    padding: 2px;
    background: linear-gradient(
      130deg,
      #f0d98c 0%,
      #c9a227 22%,
      #8a671f 45%,
      #e6c96a 62%,
      #a37c1d 82%,
      #f0d98c 100%
    );
    box-shadow: 0 0 6px rgba(201, 162, 39, 0.35);
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    mask-composite: exclude;
    animation: papyrus-brass-sheen 14s ease-in-out infinite;
  }

  @keyframes papyrus-brass-sheen {
    0%,
    100% {
      filter: brightness(1);
    }
    50% {
      filter: brightness(1.18);
    }
  }

  .papyrus-rivet {
    position: absolute;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: radial-gradient(circle at 34% 30%, #f6e6a8 0%, #c9a227 45%, #6d4f16 100%);
    box-shadow:
      0 1px 2px rgba(20, 10, 2, 0.8),
      inset 0 -1px 1px rgba(74, 52, 12, 0.8);
  }

  .papyrus-rivet-tl {
    top: 7px;
    left: 7px;
  }
  .papyrus-rivet-tr {
    top: 7px;
    right: 7px;
  }
  .papyrus-rivet-bl {
    bottom: 7px;
    left: 7px;
  }
  .papyrus-rivet-br {
    bottom: 7px;
    right: 7px;
  }

  /* ── Blossom: sanfte, langsamere Layer ── */
  :global(:root[data-ui-theme="blossom"]) .aurora-layer {
    opacity: 0.5;
    animation-duration: 22s;
  }

  /* ── Chaos: rotierende Regenbogen-Layer + schwebende Emojis + Overlay ── */
  :global(:root[data-ui-theme="chaos"]) .aurora-layer {
    opacity: 0.7;
    mix-blend-mode: screen;
    animation:
      aurora-breathe 10s ease-in-out infinite,
      chaos-hue 6s linear infinite;
  }
  :global(:root[data-ui-theme="chaos"]) .chaos-extras {
    display: block;
  }
  :global(:root[data-ui-theme="chaos"]) .theme-overlay {
    opacity: 1;
    background: repeating-conic-gradient(
      from 0deg at 50% 50%,
      rgba(255, 0, 128, 0.04) 0deg,
      rgba(255, 238, 0, 0.04) 60deg,
      rgba(0, 255, 136, 0.04) 120deg,
      rgba(0, 208, 255, 0.04) 180deg,
      rgba(255, 0, 128, 0.04) 240deg,
      rgba(255, 238, 0, 0.04) 300deg,
      rgba(255, 0, 128, 0.04) 360deg
    );
    animation: chaos-overlay-spin 20s linear infinite;
  }

  @keyframes chaos-overlay-spin {
    from {
      transform: rotate(0deg) scale(1.2);
    }
    to {
      transform: rotate(360deg) scale(1.2);
    }
  }

  @keyframes chaos-hue {
    from {
      filter: blur(72px) hue-rotate(0deg);
    }
    to {
      filter: blur(72px) hue-rotate(360deg);
    }
  }

  @keyframes chaos-float {
    0%,
    100% {
      transform: translate3d(0, 0, 0) rotate(-8deg) scale(1);
    }
    33% {
      transform: translate3d(12px, -22px, 0) rotate(10deg) scale(1.15);
    }
    66% {
      transform: translate3d(-14px, 10px, 0) rotate(-4deg) scale(0.92);
    }
  }

  /* ── Reduce-Motion-Kill-Switch respektieren ── */
  :global(:root[data-reduce-motion="true"]) .chaos-blob,
  :global(:root[data-reduce-motion="true"]) .aurora-layer,
  :global(:root[data-reduce-motion="true"]) .cyber-grid,
  :global(:root[data-reduce-motion="true"]) .cyber-sheen,
  :global(:root[data-reduce-motion="true"]) .cyber-beam,
  :global(:root[data-reduce-motion="true"]) .minimal-grid,
  :global(:root[data-reduce-motion="true"]) .blossom-petal,
  :global(:root[data-reduce-motion="true"]) .papyrus-candle,
  :global(:root[data-reduce-motion="true"]) .papyrus-dust,
  :global(:root[data-reduce-motion="true"]) .papyrus-brass-inlay {
    animation: none !important;
  }
  :global(:root[data-reduce-motion="true"]) .cyber-sheen {
    opacity: 0 !important;
  }
  :global(:root[data-reduce-motion="true"][data-ui-theme="chaos"]) .theme-overlay {
    animation: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .aurora-layer,
    .chaos-blob,
    .cyber-grid,
    .cyber-sheen,
    .cyber-beam,
    .minimal-grid,
    .blossom-petal,
    .papyrus-candle,
    .papyrus-dust,
    .papyrus-brass-inlay {
      animation: none;
    }
    .cyber-sheen {
      opacity: 0;
    }
  }
</style>
