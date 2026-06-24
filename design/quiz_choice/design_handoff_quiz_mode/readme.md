# Terragotcha Design System

Design foundations for **Terragotcha**, a mobile geography quiz app built on a three.js
3D globe. This system formalizes the colors, typography, and motion established in the
loading-screen design so the rest of the app (and marketing) stays consistent.

**Source of truth:** `Terragotcha Loading.dc.html` (the splash/loading screen) and two
in-app screenshots of the live globe. Consumers should link the single entry file
`styles.css`, which `@import`s every token file.

---

## Content fundamentals
- **Voice:** plain, encouraging, educational — not jargony, not gamer-hype.
- **Casing:** the **wordmark is the only mixed-case display element**. All supporting
  labels (taglines, status text, section labels) are **UPPERCASE with wide tracking**
  (cartographic "map label" feel).
- **The wordmark** always splits "Terra" (light, 400) from "gotcha" (semibold, 600) — a
  subtle weight contrast, optionally a warm amber tint on "gotcha" on dark surfaces.
- **No emoji.** Iconography is geometric/photographic, not decorative.
- Example copy: tagline "Learn geography through quizzes"; loading status "Loading the world".

## Visual foundations
- **Background:** deep navy, almost always the `--bg-gradient` radial (lighter top-center
  fading to near-black). Solid `--navy-800` (#0a1c30) is the base.
- **Accent:** a single warm **amber** family pulled straight from the rendered globe and
  the "Take Quiz" button — used for primary actions, progress, and glows. No second accent
  hue; vary lightness within amber instead.
- **Type:** **Fredoka** (rounded, friendly) for the wordmark/display; **Archivo** (clean
  grotesque) for all UI labels and body. Two families only.
- **Imagery:** warm, photographic globe over cool navy — the central brand image. The
  packaged `assets/globe.png` is masked to a soft feathered circle so it blends into navy.
- **Motion:** gentle and continuous, **never bouncy**. Fade-up entrances (0.8s, staggered),
  a slow wordmark shimmer (4s linear), a soft glow pulse (3.5s), and an indeterminate
  progress sweep (1.5s). Easing `cubic-bezier(0.4,0,0.2,1)`.
- **Shape:** pill (999px) for buttons and bars; 16px radius for cards/panels; 3px for thin
  tracks. Float shadow `0 8px 40px rgba(0,0,0,.28)` on elevated surfaces.
- **Hover/press:** amber actions go `amber-500 → amber-600` on hover, `amber-700` on press.

## Iconography
**Icon set: [Phosphor](https://phosphoricons.com/)** — chosen for its rounded terminals and
friendly geometry, which match the Fredoka wordmark. Free under the **MIT license**.

- **Default weight: `regular`** (`<i class="ph ph-globe"></i>`).
- **`bold`** for affirmations and small marks (correct/wrong, inline emphasis): `ph-bold ph-check`.
- **`fill` + amber (`--amber-500`)** for active, selected, and achievement states (current globe, earned trophy).
- Icon color is `--text-high` by default, `--text-low` for de-emphasized, `--amber-500` when active.
- Sizes: 16–18px inline, 24–26px standalone, ~40px feature.

Load from CDN (pin the version):
```html
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css">
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/bold/style.css">
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css">
```
Common app icons: `globe-hemisphere-west`, `compass`, `map-pin`, `flag`, `trophy`, `medal`,
`fire` (streak), `chart-bar` (stats), `calendar-dots` (daily), `clock` (timer), `question`,
`check`, `x`, `gear-six` (settings), `arrow-right`, `share-network`. No emoji.

## Tokens
- `tokens/colors.css` — navy surfaces, amber accent, text hierarchy, lines/glow + semantic aliases
- `tokens/typography.css` — font families, weights, display & UI scales, tracking
- `tokens/effects.css` — radius, shadow, motion (durations + easing)
- `tokens/fonts.css` — Fredoka + Archivo via Google Fonts

## Font note (please confirm)
Fredoka and Archivo are loaded from **Google Fonts** (no font binaries are bundled). These
are the intended families, available on Google Fonts — but if you want them self-hosted,
send the licensed font files and I'll add `@font-face` rules and bundle them.

## Index
- `styles.css` — entry point (link this)
- `tokens/` — colors, typography, effects, fonts
- `guidelines/` — specimen cards (Colors, Type, Spacing, Brand) shown in the Design System tab
- `assets/globe.png` — the brand globe mark
- `Terragotcha Loading.dc.html` — the originating loading-screen design
- `SKILL.md` — makes this folder usable as a Claude Code / Agent Skill

## Caveats
- Foundations only — no reusable React component library or full UI kits yet (the app has
  one designed screen so far). Easy to grow as more screens are designed.
- Icon set and self-hosted fonts are open questions (see above).
