# Cyberpunk Neon Lacquer (Showpiece) — Design Spec

**Date:** 2026-07-11  
**Status:** Approved for planning  
**Scope:** Visual upgrade of the existing `cyberpunk` UI theme only

## Goal

Make the Cyberpunk theme look like wet neon lacquer on chrome: strong specular highlights, chrome edges, richer technical textures, and more glow — a deliberate showpiece look — while keeping chat text readable and respecting `reduce-motion`.

## Decisions

| Decision | Choice |
|---|---|
| Aesthetic | Neon Lacquer (reflections, chrome edges, wet lacquer, glow) |
| Intensity | Showpiece (max chrome/glow; okay to feel slightly over-the-top) |
| Approach | Extras-layer upgrade + `themes.css` surface polish (no Canvas/WebGL) |
| Theme ID | Keep `cyberpunk` (no rename, no new theme entry) |

## Out of scope

- Other UI themes (`aurora`, `minimal`, `blossom`, `papyrus`, `chaos`)
- Sound theme mapping / audio assets
- Protocol/settings schema changes
- Canvas, WebGL, or particle systems

## Architecture

Two touch points, matching the current theme system:

1. **`src/App.svelte`** — window atmosphere via `.cyber-extras` (decorative layers, `pointer-events: none`)
2. **`src/themes.css`** — component surfaces under `:root[data-ui-theme="cyberpunk"]`

No new theme registry entries. Activation remains `document.documentElement[data-ui-theme="cyberpunk"]`.

## Atmosphere layers (`.cyber-extras`)

Keep existing layers; intensify and add lacquer/chrome layers.

| Layer | Role |
|---|---|
| Lacquer sheen (new) | Diagonal specular sweep (~12–16s), light sliding over wet lacquer |
| Chrome rim (new) | Inner window frame: cyan→orange chrome gradient + soft bloom |
| Carbon/mesh (new) | Fine technical texture (CSS/SVG data-URI), subtle under the grid |
| Bloom orbs (new) | 2–3 soft cyan/orange glow spots (static or very slow) |
| Grid horizon (existing) | Keep; raise opacity/glow slightly |
| Hex mesh (existing) | Keep; slightly more visible |
| Beam (existing) | Keep; slightly stronger |
| HUD labels + corners (existing) | Keep; stronger neon `text-shadow` / chrome corners |

Palette stays cyan `#00f0ff`, orange `#ff4500`, yellow accent `#faff00` — used more aggressively, not replaced.

## UI surfaces (`themes.css`)

- **Status bar / composer / cards:** Multi-stop lacquer fills (dark base + cyan specular top + orange bottom edge), chrome border via gradient border/box-shadow stack, stronger neon bloom.
- **Primary buttons:** Stronger existing sheen sweep, brighter specular, chrome rim, heavier glow on hover.
- **Secondary / ghost:** Thin chrome edge + subtle lacquer fill (no full neon wash).
- **User bubbles:** Dark lacquer + cyan rim + light specular; text stays high-contrast.
- **Assistant bubbles:** Darker glass + fine chrome hairline; no bright neon fill.
- **Dialogs / fixed panels:** Solid lacquer fill + chrome frame + inset specular. Do **not** add layout-breaking `position` / `::before` chrome on fixed overlays (preserve current modal safety rules).
- **Typography:** Keep Orbitron / Share Tech Mono; stronger neon `text-shadow` on HUD labels and headings.

## Constraints

- CSS-only: gradients, shadows, masks, SVG data-URIs, existing keyframes patterns.
- Only selectors under `data-ui-theme="cyberpunk"` (plus shared reduce-motion hooks that already target cyber layers).
- `data-reduce-motion="true"` and `prefers-reduced-motion: reduce`: disable sheen/beam/grid (and any new) animations; keep static lacquer/chrome look.
- Do not break modal/panel stacking or positioning (same exclusions as today for dialogs, embed modal, onboarding, history/integrations/warnings/overflow panels).
- Chat readability is non-negotiable: bubble and input contrast must remain usable.

## Acceptance criteria

1. Selecting Cyberpunk in Settings shows lacquer sheen, chrome rim, carbon/mesh texture, and stronger bloom without blocking clicks.
2. Status bar, composer, cards, and primary buttons read as glossy chrome/lacquer, not flat neon outlines.
3. Chat bubbles remain readable (user and assistant).
4. Open dialogs stay usable (no broken layout from decorative pseudo-elements).
5. With reduce-motion enabled, animated sweeps stop; static gloss/chrome remains.
6. Other themes are visually unchanged.

## Implementation notes

- Prefer extending existing `.cyber-extras` markup with a few new child divs rather than restructuring the window shell.
- Mirror existing reduce-motion kill lists in `App.svelte` / `themes.css` for any new animated classes.
- Avoid introducing new fonts or external image assets; use inline SVG data-URIs if needed for mesh/carbon.
