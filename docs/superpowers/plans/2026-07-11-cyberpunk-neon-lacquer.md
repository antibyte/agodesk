# Cyberpunk Neon Lacquer (Showpiece) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing `cyberpunk` UI theme to a showpiece Neon Lacquer look (wet lacquer, chrome edges, technical textures, stronger glow) without changing other themes or theme IDs.

**Architecture:** Extend `.cyber-extras` in `App.svelte` with new decorative layers (sheen, chrome rim, carbon/mesh, bloom orbs) and intensify HUD surfaces in `themes.css` under `:root[data-ui-theme="cyberpunk"]`. CSS-only; respect existing modal safety exclusions and reduce-motion kill switches.

**Tech Stack:** Svelte 5, CSS (gradients, shadows, masks, SVG data-URIs, keyframes), existing `data-ui-theme` / `data-reduce-motion` attributes

**Spec:** `docs/superpowers/specs/2026-07-11-cyberpunk-neon-lacquer-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `src/App.svelte` | Markup for new cyber layers; layer CSS/keyframes; reduce-motion hooks for new animations |
| `src/themes.css` | Lacquer/chrome surfaces for status bar, composer, cards, buttons, bubbles, dialogs |

No new files. No protocol/i18n/theme-registry changes.

---

### Task 1: Atmosphere layers in `.cyber-extras`

**Files:**
- Modify: `src/App.svelte` (markup ~207–219 and styles ~728–879, reduce-motion ~1362–1393)

- [ ] **Step 1: Add new layer elements inside `.cyber-extras`**

Replace the current block:

```svelte
  <div class="cyber-extras" aria-hidden="true">
    <div class="cyber-grid"></div>
    <div class="cyber-hex"></div>
    <div class="cyber-beam"></div>
    <span class="cyber-hud cyber-hud-tl">SYS::ONLINE</span>
    <span class="cyber-hud cyber-hud-tr">AURA::LINK</span>
    <span class="cyber-hud cyber-hud-bl">NET::SYNC</span>
    <span class="cyber-hud cyber-hud-br">SIG::OK</span>
    <span class="cyber-corner cyber-corner-tl"></span>
    <span class="cyber-corner cyber-corner-tr"></span>
    <span class="cyber-corner cyber-corner-bl"></span>
    <span class="cyber-corner cyber-corner-br"></span>
  </div>
```

with:

```svelte
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
```

Layer order (bottom → top): carbon → bloom → grid → hex → sheen → beam → chrome rim → HUD/corners.

- [ ] **Step 2: Add CSS for carbon, bloom, sheen, chrome rim; intensify existing layers**

Insert after `.cyber-extras { ... }` (before `.cyber-grid`) and adjust existing rules as follows.

**Carbon / mesh texture:**

```css
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
```

**Bloom orbs:**

```css
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
```

**Lacquer sheen sweep:**

```css
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
```

**Chrome rim:**

```css
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
```

**Intensify existing layers** (edit in place):

- `.cyber-grid`: raise `opacity` from `0.32` → `0.48`; strengthen grid line alphas slightly (`0.2`/`0.14` → `0.32`/`0.22`).
- `.cyber-hex`: raise `opacity` from `0.06` → `0.12`.
- `.cyber-beam`: stronger gradient and `box-shadow: 0 0 16px rgba(0, 240, 255, 0.55)`.
- `.cyber-hud`: stronger `text-shadow` (e.g. `0 0 10px rgba(0, 240, 255, 0.55)`); corner colors keep cyan/orange/yellow but raise opacity to `0.9` and glow to `0.45`.
- `.cyber-corner-*`: width/height `26px`; border width `2.5px`; stronger box-shadow glow.

Also bump `:global(:root[data-ui-theme="cyberpunk"]) .theme-overlay` scanline alpha slightly (`0.022` → `0.035`) and orange floor glow (`0.05` → `0.1`).

- [ ] **Step 3: Wire reduce-motion for new animated layers**

In both kill lists (`:global(:root[data-reduce-motion="true"]) ...` and `@media (prefers-reduced-motion: reduce)`), add `.cyber-sheen` next to `.cyber-grid` / `.cyber-beam`:

```css
  :global(:root[data-reduce-motion="true"]) .cyber-grid,
  :global(:root[data-reduce-motion="true"]) .cyber-beam,
  :global(:root[data-reduce-motion="true"]) .cyber-sheen,
```

and the same for the `@media` block.

Static layers (carbon, bloom, chrome rim) stay visible with no animation.

- [ ] **Step 4: Visual smoke check**

Run: `npm run tauri` (or existing dev session), set UI theme to Cyberpunk.

Expected:
- Diagonal sheen sweeps slowly across the window
- Chrome gradient rim inside the window edge
- Carbon/mesh faintly visible
- Soft cyan/orange bloom spots
- Grid/hex/HUD/corners more intense than before
- Clicks still reach chat/settings (extras remain `pointer-events: none`)

- [ ] **Step 5: Commit**

```bash
git add src/App.svelte
git commit -m "feat(theme): add cyberpunk neon lacquer atmosphere layers"
```

---

### Task 2: Lacquer / chrome UI surfaces in `themes.css`

**Files:**
- Modify: `src/themes.css` (`:root[data-ui-theme="cyberpunk"]` block ~265–583 and reduce-motion cyber rules ~1084–1088)

- [ ] **Step 1: Strengthen CSS variables for gloss**

In `:root[data-ui-theme="cyberpunk"]`, update (keep other vars unless noted):

```css
  --color-surface: rgba(2, 14, 20, 0.88);
  --color-surface-solid: #041820;
  --glass-surface: rgba(1, 12, 18, 0.82);
  --glass-border: rgba(0, 240, 255, 0.48);
  --glass-highlight: rgba(255, 255, 255, 0.14);
  --color-panel-shadow:
    0 0 0 1px rgba(0, 240, 255, 0.35),
    0 0 36px rgba(0, 240, 255, 0.22),
    0 0 64px rgba(255, 69, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    inset 0 -1px 0 rgba(255, 69, 0, 0.14);
  --shadow-1: 0 0 14px rgba(0, 240, 255, 0.28);
  --shadow-2: 0 0 36px rgba(255, 69, 0, 0.28);
  --shadow-3: 0 0 64px rgba(0, 240, 255, 0.36);
```

- [ ] **Step 2: Lacquer fills on status bar, composer, cards**

Replace the shared HUD surface rules for `.status-bar`, `.input-box`, `.ui-card:not(dialog)`, allowed `.glass-panel` / `.glass-panel-fixed` with a richer lacquer stack:

```css
:root[data-ui-theme="cyberpunk"] .status-bar,
:root[data-ui-theme="cyberpunk"] .input-box {
  position: relative;
  border-color: rgba(0, 240, 255, 0.5);
  background-color: rgba(2, 12, 18, 0.92);
  background-image:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.14) 0%,
      rgba(0, 240, 255, 0.08) 12%,
      transparent 42%,
      rgba(255, 69, 0, 0.06) 100%
    ),
    linear-gradient(90deg, rgba(0, 240, 255, 0.07) 1px, transparent 1px),
    linear-gradient(rgba(255, 69, 0, 0.05) 1px, transparent 1px);
  background-size: 100% 100%, 22px 22px, 22px 22px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    inset 0 -1px 0 rgba(255, 69, 0, 0.18),
    0 0 0 1px rgba(0, 240, 255, 0.2),
    0 0 28px rgba(0, 240, 255, 0.2),
    0 0 48px rgba(255, 69, 0, 0.1);
}
```

Apply the same lacquer `background-image` / `box-shadow` pattern to the existing `.ui-card:not(dialog)` / `.glass-panel:not(...)` / `.glass-panel-fixed` block (still **without** forcing `position: relative` on cards that must stay layout-safe).

Keep modal exclusions (`dialog`, `.embed-modal`, `.onboarding-dialog`, history/integrations/warnings/overflow panels) on solid lacquer without grid:

```css
:root[data-ui-theme="cyberpunk"] dialog[open] {
  border: 1px solid transparent;
  background:
    linear-gradient(#041820, #041820) padding-box,
    linear-gradient(
        135deg,
        rgba(0, 240, 255, 0.85),
        rgba(255, 255, 255, 0.35),
        rgba(255, 69, 0, 0.75)
      )
      border-box;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    inset 0 -1px 0 rgba(255, 69, 0, 0.12),
    0 0 0 1px rgba(0, 240, 255, 0.2),
    0 0 48px rgba(0, 240, 255, 0.28);
}
```

- [ ] **Step 3: Buttons, bubbles, focus, headings**

**Primary button** — keep sheen `::after`, intensify:

```css
:root[data-ui-theme="cyberpunk"] .ui-btn-primary {
  background: linear-gradient(135deg, #00f0ff 0%, #1a9fff 38%, #ff4500 100%);
  border: 1px solid rgba(255, 255, 255, 0.35);
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.85);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    inset 0 -1px 0 rgba(0, 0, 0, 0.25),
    0 0 18px rgba(0, 240, 255, 0.35),
    0 0 32px rgba(255, 69, 0, 0.2);
  position: relative;
  overflow: hidden;
}
```

Raise hover `::after` specular white stop to `0.35` and hover glow accordingly.

**Ghost buttons in dialogs** — chrome edge:

```css
:root[data-ui-theme="cyberpunk"] dialog[open] .ui-btn.ghost {
  border-color: rgba(0, 240, 255, 0.45);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(0, 240, 255, 0.06));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
```

**User bubble:**

```css
:root[data-ui-theme="cyberpunk"] .user .bubble {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, transparent 28%),
    linear-gradient(145deg, #042a32 0%, #0a1218 48%, #2a1208 100%);
  border: 1px solid rgba(0, 240, 255, 0.55);
  box-shadow:
    0 0 0 1px rgba(255, 69, 0, 0.22),
    0 0 22px rgba(0, 240, 255, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  color: var(--color-user-text);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.45);
}
```

**Assistant bubble:**

```css
:root[data-ui-theme="cyberpunk"] .assistant .bubble {
  background: linear-gradient(180deg, rgba(0, 240, 255, 0.06), rgba(2, 18, 26, 0.92));
  border: 1px solid rgba(0, 240, 255, 0.28);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 0 0 1px rgba(0, 0, 0, 0.25);
  color: var(--color-assistant-text);
}
```

**Composer focus:**

```css
:root[data-ui-theme="cyberpunk"] .input-box:focus-within {
  border-color: rgba(0, 240, 255, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 0 0 1px rgba(0, 240, 255, 0.28),
    0 0 28px rgba(0, 240, 255, 0.35),
    0 0 48px rgba(255, 69, 0, 0.14);
}
```

**Dialog headings:**

```css
:root[data-ui-theme="cyberpunk"] dialog[open] h2 {
  text-shadow:
    0 0 12px rgba(0, 240, 255, 0.55),
    0 0 24px rgba(0, 240, 255, 0.25);
}
```

- [ ] **Step 4: Extend reduce-motion cyber rules if needed**

If any new animated surface pseudo-elements are added, append them to the existing list:

```css
:root[data-reduce-motion="true"][data-ui-theme="cyberpunk"] .input-box:focus-within,
:root[data-reduce-motion="true"][data-ui-theme="cyberpunk"] .status-bar::before,
:root[data-reduce-motion="true"][data-ui-theme="cyberpunk"] .status-bar::after,
:root[data-reduce-motion="true"][data-ui-theme="cyberpunk"] .input-box::before,
:root[data-reduce-motion="true"][data-ui-theme="cyberpunk"] .ui-btn-primary::after {
  animation: none !important;
}
```

(No change required if Task 2 adds no new animations beyond existing ones.)

- [ ] **Step 5: Verify + check**

Run: `npm run check`  
Expected: `svelte-check found 0 errors and 0 warnings`

Manual:
1. Cyberpunk theme on — status/composer/cards look wet/chrome
2. Send a chat message — bubbles readable, glossy rim
3. Open a settings dialog — chrome border, usable layout
4. Enable reduce-motion — sheen/beam/grid stop; lacquer/chrome remain

- [ ] **Step 6: Commit**

```bash
git add src/themes.css
git commit -m "feat(theme): polish cyberpunk surfaces with neon lacquer chrome"
```

---

### Task 3: Final acceptance pass

**Files:** none (verification only), unless a small tweak is needed

- [ ] **Step 1: Spec checklist**

Confirm against `docs/superpowers/specs/2026-07-11-cyberpunk-neon-lacquer-design.md`:

1. Lacquer sheen, chrome rim, carbon/mesh, bloom visible; no click blocking
2. Status/composer/cards/primary button read as glossy lacquer/chrome
3. Chat bubbles readable
4. Dialogs usable
5. Reduce-motion disables sweeps; static gloss remains
6. Other themes unchanged (spot-check `minimal` and `aurora`)

- [ ] **Step 2: Commit any final tweaks (only if needed)**

```bash
git add src/App.svelte src/themes.css
git commit -m "fix(theme): fine-tune cyberpunk neon lacquer intensity"
```

If no tweaks: skip commit.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Lacquer sheen layer | Task 1 |
| Chrome rim | Task 1 |
| Carbon/mesh texture | Task 1 |
| Bloom orbs | Task 1 |
| Intensify existing extras | Task 1 |
| Status/composer/cards lacquer | Task 2 |
| Primary/ghost button chrome | Task 2 |
| Bubble readability + gloss | Task 2 |
| Dialog solid lacquer + chrome | Task 2 |
| Reduce-motion for new animations | Task 1 (+ Task 2 if needed) |
| Other themes untouched | Task 1–2 scoped selectors; Task 3 spot-check |
| No Canvas/WebGL / no theme ID change | All tasks |

No placeholders remaining after self-review.
