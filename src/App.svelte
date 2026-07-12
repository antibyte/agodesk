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
    <!-- Neon orbs — pure colored accent motion -->
    <span class="chaos-orb chaos-orb-1"></span>
    <span class="chaos-orb chaos-orb-2"></span>
    <span class="chaos-orb chaos-orb-3"></span>
    <span class="chaos-orb chaos-orb-4"></span>
    <span class="chaos-orb chaos-orb-5"></span>
    <span class="chaos-shard chaos-shard-1"></span>
    <span class="chaos-shard chaos-shard-2"></span>
    <span class="chaos-shard chaos-shard-3"></span>

    <!-- Detailed multi-color glitch glyphs -->
    <span class="chaos-glyph chaos-glyph-1">
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cg1-a" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop stop-color="#c026ff" />
            <stop offset="0.5" stop-color="#22f0ff" />
            <stop offset="1" stop-color="#ff2bd6" />
          </linearGradient>
          <radialGradient id="cg1-b" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(32 32) rotate(90) scale(18)">
            <stop stop-color="#b8ff3c" stop-opacity="0.9" />
            <stop offset="1" stop-color="#b8ff3c" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="32" r="22" stroke="url(#cg1-a)" stroke-width="1.8" stroke-dasharray="7 4 2 4" opacity="0.95" />
        <circle cx="32" cy="32" r="15" stroke="#ff2bd6" stroke-width="1.2" stroke-dasharray="3 5" opacity="0.7" />
        <path d="M10 30h12M42 34h12M30 10v10M34 44v10" stroke="#22f0ff" stroke-width="1.6" stroke-linecap="round" />
        <path d="M18 18l6 4M46 46l-6-4M46 18l-5 5M18 46l5-5" stroke="#c026ff" stroke-width="1.3" stroke-linecap="round" opacity="0.85" />
        <circle cx="32" cy="32" r="5" fill="url(#cg1-b)" />
        <circle cx="32" cy="32" r="2.2" fill="#fff" opacity="0.95" />
        <circle cx="20" cy="22" r="1.4" fill="#ffb020" />
        <circle cx="44" cy="40" r="1.2" fill="#22f0ff" />
      </svg>
    </span>
    <span class="chaos-glyph chaos-glyph-2">
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cg2-a" x1="18" y1="4" x2="46" y2="60" gradientUnits="userSpaceOnUse">
            <stop stop-color="#ffb020" />
            <stop offset="0.45" stop-color="#ff2bd6" />
            <stop offset="1" stop-color="#7c1aff" />
          </linearGradient>
          <linearGradient id="cg2-b" x1="14" y1="26" x2="50" y2="26" gradientUnits="userSpaceOnUse">
            <stop stop-color="#22f0ff" stop-opacity="0.15" />
            <stop offset="1" stop-color="#b8ff3c" stop-opacity="0.35" />
          </linearGradient>
        </defs>
        <path d="M36 6 18 32h12l-5 24 24-30H33l3-20Z" fill="url(#cg2-b)" stroke="url(#cg2-a)" stroke-width="1.8" stroke-linejoin="round" />
        <path d="M34 10 22 30h8l-3 16 14-18h-8l3-18Z" stroke="#22f0ff" stroke-width="1.1" stroke-linejoin="round" opacity="0.75" />
        <path d="M40 14h6M16 40h7M48 42l4 4" stroke="#b8ff3c" stroke-width="1.4" stroke-linecap="round" />
        <circle cx="28" cy="28" r="1.6" fill="#fff" />
        <circle cx="38" cy="36" r="1.2" fill="#ffb020" />
      </svg>
    </span>
    <span class="chaos-glyph chaos-glyph-3">
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cg3-a" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
            <stop stop-color="#22f0ff" />
            <stop offset="0.55" stop-color="#c026ff" />
            <stop offset="1" stop-color="#ff4d6d" />
          </linearGradient>
        </defs>
        <path d="M32 8c10 7 18 12 18 22a18 18 0 1 1-36 0c0-6 4-11 10-15" stroke="url(#cg3-a)" stroke-width="2" stroke-linecap="round" />
        <path d="M32 8c7 5 12 9 12 16a12 12 0 1 1-24 0c0-4 2-7 6-10" stroke="#ff2bd6" stroke-width="1.2" stroke-linecap="round" opacity="0.7" />
        <path d="M32 8v16l10-5" stroke="#b8ff3c" stroke-width="1.6" stroke-linejoin="round" />
        <path d="M32 24l-7 4" stroke="#22f0ff" stroke-width="1.3" stroke-linecap="round" />
        <circle cx="32" cy="30" r="3" fill="#c026ff" opacity="0.85" />
        <circle cx="32" cy="30" r="1.3" fill="#fff" />
        <path d="M14 20h5M48 44h6M50 16l-4 4" stroke="#ffb020" stroke-width="1.3" stroke-linecap="round" opacity="0.85" />
      </svg>
    </span>
    <span class="chaos-glyph chaos-glyph-4">
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cg4-a" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
            <stop stop-color="#ffb020" />
            <stop offset="0.4" stop-color="#ff2bd6" />
            <stop offset="1" stop-color="#22f0ff" />
          </linearGradient>
          <radialGradient id="cg4-b" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(32 30) rotate(90) scale(16)">
            <stop stop-color="#c026ff" stop-opacity="0.45" />
            <stop offset="1" stop-color="#c026ff" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="30" r="16" fill="url(#cg4-b)" />
        <path
          d="M32 6 37 24l18 2.5-14 12 4.5 18L32 46l-13.5 10.5 4.5-18-14-12L28 24Z"
          fill="#ff2bd6"
          fill-opacity="0.12"
          stroke="url(#cg4-a)"
          stroke-width="1.7"
          stroke-linejoin="round"
        />
        <path d="M32 16 34.5 26l10 1.4-8 6.8 2.4 10L32 38.5l-6.9 5.7 2.4-10-8-6.8 10-1.4Z" stroke="#b8ff3c" stroke-width="1.1" stroke-linejoin="round" opacity="0.8" />
        <circle cx="32" cy="30" r="2" fill="#fff" />
        <circle cx="22" cy="18" r="1.3" fill="#22f0ff" />
        <circle cx="44" cy="42" r="1.3" fill="#ffb020" />
      </svg>
    </span>
    <span class="chaos-glyph chaos-glyph-5">
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cg5-a" x1="10" y1="48" x2="50" y2="10" gradientUnits="userSpaceOnUse">
            <stop stop-color="#7c1aff" />
            <stop offset="0.5" stop-color="#22f0ff" />
            <stop offset="1" stop-color="#b8ff3c" />
          </linearGradient>
        </defs>
        <path d="M12 50 28 10l8 18 14-8-10 32H12Z" fill="#22f0ff" fill-opacity="0.1" stroke="url(#cg5-a)" stroke-width="1.8" stroke-linejoin="round" />
        <path d="M18 46 30 18l5 12 9-5-7 23H18Z" stroke="#ff2bd6" stroke-width="1.1" stroke-linejoin="round" opacity="0.75" />
        <path d="M8 16h10M46 48h10M52 12l-8 8M10 40l6 2" stroke="#ffb020" stroke-width="1.4" stroke-linecap="round" />
        <circle cx="30" cy="28" r="2" fill="#b8ff3c" />
        <circle cx="40" cy="34" r="1.4" fill="#fff" />
        <path d="M24 36h12" stroke="#c026ff" stroke-width="1.2" stroke-linecap="round" opacity="0.8" />
      </svg>
    </span>
    <span class="chaos-glyph chaos-glyph-6">
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cg6-a" x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
            <stop stop-color="#c026ff" />
            <stop offset="0.5" stop-color="#ff2bd6" />
            <stop offset="1" stop-color="#22f0ff" />
          </linearGradient>
        </defs>
        <rect x="12" y="12" width="36" height="36" rx="3" stroke="#22f0ff" stroke-width="1.3" transform="rotate(14 32 32)" opacity="0.55" />
        <rect x="14" y="14" width="32" height="32" rx="2" stroke="url(#cg6-a)" stroke-width="1.8" transform="rotate(-10 32 32)" />
        <rect x="20" y="20" width="20" height="20" stroke="#b8ff3c" stroke-width="1.1" transform="rotate(6 32 32)" opacity="0.8" />
        <path d="M20 32h24M32 20v24" stroke="#ff2bd6" stroke-width="1.4" opacity="0.9" />
        <path d="M24 24l16 16M40 24 24 40" stroke="#ffb020" stroke-width="1.1" opacity="0.65" />
        <circle cx="32" cy="32" r="2.4" fill="#fff" />
        <circle cx="18" cy="22" r="1.3" fill="#22f0ff" />
        <circle cx="46" cy="42" r="1.3" fill="#c026ff" />
      </svg>
    </span>
    <span class="chaos-glyph chaos-glyph-7">
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cg7-a" x1="8" y1="32" x2="56" y2="32" gradientUnits="userSpaceOnUse">
            <stop stop-color="#ff4d6d" />
            <stop offset="0.5" stop-color="#c026ff" />
            <stop offset="1" stop-color="#22f0ff" />
          </linearGradient>
        </defs>
        <path d="M8 32c8-14 16-20 24-20s16 6 24 20c-8 14-16 20-24 20S16 46 8 32Z" stroke="url(#cg7-a)" stroke-width="1.8" fill="#c026ff" fill-opacity="0.08" />
        <ellipse cx="32" cy="32" rx="10" ry="16" stroke="#b8ff3c" stroke-width="1.2" opacity="0.75" />
        <circle cx="32" cy="32" r="6" stroke="#22f0ff" stroke-width="1.3" />
        <circle cx="32" cy="32" r="2.5" fill="#ff2bd6" />
        <circle cx="32" cy="32" r="1.1" fill="#fff" />
        <path d="M14 20 20 24M50 44 44 40M50 20 44 24M14 44l6-4" stroke="#ffb020" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </span>
    <span class="chaos-glyph chaos-glyph-8">
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cg8-a" x1="16" y1="10" x2="48" y2="54" gradientUnits="userSpaceOnUse">
            <stop stop-color="#b8ff3c" />
            <stop offset="0.5" stop-color="#22f0ff" />
            <stop offset="1" stop-color="#ff2bd6" />
          </linearGradient>
        </defs>
        <path d="M32 8 48 20v24L32 56 16 44V20Z" stroke="url(#cg8-a)" stroke-width="1.8" stroke-linejoin="round" fill="#22f0ff" fill-opacity="0.08" />
        <path d="M32 16 42 23v18L32 48 22 41V23Z" stroke="#c026ff" stroke-width="1.2" stroke-linejoin="round" opacity="0.8" />
        <path d="M32 8v48M16 20l32 24M48 20 16 44" stroke="#ffb020" stroke-width="1" opacity="0.45" />
        <circle cx="32" cy="32" r="3" fill="#ff2bd6" />
        <circle cx="32" cy="32" r="1.2" fill="#fff" />
        <circle cx="24" cy="26" r="1.2" fill="#b8ff3c" />
        <circle cx="40" cy="38" r="1.2" fill="#22f0ff" />
      </svg>
    </span>
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
  </div>
  <div class="cyber-frame" aria-hidden="true">
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
    overflow: hidden;
  }

  .chaos-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(18px);
    opacity: 0.55;
    mix-blend-mode: screen;
    animation: chaos-orb-drift 7s ease-in-out infinite;
  }
  .chaos-orb-1 {
    width: 9rem;
    height: 9rem;
    top: 6%;
    left: 4%;
    background: radial-gradient(circle, rgba(192, 38, 255, 0.75) 0%, transparent 70%);
    animation-duration: 6.2s;
  }
  .chaos-orb-2 {
    width: 7rem;
    height: 7rem;
    top: 58%;
    right: 6%;
    background: radial-gradient(circle, rgba(34, 240, 255, 0.7) 0%, transparent 70%);
    animation-duration: 8.4s;
    animation-delay: -2s;
  }
  .chaos-orb-3 {
    width: 6rem;
    height: 6rem;
    bottom: 10%;
    left: 28%;
    background: radial-gradient(circle, rgba(255, 43, 214, 0.65) 0%, transparent 70%);
    animation-duration: 5.5s;
    animation-delay: -1.2s;
  }
  .chaos-orb-4 {
    width: 5rem;
    height: 5rem;
    top: 28%;
    right: 30%;
    background: radial-gradient(circle, rgba(184, 255, 60, 0.55) 0%, transparent 70%);
    animation-duration: 9s;
    animation-delay: -3.5s;
  }
  .chaos-orb-5 {
    width: 8rem;
    height: 8rem;
    top: 40%;
    left: 42%;
    background: radial-gradient(circle, rgba(255, 176, 32, 0.4) 0%, transparent 72%);
    animation-duration: 7.8s;
    animation-delay: -4.2s;
    opacity: 0.4;
  }

  .chaos-shard {
    position: absolute;
    width: 2px;
    height: 3.5rem;
    border-radius: 2px;
    opacity: 0.55;
    filter: drop-shadow(0 0 6px currentColor);
    animation: chaos-shard-flicker 2.8s steps(2, end) infinite;
  }
  .chaos-shard-1 {
    top: 18%;
    left: 22%;
    background: linear-gradient(180deg, #22f0ff, transparent);
    color: #22f0ff;
    --shard-rot: 28deg;
    animation-delay: 0s;
  }
  .chaos-shard-2 {
    top: 52%;
    right: 18%;
    height: 2.6rem;
    background: linear-gradient(180deg, #ff2bd6, transparent);
    color: #ff2bd6;
    --shard-rot: -40deg;
    animation-duration: 2.1s;
    animation-delay: -0.7s;
  }
  .chaos-shard-3 {
    bottom: 22%;
    left: 55%;
    height: 4rem;
    background: linear-gradient(180deg, #b8ff3c, transparent);
    color: #b8ff3c;
    --shard-rot: 12deg;
    animation-duration: 3.4s;
    animation-delay: -1.4s;
  }

  .chaos-glyph {
    position: absolute;
    width: clamp(2.1rem, 5vw, 3.4rem);
    height: clamp(2.1rem, 5vw, 3.4rem);
    opacity: 0.72;
    filter: drop-shadow(0 0 8px rgba(192, 38, 255, 0.45))
      drop-shadow(0 0 16px rgba(34, 240, 255, 0.2));
    animation:
      chaos-float 7s cubic-bezier(0.4, 0, 0.2, 1) infinite,
      chaos-glyph-glitch 4.5s steps(1, end) infinite;
  }

  .chaos-glyph svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }

  .chaos-glyph-1 {
    top: 10%;
    left: 6%;
    animation-duration: 6.2s, 3.8s;
  }
  .chaos-glyph-2 {
    top: 64%;
    left: 12%;
    animation-duration: 8.5s, 5.2s;
    animation-delay: -2.2s, -1s;
  }
  .chaos-glyph-3 {
    top: 20%;
    right: 9%;
    animation-duration: 7.1s, 4.1s;
    animation-delay: -4s, -0.5s;
  }
  .chaos-glyph-4 {
    bottom: 12%;
    right: 14%;
    animation-duration: 9.2s, 5.6s;
    animation-delay: -1.4s, -2s;
  }
  .chaos-glyph-5 {
    top: 42%;
    left: 44%;
    animation-duration: 6.8s, 3.4s;
    animation-delay: -6s, -1.6s;
    opacity: 0.55;
  }
  .chaos-glyph-6 {
    top: 7%;
    right: 26%;
    animation-duration: 10s, 4.8s;
    animation-delay: -3s, -0.8s;
    opacity: 0.62;
  }
  .chaos-glyph-7 {
    bottom: 28%;
    left: 32%;
    animation-duration: 7.6s, 3.9s;
    animation-delay: -2.8s, -1.2s;
    opacity: 0.58;
  }
  .chaos-glyph-8 {
    top: 34%;
    right: 38%;
    animation-duration: 8.8s, 5s;
    animation-delay: -5s, -2.4s;
    opacity: 0.5;
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
  :global(:root[data-ui-theme="cyberpunk"]) .cyber-extras,
  :global(:root[data-ui-theme="cyberpunk"]) .cyber-frame {
    display: block;
  }

  /* Atmosphäre hinter dem Chat — darf Text nicht überdecken */
  .cyber-extras {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    display: none;
    overflow: hidden;
    border-radius: inherit;
  }

  /* Nur Chrom-Rahmen / HUD / Ecken über dem Shell */
  .cyber-frame {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
    display: none;
    overflow: hidden;
    border-radius: inherit;
  }

  .cyber-carbon {
    position: absolute;
    inset: 0;
    opacity: 0.12;
    background-image:
      url("data:image/svg+xml,%3Csvg width='48' height='48' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 24h48M24 0v48' stroke='%2300f0ff' stroke-width='0.45' opacity='0.4'/%3E%3Cpath d='M0 0l48 48M48 0L0 48' stroke='%23ff4500' stroke-width='0.35' opacity='0.25'/%3E%3C/svg%3E"),
      repeating-linear-gradient(
        0deg,
        rgba(0, 240, 255, 0.04) 0px,
        rgba(0, 240, 255, 0.04) 1px,
        transparent 1px,
        transparent 3px
      );
    background-size: 48px 48px, 100% 100%;
    mix-blend-mode: screen;
  }

  .cyber-bloom {
    position: absolute;
    border-radius: 50%;
    filter: blur(64px);
    pointer-events: none;
    opacity: 0.4;
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
    background: radial-gradient(circle, rgba(255, 69, 0, 0.45) 0%, transparent 70%);
  }
  .cyber-bloom-c {
    width: 28%;
    height: 22%;
    left: 38%;
    top: 42%;
    background: radial-gradient(circle, rgba(250, 255, 0, 0.22) 0%, transparent 70%);
    opacity: 0.28;
  }

  .cyber-grid {
    position: absolute;
    left: -30%;
    right: -30%;
    bottom: -12%;
    height: 46%;
    background-image:
      linear-gradient(rgba(0, 240, 255, 0.28) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 69, 0, 0.18) 1px, transparent 1px);
    background-size: 44px 44px;
    transform: perspective(420px) rotateX(62deg) translateZ(0);
    transform-origin: 50% 0%;
    mask-image: linear-gradient(180deg, transparent 0%, #000 34%, #000 100%);
    -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 34%, #000 100%);
    animation: cyber-grid-scroll 14s linear infinite;
    opacity: 0.35;
    will-change: transform;
  }

  .cyber-hex {
    position: absolute;
    inset: 0;
    opacity: 0.1;
    background-image: url("data:image/svg+xml,%3Csvg width='56' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M28 0 L56 16 L56 50 L28 66 L0 50 L0 16 Z' fill='none' stroke='%2300f0ff' stroke-width='0.65'/%3E%3C/svg%3E");
    background-size: 56px 100px;
  }

  .cyber-sheen {
    position: absolute;
    inset: -20%;
    background: linear-gradient(
      115deg,
      transparent 36%,
      rgba(255, 255, 255, 0.06) 44%,
      rgba(0, 240, 255, 0.18) 50%,
      rgba(255, 255, 255, 0.08) 56%,
      transparent 64%
    );
    transform: translateX(-40%);
    animation: cyber-sheen-sweep 12s ease-in-out infinite;
    mix-blend-mode: screen;
    opacity: 0.7;
    will-change: transform, opacity;
  }

  @keyframes cyber-sheen-sweep {
    0%,
    12% {
      transform: translateX(-48%) translateY(4%);
      opacity: 0;
    }
    22% {
      opacity: 0.75;
    }
    52% {
      transform: translateX(30%) translateY(-2%);
      opacity: 0.55;
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
    color: rgba(0, 240, 255, 0.7);
    text-shadow: 0 0 8px rgba(0, 240, 255, 0.45);
    opacity: 0.85;
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
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    /* Kein dual-background: ohne reliable background-clip füllt der Gradient die ganze Seite. */
    box-shadow:
      inset 0 0 0 1px rgba(0, 240, 255, 0.55),
      inset 0 0 0 2px rgba(255, 69, 0, 0.28),
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 0 -1px 0 rgba(255, 69, 0, 0.18),
      inset 0 0 28px rgba(0, 240, 255, 0.08);
    opacity: 0.95;
  }

  .cyber-corner {
    position: absolute;
    width: 28px;
    height: 28px;
    opacity: 0.92;
  }

  .cyber-corner-tl {
    top: 5px;
    left: 5px;
    border-top: 2.5px solid rgba(0, 240, 255, 0.9);
    border-left: 2.5px solid rgba(0, 240, 255, 0.9);
    box-shadow: 0 0 10px rgba(0, 240, 255, 0.5);
  }
  .cyber-corner-tr {
    top: 5px;
    right: 5px;
    border-top: 2.5px solid rgba(255, 69, 0, 0.9);
    border-right: 2.5px solid rgba(255, 69, 0, 0.9);
    box-shadow: 0 0 10px rgba(255, 69, 0, 0.5);
  }
  .cyber-corner-bl {
    bottom: 5px;
    left: 5px;
    border-bottom: 2.5px solid rgba(250, 255, 0, 0.8);
    border-left: 2.5px solid rgba(250, 255, 0, 0.8);
    box-shadow: 0 0 10px rgba(250, 255, 0, 0.4);
  }
  .cyber-corner-br {
    bottom: 5px;
    right: 5px;
    border-bottom: 2.5px solid rgba(0, 240, 255, 0.9);
    border-right: 2.5px solid rgba(0, 240, 255, 0.9);
    box-shadow: 0 0 10px rgba(0, 240, 255, 0.5);
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

  /* ── Chaos: deep black + neon glitch layers + colorful glyphs ── */
  :global(:root[data-ui-theme="chaos"]) .app-window {
    background: #020106;
  }
  :global(:root[data-ui-theme="chaos"]) .aurora-layer {
    opacity: 0.55;
    mix-blend-mode: screen;
    animation:
      aurora-breathe 11s ease-in-out infinite,
      chaos-hue 14s linear infinite;
  }
  :global(:root[data-ui-theme="chaos"]) .aurora-layer-a {
    background: radial-gradient(ellipse 70% 55% at 20% 30%, rgba(192, 38, 255, 0.35), transparent 60%);
  }
  :global(:root[data-ui-theme="chaos"]) .aurora-layer-b {
    background: radial-gradient(ellipse 65% 50% at 78% 60%, rgba(34, 240, 255, 0.28), transparent 58%);
  }
  :global(:root[data-ui-theme="chaos"]) .aurora-layer-c {
    background: radial-gradient(ellipse 55% 45% at 50% 80%, rgba(255, 43, 214, 0.22), transparent 55%);
  }
  :global(:root[data-ui-theme="chaos"]) .chaos-extras {
    display: block;
  }
  :global(:root[data-ui-theme="chaos"]) .theme-overlay {
    opacity: 1;
    background:
      repeating-linear-gradient(
        0deg,
        transparent 0,
        transparent 2px,
        rgba(192, 38, 255, 0.045) 2px,
        rgba(192, 38, 255, 0.045) 3px
      ),
      repeating-linear-gradient(
        90deg,
        transparent 0,
        transparent 5px,
        rgba(34, 240, 255, 0.03) 5px,
        rgba(34, 240, 255, 0.03) 6px
      ),
      radial-gradient(ellipse 90% 70% at 15% 25%, rgba(192, 38, 255, 0.18), transparent 55%),
      radial-gradient(ellipse 70% 55% at 85% 75%, rgba(34, 240, 255, 0.14), transparent 50%),
      radial-gradient(ellipse 50% 40% at 50% 50%, rgba(255, 43, 214, 0.08), transparent 60%);
    animation: chaos-overlay-drift 12s ease-in-out infinite alternate;
  }

  @keyframes chaos-overlay-drift {
    0% {
      transform: translate3d(-2%, -1.5%, 0) scale(1.06) skewX(-0.4deg);
      opacity: 0.85;
      filter: hue-rotate(0deg);
    }
    35% {
      transform: translate3d(1.8%, 1%, 0) scale(1.1) skewX(0.6deg);
      opacity: 1;
      filter: hue-rotate(25deg);
    }
    70% {
      transform: translate3d(-1%, 2%, 0) scale(1.05) skewX(-0.3deg);
      opacity: 0.92;
      filter: hue-rotate(-15deg);
    }
    100% {
      transform: translate3d(2%, -1%, 0) scale(1.09) skewX(0.5deg);
      opacity: 1;
      filter: hue-rotate(40deg);
    }
  }

  @keyframes chaos-hue {
    0% {
      filter: blur(64px) hue-rotate(0deg) saturate(1.2) brightness(0.9);
    }
    25% {
      filter: blur(70px) hue-rotate(40deg) saturate(1.45) brightness(1.05);
    }
    50% {
      filter: blur(60px) hue-rotate(-20deg) saturate(1.3) brightness(0.95);
    }
    75% {
      filter: blur(74px) hue-rotate(55deg) saturate(1.5) brightness(1.1);
    }
    100% {
      filter: blur(64px) hue-rotate(0deg) saturate(1.2) brightness(0.9);
    }
  }

  @keyframes chaos-float {
    0% {
      transform: translate3d(0, 0, 0) rotate(-14deg) scale(1) skewX(0deg);
    }
    12% {
      transform: translate3d(14px, -22px, 0) rotate(12deg) scale(1.12) skewX(-2deg);
    }
    28% {
      transform: translate3d(-18px, -8px, 0) rotate(-22deg) scale(0.9) skewX(3deg);
    }
    45% {
      transform: translate3d(8px, 16px, 0) rotate(8deg) scale(1.08) skewX(-1deg);
    }
    62% {
      transform: translate3d(-12px, 10px, 0) rotate(-10deg) scale(0.96) skewX(2deg);
    }
    80% {
      transform: translate3d(16px, -6px, 0) rotate(18deg) scale(1.06) skewX(-2.5deg);
    }
    100% {
      transform: translate3d(0, 0, 0) rotate(-14deg) scale(1) skewX(0deg);
    }
  }

  @keyframes chaos-glyph-glitch {
    0%,
    100% {
      filter: drop-shadow(0 0 8px rgba(192, 38, 255, 0.45))
        drop-shadow(0 0 16px rgba(34, 240, 255, 0.2));
      opacity: 0.72;
    }
    18% {
      filter: drop-shadow(-3px 0 0 rgba(255, 43, 214, 0.7))
        drop-shadow(3px 0 0 rgba(34, 240, 255, 0.7));
      opacity: 0.95;
    }
    19% {
      filter: drop-shadow(0 0 10px rgba(184, 255, 60, 0.5));
      opacity: 0.55;
    }
    42% {
      filter: drop-shadow(0 0 14px rgba(34, 240, 255, 0.65))
        drop-shadow(0 0 22px rgba(192, 38, 255, 0.35));
      opacity: 0.85;
    }
    61% {
      filter: drop-shadow(4px 1px 0 rgba(255, 176, 32, 0.55))
        drop-shadow(-3px -1px 0 rgba(255, 43, 214, 0.55));
      opacity: 0.9;
    }
    78% {
      filter: drop-shadow(0 0 8px rgba(192, 38, 255, 0.4));
      opacity: 0.48;
    }
  }

  @keyframes chaos-orb-drift {
    0%,
    100% {
      transform: translate3d(0, 0, 0) scale(1);
      opacity: 0.45;
    }
    20% {
      transform: translate3d(28px, -36px, 0) scale(1.25);
      opacity: 0.7;
    }
    45% {
      transform: translate3d(-40px, 18px, 0) scale(0.85);
      opacity: 0.35;
    }
    70% {
      transform: translate3d(18px, 32px, 0) scale(1.15);
      opacity: 0.62;
    }
  }

  @keyframes chaos-shard-flicker {
    0%,
    100% {
      opacity: 0.15;
      transform: scaleY(0.6) rotate(var(--shard-rot, 20deg));
    }
    20% {
      opacity: 0.85;
      transform: scaleY(1.2) rotate(calc(var(--shard-rot, 20deg) + 8deg));
    }
    40% {
      opacity: 0.2;
      transform: scaleY(0.4) rotate(calc(var(--shard-rot, 20deg) - 12deg));
    }
    65% {
      opacity: 0.9;
      transform: scaleY(1.35) rotate(calc(var(--shard-rot, 20deg) + 4deg));
    }
    80% {
      opacity: 0.35;
      transform: scaleY(0.8) rotate(var(--shard-rot, 20deg));
    }
  }

  /* ── Reduce-Motion-Kill-Switch respektieren ── */
  :global(:root[data-reduce-motion="true"]) .chaos-glyph,
  :global(:root[data-reduce-motion="true"]) .chaos-orb,
  :global(:root[data-reduce-motion="true"]) .chaos-shard,
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
    .chaos-glyph,
    .chaos-orb,
    .chaos-shard,
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
