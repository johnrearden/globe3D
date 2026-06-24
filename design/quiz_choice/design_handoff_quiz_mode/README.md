# Handoff: Quiz Mode Picker (with Globe / Region scope)

## Overview
A redesign of Terragotcha's **quiz-mode picker** — the overlay that appears over the live 3D
globe when a player taps **"Quiz me"**. It lets a player:

1. Pick a **scope** for the questions: the **whole globe**, or a **single continent**.
2. Pick one of **four quiz modes** to start playing.

The new design replaces the previous plain stacked-card list and introduces the scope
control (the previous version had no way to restrict questions by region).

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing the
intended look and behavior, **not production code to copy directly**. `Quiz Mode.dc.html` is a
"Design Component" that runs in a bespoke preview runtime (`support.js`); do **not** ship
`support.js` or the `.dc.html` format.

Your task is to **recreate this design in the Terragotcha app's existing environment** using
its established patterns and component libraries. The app is a mobile geography quiz built on a
three.js 3D globe; implement this as the overlay/sheet shown above that globe. If the relevant
part of the codebase has no established UI framework yet, choose the most appropriate one for
the project and implement there.

The `styles.css` + `tokens/` files **are** the real design system and should be used as the
source of truth for colors, type, and effects (or mapped onto the codebase's existing tokens
if equivalents already exist).

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, and interactions are all
specified below and present in the prototype. Recreate the UI pixel-perfectly using the
codebase's existing libraries and patterns. Exact hex/px values are given throughout.

---

## Screens / Views

### Screen: Quiz Mode Picker overlay
A bottom-sheet style panel that covers most of the screen, sitting over the (dimmed/blurred)
globe. The globe and its glow peek out at the very top above the sheet.

**Frame (for reference only):** the prototype renders inside a 392 × 800 device frame
(40px corner radius) on a neutral backdrop. In the real app this is a full-screen overlay —
**only the contents matter**, not the device frame.

**App canvas behind the sheet:** deep navy with the brand radial gradient
`radial-gradient(120% 80% at 50% 8%, #102a44 0%, #0a1c30 42%, #06121f 100%)`.

#### Layout (top → bottom)
1. **Top chrome** (stays visible above the sheet, `z` above it):
   - **"Quiz me" pill**, top-left, 20px inset from edges, 22px from top.
   - **Settings button** (`gear-six` icon), top-right, same insets.
2. **Globe + glow**, horizontally centered near the top, partially hidden behind the sheet's
   top edge (decorative). 150 × 150 globe image (`assets/globe.png`) with a soft amber radial
   glow that pulses.
3. **The sheet** — absolutely positioned, insets: `top:92px; left:12px; right:12px; bottom:14px`.
   - `border-radius: 28px`, padding `22px 20px 18px`.
   - Background `rgba(11,28,46,0.86)` with `backdrop-filter: blur(16px)`.
   - Border `1px solid rgba(255,255,255,0.09)`.
   - Shadow `0 -2px 0 rgba(255,255,255,0.04) inset, 0 18px 50px rgba(0,0,0,0.46)`.
   - `display:flex; flex-direction:column`.
   - Sheet contents in order:
     - **Grabber** — 38 × 4px pill, `rgba(255,255,255,0.16)`, centered, 16px bottom margin.
     - **Heading block** (centered).
     - **Scope selector**.
     - **Divider** — 1px `rgba(255,255,255,0.07)`, 18px top / 16px bottom margin.
     - **Quiz cards** — vertical flex, `gap:10px`, `overflow-y:auto` (this region scrolls if
       the continent chips expand the content).
     - **Cancel button** — 14px top margin.
4. **Launch toast** — transient confirmation, bottom-center, `z` above everything.

#### Components

**"Quiz me" pill** (top-left)
- Text "Quiz me", Archivo 600, 14px, color `#3a2008`.
- Background `#f59e4b`, padding `9px 18px`, radius `999px`.
- Shadow `0 4px 14px rgba(245,158,75,0.32)`.

**Settings button** (top-right)
- 38 × 38px, radius 11px, background `rgba(10,20,34,0.7)`, border `1px solid rgba(255,255,255,0.08)`.
- Phosphor `gear-six` icon, 18px, color `#a9bccf`.

**Heading block** (centered)
- Title: **"Choose a quiz"** — Fredoka 600, 22px, line-height 1.15, letter-spacing −0.01em, color `#eef2f6`.
- Subtitle: **"PICK A MODE TO START PLAYING"** — Archivo 500, 11px, letter-spacing 0.2em, UPPERCASE, color `#6f86a0`, 7px top margin.

**Scope selector**
- Section label: **"COUNTRIES FROM"** — Archivo 600, 10.5px, letter-spacing 0.16em, UPPERCASE, color `#5c708a`, 9px bottom margin.
- **Segmented control** — a pill container: `display:flex; gap:4px; padding:4px; border-radius:999px; background:rgba(6,18,31,0.55); border:1px solid rgba(255,255,255,0.07)`.
  - Two equal segments (`flex:1`), each: padding `10px 0`, radius `999px`, Archivo 600 13px, centered, icon + label (icon 16px, 7px gap).
    - Segment 1: `globe-hemisphere-west` icon + **"Whole globe"**.
    - Segment 2: `compass` icon + **"By region"**.
  - **Active segment:** background `linear-gradient(180deg,#f7a857,#f59440)`, color `#321a06`, shadow `0 4px 14px rgba(245,158,75,0.30)`.
  - **Idle segment:** transparent background, color `#90a4b8`.
- **Continent chips** — shown **only when "By region" is active**. Wrap-flex, `gap:8px`, 12px top margin. Single-select. Six chips, in this order: **Africa, Asia, Europe, North America, South America, Oceania** (Antarctica intentionally excluded).
  - Chip base: Archivo 500, 12.5px, padding `8px 13px`, radius `999px`, `white-space:nowrap`.
  - **Active chip:** background `rgba(245,158,75,0.14)`, border `1px solid rgba(245,158,75,0.55)`, color `#ffd9a8`.
  - **Idle chip:** background `rgba(255,255,255,0.03)`, border `1px solid rgba(255,255,255,0.10)`, color `#9fb2c6`.
  - Default selected region: **Africa** (only relevant once "By region" is chosen).

**Quiz cards** (4, identical structure, different icon/title/description)
- Card: `display:flex; align-items:center; gap:14px; padding:14px 15px; border-radius:16px`.
  - Background `rgba(255,255,255,0.025)`, border `1px solid rgba(255,255,255,0.08)`, `cursor:pointer`.
- **Icon tile** (left): 42 × 42px, radius 13px, background `rgba(245,158,75,0.12)`, border `1px solid rgba(245,158,75,0.22)`, icon color `#f7b572`, 21px.
- **Title:** Fredoka 600, 16px, letter-spacing −0.01em, color `#eef2f6`.
- **Description:** Archivo 400, 12.5px, line-height 1.4, color `#8ca0b4`, 2px top margin.
- **Trailing chevron:** Phosphor `arrow-right`, 16px, color `#5c708a`.

  The four cards:
  | Icon (Phosphor) | Title | Description |
  |---|---|---|
  | `globe-hemisphere-west` | Name the country | Find a highlighted country and pick its flag |
  | `flag` | Identify the flag | See a flag and choose which country it belongs to |
  | `map-pin` | Find the country | Tap the right country — 10 in 45 seconds |
  | `bank` | Capital cities | Match countries to capitals — direction flips |

**Cancel button**
- Full-width, padding 13px, radius `999px`, transparent background, border `1px solid rgba(255,255,255,0.12)`.
- Text "Cancel", Archivo 600, 14px, letter-spacing 0.02em, color `#9fb2c6`.

**Launch toast**
- Bottom-center (30px from bottom), `display:flex; align-items:center; gap:9px; padding:11px 17px; border-radius:999px`.
- Background `rgba(6,18,31,0.94)`, border `1px solid rgba(245,158,75,0.4)`, shadow `0 10px 30px rgba(0,0,0,0.5)`, `white-space:nowrap`.
- Phosphor-bold `play` icon, 14px, color `#f7b572` + label text, Archivo 500, 13px, color `#eef2f6`.
- Label format: `"<Quiz title>  ·  <Scope label>"` where scope label is `"Whole globe"` or the selected continent name.

---

## Interactions & Behavior

- **Segmented control:** tapping a segment sets the scope. Selecting "By region" reveals the
  continent chips (they animate in with a quick fade-up); selecting "Whole globe" hides them.
- **Continent chips:** single-select — tapping a chip makes it the active region. Selecting a
  region does **not** auto-change the scope; it just records which continent is chosen.
- **Quiz cards:**
  - Hover: background `rgba(245,158,75,0.06)`, border-color `rgba(245,158,75,0.42)`, `transform:translateY(-1px)`.
  - Active/press: `transform:translateY(0)`, background `rgba(245,158,75,0.11)`.
  - Tapping a card **starts that quiz with the current scope.** In the prototype this shows the
    launch toast (`"<Quiz> · <scope>"`) for 2.6s; in the app, this is where you navigate into
    the quiz, passing along the chosen mode and scope.
- **Cancel:** dismisses the overlay (returns to the globe). Hover: background `rgba(255,255,255,0.04)`, color `#cdd8e3`.
- **Scope applies to whichever quiz the user launches** — it is a single shared setting, not
  per-card. (Open question below.)

### Animations (all easing `cubic-bezier(0.4, 0, 0.2, 1)` — gentle, never bouncy)
- **Sheet entrance** `qm-sheet`: 0.6s, opacity 0→1 + translateY 34px→0.
- **Staggered content fade** `qm-fade`: 0.6s, opacity 0→1 + translateY 8px→0; delays step
  through heading (.08s), scope (.14s), divider (.18s), cards (.22 / .27 / .32 / .37s), cancel (.42s).
- **Continent-chip reveal:** 0.4s `qm-fade`.
- **Globe glow** `qm-glow`: 3.5s ease-in-out infinite, opacity 0.5↔0.85.
- **Toast** `qm-toast`: 0.3s, opacity 0→1 + translateY 12px→0.
- Card and segment/chip color/transform transitions: 0.18–0.2s.

---

## State Management
- `scope`: `'globe' | 'region'` — default `'globe'`.
- `region`: one of `'Africa' | 'Asia' | 'Europe' | 'North America' | 'South America' | 'Oceania'` — default `'Africa'`. Only meaningful when `scope === 'region'`.
- `toast` (prototype-only): the transient confirmation string; cleared after 2.6s. In the real
  app, replace this with navigation into the quiz.

**Launch contract:** when a card is tapped, start the corresponding quiz mode with:
`{ mode: 'name' | 'flag' | 'find' | 'capital', scope: 'globe' | <continent> }`.

**Data requirement:** the quiz engine must support filtering the country pool by continent.
Continent membership (excluding Antarctica) is needed for the region scopes.

---

## Design Tokens
From `tokens/` (link `styles.css`). Values used in this screen:

**Colors**
- Navy: `--navy-900 #06121f`, `--navy-800 #0a1c30`, `--navy-700 #102a44`.
- Amber: `--amber-300 #ffd9a8`, `--amber-500 #f59e4b`, `--amber-600 #f59440`, `--amber-700 #c96a1f`. Gradient pill uses `#f7a857 → #f59440`; icon tint `#f7b572`.
- Text: `--text-high #eef2f6`, `--text-mid #7e93a8`, `--text-low #5c708a`; plus body greys `#8ca0b4`, `#90a4b8`, `#9fb2c6`, `#6f86a0`.
- Lines/glow: `--line-faint rgba(255,255,255,0.09)`, `--glow-amber rgba(245,158,75,0.18)`.
- App gradient: `--bg-gradient` (see above).

**Typography**
- `--font-display: "Fredoka"` (wordmark, headings, card titles — weights 400/600).
- `--font-ui: "Archivo"` (labels, body, buttons — weights 400/500/600).
- Uppercase label tracking: 0.16em (labels) / 0.2em (caption).
- Casing rule: the **wordmark** is the only mixed-case display element; supporting labels are
  UPPERCASE with wide tracking. Headings (e.g. "Choose a quiz") are sentence case.

**Radius:** `--radius-pill 999px` (buttons, chips, segments), `--radius-lg 16px` (cards),
sheet uses 28px, icon tiles 13px.

**Shadow:** `--shadow-float 0 8px 40px rgba(0,0,0,0.28)`; sheet/toast shadows listed per-component above.

**Motion:** `--ease-soft cubic-bezier(0.4,0,0.2,1)`; durations 0.18–0.6s (UI), 3.5s (glow loop).

---

## Assets
- `assets/globe.png` — the brand globe mark (decorative here; the real app renders the live
  three.js globe behind the overlay).
- **Icons:** [Phosphor](https://phosphoricons.com/) (MIT). Weights used: `regular` (most) and
  `bold` (toast play icon). Icons referenced: `gear-six`, `globe-hemisphere-west`, `compass`,
  `flag`, `map-pin`, `bank`, `arrow-right`, `play`. Use the codebase's existing Phosphor
  integration if present.
- **Fonts:** Fredoka + Archivo via Google Fonts (see `tokens/fonts.css`). No font binaries bundled.

## Files
- `Quiz Mode.dc.html` — the design prototype (reference only; runs on `support.js`, do not ship).
- `styles.css` + `tokens/*.css` — the real design system (source of truth for tokens).
- `readme.md` — the full Terragotcha design-system readme (voice, brand, iconography rules).
- `assets/globe.png` — globe mark.
