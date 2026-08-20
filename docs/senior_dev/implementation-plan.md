# Globe3D — Staged Implementation Plan

**This is the single source of truth** for every prospective improvement to Globe3D — code
quality, modularization, performance, correctness, and deployment/SEO. It supersedes
`REFACTORING_PLAN.md` and `MODULARIZATION_PLAN.md` (both now carry a superseded banner and are
kept only for history) and links out to `DEPLOYMENT_GUIDE.md` and
`docs/deployment/temp_deploy.md` for the long-form deployment how-to.

Derived originally from the senior-dev code review at
`/home/john/.claude/plans/you-are-a-new-replicated-hickey.md`. Stages are ordered so each one is
independently shippable and each leaves the repo healthier than it found it. Earlier stages
reduce risk; later stages depend on the safety net the earlier ones lay down.

**Working assumptions (decided 2026-06-07):**
- **Aggressive modularization target** — `index.html` ends at **under ~500 lines**: HTML markup
  + imports + a single `app.init()` call. Even data tables and the pointer-dispatch router get
  extracted.
- **One module per feature** — e.g. a single `js/features/label-editor.js`, not a
  `label-editor/` sub-folder of micro-modules. Matches the existing `js/features/` style
  (`flag-renderer.js`, `search.js`).

---

## Status & Outcomes (as of 2026-06-08)

The bulk of this plan has shipped on branch `refactor_indexdothtml` (32 commits since the plan was
centralized). **`index.html` went from 3,089 → ~1,059 lines (~66% reduction)** — one inline-JS
monolith became a thin bootstrap shell plus focused ES modules, all under a green test/CI net.

| Stage | Status | Highlights |
|-------|--------|-----------|
| 0 — Baseline & branch hygiene | ◑ Partial | Worked on the long-lived `refactor_indexdothtml` branch; formal `baseline.md` not captured |
| 1 — Verified bug fixes | ✅ Done | drag-hit-sphere leak, resize-listener teardown, per-frame flag normals → `flatShading`, search event delegation, pooled `cameraDirection` |
| 2 — Test infrastructure | ✅ Done | vitest + 3 specs / **9 tests** (`lat-lng`, `country-meta`, `world-mesh-format`); CI `.github/workflows/test.yml` |
| 3 — Docs & cleanup | ✅ Done | retired the 2 stale plans (superseded banners), fixed CLAUDE.md asset sizes, removed stray prototypes, committed the lockfile |
| 4 — Modularization | ✅ Done | 4a quick wins, 4b Bucket-C feature modules, 4c dead state-sync removal, 4d camera/idle + dead-code |
| 5 — Perf/correctness polish | ⬜ Pending | `_lookupIdLoose` tighten, override precedence, `getCountries()` removal still open |
| 6 — Deployment & SEO hardening | ✅ Done | eruda debug console removed, full SEO/OG/Twitter/JSON-LD `<head>`, `_headers`, `robots.txt` (dev buttons were already CSS-gated) |
| 7 — Optional next bets | 🟡 In progress | ✅ country borders (baked distance field + shader edge); search index, multi-language labels still open |
| 8 — Daily Challenge + Django backend | 🟡 In progress | new `backend/` (geo/players/quiz/stats), `js/features/daily-quiz/`, `frameView` camera offset; tests green, browser verification pending |
| 9 — Ads + Stripe remove-ads + account upgrade | ⬜ Pending | deferred; data model already forward-compatible |

**Modules created (~11 new files):** `js/data/country-data.js`, `js/utils/coordinates.js`,
`js/features/{loading,ui-sync,flag-wave,color-editor,zoom-editor,small-country-indicator,label-editor,pointer-controls}.js`,
and `js/features/quiz/quiz-ui.js`. `js/core/camera-controls.js` absorbed the camera-animation +
idle logic and shed its dead duplicate API; the inline DOM helpers now import from the pre-existing
`js/utils/dom.js`. Each Bucket-C feature is a class owning its own state, wired in via constructor
injection (with an `onEnter` seam for the mutually-exclusive edit modes).

**2D map removed; capitals quiz moved to the globe (2026-06-25):** the full-screen 2D MapLibre
country view (`js/features/country-map.js`, the `js/vendor/` MapLibre+PMTiles libs, and the
`assets/planet-z9.pmtiles` / `countries.geojson` / `pmtiles-layers.json` assets) was deleted as
out-of-scope for a casual learning experience. A new reusable `js/core/markers.js` (`MarkerLayer`,
owned by `GlobeManager` as `globeManager.markers`) plots dot markers — with optional name labels —
at any lat/lng on the globe; it absorbs the old inline `showCapitalMarker`/`clearCapitalMarker`
code. The Capital Cities quiz now runs on the 3D globe: forward questions pan/zoom to the country
(`rotateToCountry` with an `aimPoint`), reverse questions zoom the globe out to ~25% of screen width
(new `CameraController.frameWholeGlobe`), the capital is marked with a dot (no name) during the
question, and the name label is revealed on answer. The settings panel's "2D map features" toggles
(`MAP_TOGGLES`, `settingsStore.mapToggles`/`getMapToggleDefaults`) were removed with it.

**Weak Spots overlay (2026-06-25):** a chromeless top-right heads-up list of the player's
most-missed countries, `js/features/weak-spots-widget.js` (`WeakSpotsWidget`). It builds its own
DOM (no static markup in `index.html`), reads the existing wrong-answer tally via
`quizHistoryStore.getCountryStats({ minAsked: 1 })` (top 10, `pct < 100`), shows 5 rows at a time
under a viewport-pinned fade mask, and subscribes to `state` `quiz.active` to hide during quizzes /
refresh after. Clicking a row reproduces the non-quiz globe click (highlight + `rotateToCountry` +
flag panel). Styling lives in `styles.css` (`.weakspots-*`). To free the top-right corner the
desktop `#flag-container` was moved from `top` to `bottom` (mobile already docks it bottom-center);
wiring is an import + one instantiation in `index.html`.

**Analytics + AdSense + consent (2026-07-06):** GA4 and Google AdSense added as self-contained,
prod-gated, consent-gated feature modules (extends Stage 6 "Deployment & SEO"). IDs live in
`js/data/site-config.js` (empty → every consumer no-ops; `isProdHost()` mirrors `isLocalDevHost`,
with a `?ads=1` override). `js/features/analytics.js` sets Consent Mode v2 defaults (denied) then
loads `gtag.js`, exports `track()`, and auto-wires `quiz_start` via `state.subscribe`; a few
explicit `track()` call-sites cover `quiz_complete` (`quiz-ui.js`), `share`
(`quiz-results-modal.js`), `country_select` (`pointer-controls.js`), and `daily_complete`
(`daily-quiz.js`). `js/features/ads/{adsense,ad-rail}.js` load `adsbygoogle.js` and mount a
desktop-only side rail (`#ad-rail`, styled in `styles.css`); the mobile bottom anchor is served by
Auto-Ads Anchor-only. Both defer behind `globe3d:intro-dismissed` (`js/utils/after-intro.js`) so
first paint/LCP is untouched. New root files (`ads.txt`, `privacy/index.html`,
`manifest.webmanifest`) are added to `build-pages.mjs` INCLUDE; `index.html` gains only the
manifest `<link>`, two imports, and two init calls. Landing-page ad slots documented in
`docs/individual_landing_pages/plan.md`.

**Consent Mode v2 + Google certified CMP (2026-07-25):** supersedes the "denied everywhere" consent
model above. Consent defaults are now **region-scoped** and emitted **early** (no longer inside the
deferred gtag load): a new exported `initConsentDefaults()` in `js/features/analytics.js` pushes two
`gtag('consent','default',…)` calls — EEA/UK/CH (the `EEA_UK_CH` list) denied with `wait_for_update`,
rest-of-world granted — called at `index.html` top-level right after `initTheme()`, so non-EEA
analytics flows with no banner while EEA stays denied until consent. `loadGtag()` no longer sets
defaults (just `js`/`config`/inject) and is guarded against double-set via `defaultsSet`. Google's
certified CMP is loaded by the new self-contained module `js/features/consent-cmp.js` (`initConsentCmp()`
— prod- + `CMP_PUBLISHER_ID`-gated, deferred via `afterIntro`; injects the Funding Choices loader + the
`googlefcPresent` detection iframe in JS since inline `<script>` is barred from `index.html`; plus
`manageConsent()` for re-consent). New `CMP_PUBLISHER_ID` in `site-config.js` (the AdSense pub id,
`pub-…`) is kept SEPARATE from `ADSENSE_CLIENT_ID` so consent can be live while ad serving stays off.
`settings-panel.js` `_buildFooter()` adds a "Manage consent choices" link (only when the CMP is
configured; reuses `.settings-footer a`, no new CSS), and `privacy/index.html` documents it.
`build-landing.mjs` `analyticsHead()` mirrors the same region-scoped defaults + CMP loader so the
`/borders/<slug>` pages share one consent model. Net `index.html` cost: one extended import + one new
import, an early `initConsentDefaults()` call, and `initConsentCmp()` beside `initAnalytics()/initAds()`.

**Theme coverage: quiz modals + Daily pill (2026-08-05):** two surfaces were bypassing the token
system entirely. (1) The `.qmp-*` (quiz mode picker) and `.qsv-*` (quiz stats) blocks carried 14
literal `font-family: sans-serif` declarations and three `color: var(--steel-9)` — both ported
verbatim from `design/quiz_choice/design_handoff_quiz_mode/`, which hardcoded `#8ca0b4` and
`'Archivo'`. `--steel-9` is a **primitive** ramp value defined once in the base `:root`; no
`[data-theme]` block overrides the steel ramp, so the quiz-card detail text ("Find a highlighted
country and pick its flag"), `.qsv-row-sub` and `.qsv-empty-text` rendered the identical grey in
every theme, and the `--font-ui` knob did nothing to them. Now `var(--text-mid)` + `var(--font-ui)`,
so both follow the theme (verified: `mono` shifts them to `#9aa0a6` / system-ui). Note this restores
the handoff's intended Archivo, which the port had dropped. (2) The Daily Challenge pill's six
violet tokens (`styles.css` second `:root`, ~line 3866) were likewise unthemeable. Fixed with **one
knob, not six**: a new `--accent-secondary` (`#8c7cf0`, replacing the unused `--violet-400`) added to
the Colors group beside `--accent`/`--on-accent`, with all six `--violet-*` now **derived** from it
via `color-mix()` — the same idiom as `--accent-soft` (`styles.css:36`), which is already used ~70×
in this file. Knob count 23 → 24. The six derived tokens keep their names, so the `#dq-today` rules
are untouched and the derivation lives in one place. No editor change was needed —
`theme-editor.js` iterates `TOKEN_GROUPS` (:103/:323/:330). Verified in-browser that setting the
single knob to green repaints fill, border, label and icon together.

The collapse to one hue is a **deliberate, measured trade** (six swatches for one button was
disproportionate in an already-busy editor). Measured drift vs. the old hand-picked ramp:
`--violet-border` is byte-identical; `--violet-label` and `--violet-icon` land within 3/255 per
channel; `--violet-fill`/`-fill-hover` shift +16,+16,+8 and `--violet-border-hover` shifts
−20,−20,−8, because the handoff used three neighbouring hues (`#7c6ce8` fill, `#8c7cf0` border,
`#a090f8` border-hover) and everything now snaps to the middle one. Net visible effect: the fill
reads a touch lighter, and the hover border thickens without also lightening. Note the label/icon
mixes are toward `var(--white)`, so they assume a dark surface — a light theme should pick a darker
`--accent-secondary`. Chrome serialises `color-mix()` results as `color(srgb …)` rather than
`rgba()`; harmless here since no JS reads these tokens (checked) and nothing passes them to canvas.

**Deliberately unchanged:** the `--steel-6/7/8/10` and `--neutral-*` primitives still used elsewhere
in those two modals — a wider primitive→semantic sweep is a separate, riskier change.

**Ad serving switched on + crawler-visible loader (2026-08-05):** supersedes the "consent live while
ad serving stays off" split noted above — `ADSENSE_CLIENT_ID` is now set (`ca-pub-2820812359000429`,
the `ca-`-prefixed `CMP_PUBLISHER_ID`), because AdSense will not move a site past "Getting ready"
without live ad code. Two problems were fixed at once. (1) **ads.txt** was serving the
`pub-XXXXXXXXXXXXXXXX` placeholder in production — the real id was committed but unpushed; no code
change, just a deploy. (2) **The loader was undiscoverable.** `adsbygoogle.js` was injected from
`js/features/ads/adsense.js`, reached only via `initAds()` inside `setupEventListeners()`, itself
reached only through `init()` — which is wrapped in a `try/catch` and builds a WebGL renderer first,
so on a WebGL-less or non-executing crawler the ad code did not exist at all; on the happy path it
was still deferred up to 6s behind `afterIntro`. **`index.html` now carries the AdSense loader as a
static vendor `<script async src>` in `<head>`** (immediately after the `google-adsense-account`
meta). This is a deliberate, documented exception to the "no new `<script>` in `index.html`" rule:
the tag is vendor markup, not logic; `adsbygoogle.js` must self-bootstrap from `<head>` so ESM
import is not an option; and the file already carries such a tag (canvas-confetti). (It carried two
more — three.js and OrbitControls — until stage A8 replaced them with an importmap-resolved ESM
`import`; canvas-confetti is now the only remaining vendor `<script src>` besides AdSense.) It
duplicates the client id — the comment at both sites says to keep them in sync
(the `/borders/*` pages stay synced automatically, `build-landing.mjs` regexes the value out of
`site-config.js`). `adsense.js` keeps `loadAdsenseScript()` as a fallback that no-ops when the static
tag is already present, so the page never carries two loaders. `initAds()` **stays** in
`setupEventListeners()` on purpose: on a fatal WebGL failure the rail must not mount over the error
panel. Ad *units* remain deferred behind the splash — the loader alone renders nothing.
**Empty-slot guards** were added so the loader can ship before the slot ids exist: `AdRail.init()`
returns early when `ADSENSE_RAIL_SLOT` is empty, `mountAd()` requires a non-empty slot, and
`build-landing.mjs` `adSection()` now needs both `ADS_ID` and `ADS_SLOT`; without them a slot-less
`<ins>` paints a blank box under an "Advertisement" label, itself an AdSense policy problem. The
`<head>` loader emission in `analyticsHead()` stays keyed on `ADS_ID` alone — that is what review
looks for. Net `index.html` cost: one vendor `<script>` tag + comment. **Known follow-up:** with the
loader static in `<head>` it now runs ahead of `initConsentDefaults()` and the Funding Choices CMP
(still behind `afterIntro`), so EEA/UK/CH ad requests fire with no `__tcfapi` present → little EEA
fill. Not an approval blocker; fix by hoisting `initConsentCmp()` to the top-level module block
and/or emitting the Funding Choices tag statically above the AdSense tag, as the landing pages do.

**Bordering-countries SEO landing pages (2026-07-06):** a static, globe-free page per country at
`/borders/<slug>` targeting the "what countries border X" query (implements
`docs/individual_landing_pages/plan.md`; the content that makes the domain AdSense-approvable).
Pipeline: `backend/quiz/data/border_quiz_targets.json` (28 curated cca3 targets) → the
`export_border_quizzes` management command (reuses `_resolve_neighbours`/`nearest_countries`/
`country_option`; sizes the grid itself so it copes with 2–14 land borders) → committed
`landing/borders-data.json` → `build-landing.mjs` renders `landing/border-page.template.html` into
`borders/<slug>/index.html` (**image-gated** on `img/borders/<slug>.png`; regenerates `sitemap.xml`;
injects GA/AdSense tags only when `site-config.js` IDs are set) → `build-pages.mjs` stages them
(`'borders'` added to INCLUDE). Runtime: `js/landing/border-quiz.js` reuses the daily-quiz
`OptionsGrid` and computes the reveal client-side — no globe/Three.js/api-client. `build:pages` now
runs `build-landing.mjs` first; generated `borders/` is git-ignored like `dist/`.

**Beyond the staged plan** (polish + fixes surfaced during smoke testing): a runtime config
cache-buster (`?v=` on the label/color/zoom JSON fetches), a per-quiz-module `cancel()` (restoring
the desktop Start-Quiz panel), two fullscreen flag-quiz cancel-`×` fixes (`box-sizing:border-box`
so it stops rendering off-screen, plus hiding the overlapping globe controls), the PointerControls
async-deps construction fix, the orphaned-`countries` reference fix, and **mouse release momentum
(flick)** so desktop drag-and-release coasts and decelerates like the touch flick.

**On the `<500`-line target:** not reached, deliberately — `index.html` lands at ~1,059 lines. What
remains is genuine bootstrap glue (`init()` + the globe-load callback, `setupEventListeners()`, the
`cancelQuiz` dispatcher, `onWindowResize`, `toggleSphere`, `updateLabelVisibility`, `onKeyDown`)
plus the HTML markup shell. Pushing lower would mean fragmenting `init()` and the markup for
diminishing readability returns, so the modularization was stopped at the natural boundary.

---

## 1. `index.html` Anatomy Review

A snapshot of `index.html` as it stands (**3,089 lines**) to anchor the modularization work. The
file is one `<head>` + static UI markup followed by a single `<script type="module">`
(lines 224–3089, ~2,865 lines of inline JS). Line numbers below are current as of this writing.

### 1a. HTML / Markdown — *the part that stays*

The markup is small and mostly stays (it's the entry-point shell). Major blocks:

| Block | Lines (approx) | Notes |
|-------|----------------|-------|
| Head / meta / external `<script>`s | 3–224 | confetti CDN (11), the `<script type="importmap">` that resolves `three` + `@terragotcha/*` by bare specifier (three.js and OrbitControls were `<script src>` tags until stage A8), Google Fonts (Fredoka/Archivo) for the splash |
| Terragotcha splash overlay (`#seo-content`), `#container`, top buttons | ~67–106 | opaque loading splash (markup ~67–98, styled in `styles.css`, dismissed by `js/features/loading.js`); wraps SEO copy in `.sr-only`; zoom/quiz/bounce/shatter/pinball/edit/color/zoom-editor toggles |
| Zoom widget, flag panel, search | ~63–106 | (controls legend removed — globe manipulation is self-evident) |
| Quiz container + mode-selector | ~107–160 | `#quiz-container` is gameplay-only now: its idle "Geography Quiz" launcher panel is hidden (shown only on `body.quiz-active`); entry points are the Take Quiz button + the `quiz-invite.js` reminder. The end-of-quiz celebration overlay was **extracted** — now built at runtime by `js/features/quiz/quiz-results-modal.js` (the new "Quiz Results" design); only the `body.celebration-active` chrome-hiding CSS remains. The old bespoke click-quiz DOM (container / countdown bar / results modal) was **removed** — "Find the country" now reuses the shared floating `#qz-chrome` like the other quizzes |
| Label-editor modal | ~189–219 | sliders + buttons |
| `<script type="module">` | 224–3089 | the JS reviewed in 1c |

**Action flagged:** several modals/panels are static markup that their owning feature module
could create at runtime instead (CLAUDE.md's stated preference: a feature should add ~an import
+ one call to `index.html`, nothing more). Under the aggressive target, the label-editor modal
moves into `label-editor.js`, the quiz modals into the quiz UI module, the color/zoom-editor
panels into their feature modules — each builds its own DOM on instantiation.

### 1b. CSS — *essentially complete*

**CSS extraction is already done.** `index.html` has **zero `<style>` blocks**; all 2,340 lines
of CSS live in `styles.css`. Two small residual items remain (checklist):

- [ ] **JS-injected `<style>`** for the light-dev panel (`index.html:967`,
  `document.createElement('style')` inside the `setupLightDevPanel()` IIFE). This violates
  CLAUDE.md's "no CSS in `index.html`" rule. Either move its rules into `styles.css` (scoped to
  `#light-dev-panel …`) and delete the injection, **or** remove the dev panel entirely as part of
  Stage 6 hardening.
- [ ] **23 inline `style="display:none"` / `visibility:hidden`** initial-state attributes. Replace
  with a `.hidden` utility class in `styles.css` so JS toggles a class (via the `dom.js`
  helpers) instead of writing inline style. Low priority, do opportunistically during Stage 4.

**Design-token layer (`styles.css` now ~5,280 lines).** The top of `styles.css` is a `:root`
control panel: a two-tier token set — **primitives** (family ramps `--amber-*`/`--navy-*`/
`--steel-*`/… plus a radius scale, weight scale, and font families) and **semantic aliases**
(`--accent`, `--bg-app/-panel/-elevated` + `--scrim`, `--text-heading/-body/-muted`, `--radius-btn/-panel/-pill`,
`--weight-*`, `--font-base/-ui/-display`). Every colour / radius / weight / font-family literal in
the file was mechanically swept onto `var(--…)` references (846 declarations) with **resolved-value
equivalence** verified, so the default look is pixel-identical. See the **UI theming** entry under
Stage 7 for the live switcher built on top.

### 1c. JavaScript — three extraction buckets

**Already modularized.** The imports (lines 226–242) pull in `state`, `SceneManager`,
`GlobeManager`, `LabelManager`, `CameraController`, `QuizManager` + the 4 quiz classes,
`FlagRenderer`, `CountryMap`, `SearchManager`, the 3 animation classes, and `FocusZoomRegistry`.
So scene / globe / labels / camera / quiz / flags / search / animation / focus-zoom are **done**.
The ~2,865 remaining inline lines sort into three buckets.

#### Bucket A — MUST STAY in `index.html` (bootstrap/glue; the aggressive end-state)

| Chunk | Lines | Reason |
|-------|-------|--------|
| Imports | 226–242 | entry-point wiring |
| `init()` — manager instantiation + wiring | 848+ | bootstrap; constructs and connects all managers |
| Render-loop registration + `sceneManager.start()` | ~1157–1218 | core animation glue |
| Thin **pointer-dispatch router** | (post-extract) | delegates to `pointer-controls.js`; only the dispatch call stays |
| `init()` call | 3087 | application entry point |

#### Bucket B — EASY to extract (self-contained, low/no shared-state coupling)

| Chunk | Lines | Target module | Reason |
|-------|-------|---------------|--------|
| `animateFlagWave()` | 298–330 | `js/features/flag-animation.js` (or fold into `flag-renderer.js`) | pure vertex math |
| `showQuizCelebration()`, `clearQuizTimers()`, `triggerConfetti()`, `calculateGreatCircleDistance()` | 331–364, 365+, 2619, 2605 | `js/features/quiz/quiz-utils.js` | stateless quiz helpers |
| `latLngToVector3()` + coord helpers | 1387–1410 | `js/utils/coordinates.js` | pure geometry |
| `addLatLongLines()` | 1411–1501 | `js/features/debug-grid.js` (or delete if unused) | isolated viz |
| `setupLights()` | 1297–1323 | `js/core/scene.js` (verify not dead first) | scene setup |
| `updateLoadingProgress()`, `hideLoading()`, `hideSeoContent()` | 1324–1386, 2574–2604, 833–847 | `js/features/loading.js` | loading/SEO screen |
| `onWindowResize()` | — | `js/core/scene.js` | ✅ Done — resize logic (renderer/camera sizing, debounced + mobile orientation-safe via `visualViewport`/`orientationchange`) now lives in `SceneManager.applyResize()`. The slim `onWindowResize()` left in `index.html` is only a camera-reposition callback registered via `sceneManager.onResize()`. |
| `zoomOutToDefault()` | 1700–1743 | `js/core/camera-controls.js` | camera animation |
| `updateZoomWidget`, `updateSearchVisibilityOnMobile`, `updateZoomOutButtonVisibility` | 3021+ | `js/features/ui-sync.js` | UI-sync helpers |
| `countryData` + `countryToISO` data tables | ~592–830 | `js/data/country-data.js` | static data (extracted under aggressive target) |

#### Bucket C — HARDER refactor (tangled, many shared globals — one module per feature)

| Feature | Key functions / lines | Target module | Reason |
|---------|----------------------|---------------|--------|
| **Label editor** | `toggleEditMode` (1744), `selectLabel` (1778), modal + slider handlers, config load/save/apply, keyboard + wheel-resize | `js/features/label-editor.js` | selection state machine bound to many globals + static modal markup |
| **Color editor** | `buildSwatchPanel` (2125), `toggleColorEditMode` (2144), change-color, config I/O | `js/features/color-editor.js` | UI + config state |
| **Zoom/focus editor** | `buildLevelPanel` (2206), `toggleZoomEditMode` (2225), set-level, config I/O | `js/features/zoom-editor.js` | UI + config state |
| **Pointer/interaction core** | `onPointerDown` (2295), `onPointerUp` (2336), `onPointerMove` (2448) | `js/features/pointer-controls.js` | branches on edit/color/zoom/quiz modes; leave a thin dispatch in `index.html` |
| **Quiz UI glue** | mode selector / cancel; score-gated flourish + hands off to the results modal | `js/features/quiz/quiz-ui.js` (results card extracted to `quiz-results-modal.js`) | modal UI + quiz instance refs |
| **Small-country indicator** | arrow mesh build/update/dispose | `js/features/small-country-indicator.js` | Three.js mesh lifecycle, needs scene ref |
| **Camera focus** | `focusOnCountry` (2513), `rotateGlobeToCountry` (2937), `animateRotation` | fold into `js/core/camera-controls.js` | camera animation already partly there |

**The main coupling obstacle** is the **~63 top-level globals** in the module script — `editMode`,
`selectedLabel`, `labelConfig`/`labelDefaults`, the quiz-state cluster, `colorEditMode`/`colorConfig`,
`zoomEditMode`/`zoomConfig`, and the manager handles. Stage 4 threads these through the centralized
`state` object (`js/data/state.js`, already imported and partially synced via
`syncStateWithVariables()` at line 520) rather than module-level `let`s, so extracted modules read
and mutate shared state through one channel instead of closing over globals.

---

## Stage 0 — Baseline & branch hygiene — ◑ Partial

**Goal:** Snapshot the current state so we can measure improvement and so each later stage lands as a reviewable PR.

- Confirm `main` is clean; create a long-lived integration branch (e.g. `senior-dev-cleanup`) that each stage branches off and merges back into.
- Capture a baseline: page load time on a cold cache, FPS during idle rotation, FPS during a label drag, `performance.memory.usedJSHeapSize` before/after dragging 100 labels. Note them in this folder as `baseline.md`.
- Verify `npm run build:globe` still produces byte-identical assets before any code change. If it doesn't, that's a Stage-0 finding to investigate first.

**Done when:** baseline numbers are written down and the build is reproducible.

---

## Stage 1 — Verified-bug fixes (one PR) — ✅ Completed

**Goal:** Land the small, high-confidence bug fixes from the review. No behavioral changes for the user; pure correctness.

1. **`index.html` (`onPointerMove`, ~2448) — cache the drag-hit sphere.**
   Hoist `new THREE.SphereGeometry(1.02, 32, 32)` and its `Mesh` to module scope (or onto LabelManager) and reuse them across every `pointermove`. Dispose on teardown. This stops a Geometry+Mesh leak that fires at refresh rate during a drag.

2. **`scene.js:87` / `:280` — fix the resize listener teardown.**
   Replace the inline arrow with a stored bound handler: `this._onResize = () => this.onWindowResize()` in the constructor, then `addEventListener('resize', this._onResize)` and `removeEventListener('resize', this._onResize)` in `destroy()`. (The inline `onWindowResize()` at `index.html:2541` moves to `scene.js` in Stage 4 — keep them consistent.)

3. **`flag-renderer.js:128` — drop per-frame normal recompute.**
   Either pre-compute normals once at flag creation, or switch the flag material to `flatShading: true` and remove the call. Manually inspect the flag visually after — if the shading looks identical, keep the cheaper path.

4. **`search.js:67–77` — event delegation on the results container.**
   Replace the per-row `addEventListener` loop with a single `click` listener on the results container that reads `e.target.closest('.search-result-item')`. Same for keyboard navigation.

5. **`labels.js:202` — pool the cameraDirection Vector3.**
   Move `new THREE.Vector3()` to an instance field initialized in the constructor; reuse inside `updateVisibility()`.

**Verification for the stage:**
- Drag a label for 30 seconds, watch `performance.memory.usedJSHeapSize`. Should plateau, not climb.
- Run the search box: type/clear repeatedly while inspecting Event Listeners in DevTools — total listener count should be stable.
- Visual smoke: rotate the globe, pick countries, run a quiz round, drag a label — no regressions.

**Done when:** one PR, five small commits (one per fix), green visual smoke.

---

## Stage 2 — Test infrastructure (one PR) — ✅ Completed

**Goal:** Break the zero-tests ceiling. The repo gains a runner, a CI hook, and the first round-trip tests for the math that's easiest to silently break. Every later stage runs under this safety net.

1. **Pick a runner.** Default recommendation: `vitest` — fast, ESM-native, matches the project's existing module style, no transpiler config.
   ```bash
   npm i -D vitest
   ```
   Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json`.

2. **First test files** under `tests/`:
   - `tests/lat-lng.test.js` — import the math out of `globe.js` (may require lifting `latLngToVector3` to a pure helper in `js/utils/coordinates.js` — see Stage 4 Bucket B). Round-trip 500 random points: lat/lng → vec3 → back to lat/lng, assert within 1e-6.
   - `tests/country-meta.test.js` — load `assets/country-meta.json`; assert every `nameToId[name]` round-trips through `idToName[id] === name`, and that every country in `meta.countries` has matching name/id entries.
   - `tests/build-format.test.js` — synthesize a tiny GeoJSON (two triangles), invoke the relevant chunks of `build-textures.js` as pure functions (may need a small refactor), assert binary format invariants (header, vertex count, padded ID block, index alignment).

3. **Playwright smoke (optional, recommended).** One spec: launch the page (use a local `http-server`), wait for `country-meta.json` to load, click at a known canvas pixel that should resolve to "Australia", assert tooltip text.
   ```bash
   npm i -D @playwright/test http-server
   npx playwright install --with-deps chromium
   ```
   Add `"test:e2e": "playwright test"`.

4. **CI.** A tiny `.github/workflows/test.yml` running `npm ci && npm test && npm run build:globe` on push. Cheap insurance.

**Done when:** `npm test` passes locally and in CI; the three unit specs and the optional E2E spec all green.

---

## Stage 3 — Documentation sync & consolidation (one small PR) — ✅ Completed

**Goal:** Stop the docs from lying, and collapse the three overlapping plans into this one.

1. **`CLAUDE.md` edits:**
   - Correct `world-mesh.bin` size: "~30 MB raw / ~16 MB gzipped" (not "~3.8 MB").
   - Correct `COUNTRY_MESH_SCALE` to `1.002` to match `globe.js:17`.
   - Rewrite the "Most code in single HTML file" line to reflect that core systems live under `js/` and `index.html` is now bootstrap + glue + (shrinking) inline UI logic.
   - Add a one-line pointer to this doc as the single source of truth.

2. **Retire the two stale plans (don't delete — preserve history):**
   - Prepend a banner to `REFACTORING_PLAN.md` and `MODULARIZATION_PLAN.md`:
     `> **Superseded.** Folded into docs/senior_dev/implementation-plan.md (2026-06-07). Kept for history.`
   - The unique, still-relevant content from both has been folded into Section 1c (the bucket
     review) and the duplication findings below. Their concrete value worth re-checking:
     - duplicate flag-animation logic (`updateFlagAnimation` vs `updateFlagQuizAnimation`) — should
       now be unified via `animateFlagWave`; **verify**, and if a duplicate remains it's a Stage-1 fix.
     - quiz celebration/scoring duplication across modes — verify against the current quiz modules
       (`js/features/quiz/*`); the shared `showQuizCelebration()` already centralizes celebration.
     - DOM-access / show-hide pattern proliferation — addressed by the `.hidden` class (Section 1b)
       + the `js/utils/dom.js` helpers.

3. **Delete or move stray files:**
   - `script1.js` — delete (imports paths that don't exist in this repo).
   - `test-load.html`, `wave_effect.html` — either delete or move under `scratch/` with a one-line README explaining what they were.

4. **`.gitignore`:** Remove `package-lock.json` from `.gitignore` and commit the lockfile. Reproducible installs are worth the diff noise.

**Done when:** root directory has no stale planning docs (only superseded banners remain), `CLAUDE.md` matches reality, lockfile is tracked, and this doc is the only living plan.

---

## Stage 4 — Finish the modularization (one PR per slice) — ✅ Completed

**Goal:** Drain the remaining ~2,400 lines of inline JS out of `index.html` so it's bootstrap +
DOM markup only — **under ~500 lines**. Each slice is its own small PR; the Stage-2 safety net means
we can refactor without fear. Drive the work off the Section 1c buckets. **One module per feature.**

**Slice order (smallest blast radius first):**

1. **Bucket B quick wins** — pure moves, low risk. Do these first to shrink the file and build
   momentum: data tables → `js/data/country-data.js`; coord helpers → `js/utils/coordinates.js`;
   `animateFlagWave` → flag module; quiz helpers → `quiz-utils.js`; loading/SEO → `loading.js`;
   UI-sync helpers → `ui-sync.js`; `zoomOutToDefault`/`onWindowResize`/`setupLights` → core modules.

2. **Bucket C feature modules — one PR each, in increasing risk order:**
   `color-editor.js` → `zoom-editor.js` → `small-country-indicator.js` → `quiz-ui.js` →
   `label-editor.js` → `pointer-controls.js` (the pointer dispatch is riskiest; do it last).
   Each module creates its own DOM (moving the relevant static modal/panel markup out of
   `index.html`) and reads/writes shared state through `js/data/state.js`.

3. **State consolidation (threaded through the slices):** as each module is extracted, migrate the
   globals it owns from module-level `let`s into the centralized `state` object. By the end,
   `syncStateWithVariables()` (line 520) should be unnecessary and can be removed.

4. **Final glue pass:** what remains in `index.html` is imports, a single `app.init()` (manager
   construction + wiring + render-loop registration), and the markup shell. **Target: <500 lines.**

For each slice: move code module-by-module, run tests, eyeball the page, delete dead inline code
(no commented-out blocks). Opportunistically apply the `.hidden`-class cleanup from Section 1b.

**Done when:** `index.html` is under ~500 lines and contains no JS implementation logic beyond bootstrap.

---

## Stage 5 — Performance & correctness polish (one PR) — ⬜ Pending

**Goal:** Address the smaller efficiency/correctness items that aren't outright bugs but are worth fixing once the structural cleanup is done.

1. **Tighten `_lookupIdLoose`** (`globe.js:487`). Replace the symmetric substring match with: exact match → normalized exact match → prefix match. Add a unit test that asserts "Niger" and "Nigeria" don't collide.
2. **Decide override precedence.** Document (and enforce in code) which wins when both `country-colors.json` and `label-config.json` set conflicting values. Add a comment near the loader.
3. **Confirm gzip in production.** (Cross-ref Stage 6.) Verify `Content-Encoding: gzip`/`br` on `.bin` files. The 16 MB raw `world-id.bin` shrinks to ~90 KB gzipped — without it, mobile users eat the full 16 MB.
4. **Optional: drop `getCountries()`.** It returns `[]` with a deprecation comment. Grep for callers; if none, delete it.

**Done when:** the cosmetic items above are cleaned and a perf-sanity pass on a low-end mobile (or DevTools CPU throttle 4×) holds 60 FPS during idle rotation.

---

## Stage 6 — Deployment & SEO hardening (one PR) — ✅ Completed

**Goal:** Make the site production-ready. Pulls the concrete, code-touching items out of
`DEPLOYMENT_GUIDE.md` and `docs/deployment/temp_deploy.md` — see those docs for the full
Cloudflare/nginx how-to, cost analysis, and AdSense/Analytics setup.

1. **Remove the eruda debug console** (was in `index.html` `<head>`). ✅ Done — the CDN loader,
   `__GLOBE_DEBUG__` gate, and the settings-drawer launcher have all been deleted; no eruda code
   ships.
2. **Hide dev-only UI for production** (per `temp_deploy.md` "Hardening before sharing"): the
   `#bounce-btn`, `#shatter-btn`, `#pinball-btn` mobile dev buttons, `#dev-edit-toggle`, and the
   light-dev panel (also resolves the Section 1b JS-injected-CSS item).
3. **SEO `<head>`** (from `DEPLOYMENT_GUIDE.md` §5): real `<title>`/description/keywords, Open
   Graph + Twitter card tags, `<link rel="canonical">`, favicons, and JSON-LD `WebApplication`
   structured data.
4. **Static SEO/infra files:** `robots.txt`, `sitemap.xml`, and a Cloudflare `_headers` file
   (security headers + `Cache-Control` immutable for hashed assets + gzip/br for `.bin`/`.js`/`.css`).
5. **Optional: service worker / PWA** caching of the heavy `.bin` assets for repeat visits.

**Done when:** no dev tooling ships in the production bundle, the `<head>` carries full SEO/social
metadata, and `_headers`/`robots.txt`/`sitemap.xml` exist. Validate with Lighthouse (SEO + best
practices) and confirm `Content-Encoding` on `.bin` responses.

---

## Stage 7 — Optional next bets — 🟡 In progress

These aren't required by the review but are natural follow-ups now that the codebase is clean:

- **Country borders.** ✅ **Done.** Drawn as a line that shares the fill mesh's *exact* vertices, so it sits on the fills with no gap and — critically — **no parallax**. `extractBorderEdges()` in `build-textures.js` pulls the merged mesh's boundary edges (edges used by exactly one triangle = each country's outline + coastlines, since countries don't share vertices) and writes them as u32 vertex-index pairs to `assets/world-border-lines.bin` (~2.7 MB / ~840 KB gzipped, 354k edges). At runtime (`js/core/globe.js`) `_buildBorderLines()` builds a `THREE.LineSegments` that reuses the country mesh's `position` attribute + these indices, added as a child of the country mesh (inherits scale/animation). A flat depth-biased shader nudges it toward the camera in clip space (`BORDER_DEPTH_BIAS`) to avoid z-fighting **without a radial lift** — the earlier approaches put the line at a larger radius, which drifted off its boundary near the globe's limb. Constant 1px (WebGL line-width cap = same width at every zoom). Runtime control via `globeManager.setBorderVisible/Opacity/Color`; the settings gear's checkbox + opacity slider drive these (persisted keys `borders`/`borderOpacity`).

  History: this replaced two rejected attempts — (1) a runtime vector `LineSegments` overlay from `countries.geojson` (raised radius → parallax; coarser simplification), and (2) a baked equirectangular distance field sampled in the shader (resolution-limited, soft/imprecise at closest zoom). The current line is exact because it *is* the fill outline. `tests/border-edges.test.js` covers the extraction.
- **UI theming (design tokens + live theme switcher).** ✅ **Done.** To let the team iterate on
  appearance from one place, `styles.css` gained a `:root` design-token layer (primitives +
  semantic aliases; see §1b) and every literal was swept onto tokens — the sweep was a property-aware
  postcss transform whose self-check proves resolved-value equivalence, so the default is
  pixel-identical (confirmed by a headless-Chrome before/after diff: differences confined to the
  animated globe, UI chrome zero-diff). On top of that, `js/features/theme-switcher.js`
  (`applyTheme`/`getTheme`/`initTheme`) flips `<html data-theme>` to swap the whole token set live
  via `:root[data-theme="soft"|"sharp"|"mono"]` override blocks; the choice persists through
  `settings-store.js` and `initTheme()` applies it before first paint (no default-look flash). The
  settings gear (`settings-panel.js` `_buildAppearance`) exposes it as a "UI theme" segmented
  control mirroring the colour-scheme picker. Surfaces outside CSS follow via `js/utils/theme.js`:
  the canvas globe labels/markers (`labels.js`/`markers.js`) read the UI font through `canvasFont()`
  and re-bake on the `globe3d:theme-changed` event (`repaintAllLabels`); the audit panel's injected
  `<style>` and the search dropdown's data-driven inline colours reference tokens. `index.html` gains
  only the import + one `initTheme()` call. Adding a theme = one `THEMES` entry + one
  `:root[data-theme]` block. **Note:** `dist/` is a build artifact — run `npm run build:pages` to
  sync the tokenized `styles.css` (and rebuilt pages) into `dist/` before deploy.
- **Backend-persisted themes + admin live editor.** ✅ **Done.** So an admin can author shared themes
  that test users switch between (localStorage can't share across users). New Django app
  `backend/themes/` — `Theme { name, base (built-in preset), tokens (JSONField {"--var":"value"}),
  is_published, created_by }`. API mirrors the `/api/audit/*` split: public `GET /api/themes`
  (published only, like `daily_leaderboard`) + superuser-gated `GET/POST/PUT/DELETE /api/admin/themes`
  reusing `quiz.audit_auth.require_audit` (the signed `X-Audit-Token`; already re-checks superuser per
  request). `themes/tokens.py` allow-lists writes to the ~23 curated knobs and constrains values (an
  injection guard — no `url()`/selector break-out). Registered in Django admin as a fallback CRUD
  surface. Frontend: `ApiClient` gains `listThemes`/`listAllThemes`/`create|update|deleteTheme`;
  `theme-switcher.js` now handles **remote** themes (a `{base, tokens}` applied as the base preset's
  `data-theme` attr + inline `--token` overrides, cleared/re-applied on switch, cached in
  `settings-store` `themeInline` for pre-paint apply) alongside built-ins; the settings-gear selector
  lists built-ins + published remote themes (`getAvailableThemes`, rebuilt on `onThemesChanged`).
  `js/data/theme-tokens.js` is the frontend mirror of the backend allow-list (drives editor rows +
  inline-clearing; kept at 44). The **live editor** `js/features/theme-editor.js` is a right-anchored
  sheet (no scrim, so the app stays visible and re-themes as you edit) with a preview strip and typed
  rows (color swatch+alpha, radius range, weight select, font text+datalist); it previews via inline
  `setProperty` (debounced `THEME_EVENT` only on font change) and saves through the audit-gated API.
  It is lazy-loaded from a settings button gated on `sessionStorage[AUDIT_TOKEN_KEY]` (mirrors audit
  mode), so players never download it. `index.html` gains one `initRemoteThemes(apiClient)` call.
  **Deploy:** ship the migration (`manage.py migrate` on the API host) alongside the frontend.
- **Admin-themeable 3D scene appearance.** ✅ **Done.** The CSS theme pipeline can't reach the
  Three.js scene, so a theme now also carries a scene look applied **imperatively**: `Theme` gains
  `scene_bg` / `ocean_color` / `country_scheme` fields (backend migration `0002`; validated by
  `tokens.validate_color` + a `COUNTRY_SCHEMES` allow-list that mirrors `SCHEMES` in
  `js/features/color-schemes.js`), surfaced camelCase (`sceneBg`/`oceanColor`/`countryScheme`) by the
  serializers. New applier `js/features/scene-appearance.js` (`initSceneAppearance`,
  `applySceneAppearance`, `resolveActiveScheme`) captures the app-default bg/ocean at init, applies
  the active theme's block, and re-applies on every non-preview `THEME_EVENT`; `theme-switcher.js`
  exposes `getActiveSceneAppearance()` and caches the block in `settings-store` `themeScene` for a
  no-flash pre-fetch apply. Setters added: `SceneManager.setBackground`, `GlobeManager.setOceanColor`.
  `color-schemes.js` gained three hue-family presets (`blues`/`purples`/`greys`; `applyScheme` now
  keys off `FAMILIES[key]` generically) — they auto-populate both the settings-gear picker and the
  editor's new "Scene" group. A theme-pinned `countryScheme` wins over the gear picker via
  `resolveActiveScheme()` (the picker is a live, non-clobbering override); `settings-panel.js`
  applies it without persisting. `index.html` gains one `initSceneAppearance({sceneManager, globeManager})`
  call after the settings panel. **Deploy:** ship migration `0002` with the frontend.
- **Token consolidation (radii).** ✅ **Done.** Reduced the 20 radius tokens to **2 editable knobs**
  — `--radius-btn` (buttons + all controls), `--radius-panel` (containers) — plus **2 fixed shapes**
  (`--radius-pill` 999px, `--radius-circle` 50%, not editable). Every `var(--radius-*)` reference was
  swept by element role (postcss `radius-remap.mjs`); the global `button` rule now points at
  `--radius-btn` so button roundness is real and uniform, with `!important` shape-exceptions for the
  `<button>`s that must stay round/pill (`.flag-close`/`.qz-close`/`.qsv-close`/`.settings-swatch`
  circles, `.qmp-segment` pill). Theme blocks + `theme-tokens.js` + `backend/themes/tokens.py` updated
  (editable knobs 44 → 26). First of a series — colours/weights are candidates for the same treatment.
- **Token consolidation (backgrounds).** ✅ **Done.** Collapsed the ~29 navy surface backgrounds into
  a **3-tier surface system** — `--bg-app` (base backdrop + recessed inputs), `--bg-panel` (the bulk of
  floating panels/sheets/cards, translucent), `--bg-elevated` (raised/prominent surfaces: results card,
  modals) — plus `--scrim` (modal dim). Every `var(--bg-*/--navy-*)` background reference was swept by
  value+role (postcss `bg-remap.mjs`); state tints (correct/wrong), accents, and non-surface neutrals
  were kept distinct per the brief. This retired `--bg-deep/-raised/-overlay` and **all 25 `--navy-*`
  primitives** (`--navy-18` folded into `--border-subtle`, same value). Theme blocks + `theme-tokens.js`
  + `backend/themes/tokens.py` updated; editable knobs stay 26 (3 surfaces + scrim swap in for the old
  4 bg tokens).
- **Token consolidation (accent).** ✅ **Done.** The prominent oranges (CTA, "Whole globe" segment,
  mode icons) were painted with raw `--amber-*` primitives the editor couldn't touch. Collapsed the
  **42 `--amber-*` tokens** onto a single editable **`--accent`** (+ `--on-accent` for dark text on it);
  everything orange now *derives* from `--accent` via `color-mix` — solid fills `var(--accent)`, glows
  `color-mix(in srgb, var(--accent) N%, transparent)`, gradient tops `color-mix(…, white N%)` — so one
  knob recolors it all (postcss `accent-remap.mjs`, 134 refs). `--accent-amber` removed; `--accent-soft`
  redefined as a derived alias. Per the brief, gold/markers/progress fold into `--accent` too. Also
  fixed the one JS-embedded amber (the results-ring SVG gradient in `quiz-results-modal.js` → `var(--accent)`).
  Editable knobs 26 → **25** (accent family 3 → 2).
- **Token consolidation (fonts).** ✅ **Done.** Collapsed the 4 font tokens to **2 editable knobs** —
  `--font-display` (headings/wordmark) and `--font-ui` (everything else / body). `--font-base` (Arial
  body default) folded into `--font-ui`; `--font-mono`'s one usage became a literal `monospace`. Both
  knobs are now a **dropdown** in the editor (`FONT_OPTIONS` in `theme-editor.js`) offering the two
  bundled webfonts (Fredoka, Archivo — loaded in `index.html`) + a device sans-serif + a device
  monospace. `canvasFont()` (globe labels) now reads `--font-ui`. Weights stay at 4. Editable knobs
  25 → **23**.
- **Token consolidation (shadows/glows).** ✅ **Done.** ~40 ad-hoc `box-shadow`/glow declarations —
  each re-typing its own offset/blur/spread, with no shared recipe — collapsed onto a **6-token fixed
  set** in `:root`: a `--shadow-low/-mid/-high` elevation scale (thumbnails / controls / modals+
  containers), `--shadow-dock` (bottom-docked sheets, same weight cast upward), `--glow-cta` (one recipe
  for every primary accent CTA — the worst-drifting family: blur 14→38px & accent 30→50% before), and
  `--glow-accent` (the pulsing radial halos). Each references a themed colour token (`--neutral-13`/
  `--accent`), so the whole shadow system adapts per theme with **no** per-theme redefinition. Also
  retired the two hardcoded `rgba()` shadows (`.theme-editor`; the injected `#audit-panel` in
  `audit-mode.js` → `var(--shadow-dock)`) and the blue-vs-black container-shadow mismatch. Tokens are
  **fixed** (like `--radius-pill/-circle`, not editable knobs), so `theme-tokens.js`/`tokens.py` and the
  23-knob count are unchanged. Left as-is: feedback state rings (`0 0 0 3px`) and the `.level-btn`/
  `.swatch` selection glows (state indicators, not elevation). **Both glow tokens are currently
  disabled** at source (`--glow-cta: none`, `--glow-accent: transparent`) per request — glow is off
  app-wide, tokens + all `var(--glow-*)` usage sites retained, reversible by restoring the `was:`
  values; the `--shadow-*` elevation tokens are unaffected.
- **Search index.** Replace the linear `Array.filter` in `search.js` with a small trigram index or a sorted prefix array for O(log n) lookups. Not urgent at ~250 countries.
- **Multi-language labels.** Listed in `CLAUDE.md`'s future ideas; the label pipeline is now isolated enough to support this cleanly.
- **Browser Back → exit overlay to globe.** ✅ **Done.** `js/features/back-button-guard.js` — the app's first and only use of the History API. Pressing Back while any overlay "screen" is open (a practice quiz, the daily challenge, the results modal, the daily leaderboard, the quiz mode picker, or the stats sheet) returns to the bare globe, equivalent to the in-app ×; Back from the globe navigates away normally. Model: while an overlay is open, exactly one guard entry (`history.state.g3dGuard`) is kept pushed *above* the app's own entry, so the first Back pops the guard (never the real page); a `popstate` handler then closes the overlay. Reconciliation is **lazy** — the guard is pushed when an overlay opens but not eagerly removed on in-app close; the harmless stale guard is self-consumed by the next real Back (avoids a programmatic-`history.back()`/suppress-flag race). Overlay state is read from signals the app already maintains — body classes `quiz-active`/`dq-active`/`celebration-active` plus `quizModePicker.visible`/`quizStats.visible` — so no quiz module was touched; a `MutationObserver` on `document.body` + the picker/stats containers drives reconciliation, and its microtask batching makes the synchronous quiz→results and results→play-again class swaps a no-op (no guard flicker). `_initFromHistory()` (at construction + on `pageshow`/bfcache) re-adopts a guard entry that survives a reload. `index.html` gains only the import + one `new BackButtonGuard({...})` near the daily-quiz init (~line 648).

---

## Stage 8 — Daily Challenge + Django backend — 🟡 In progress

A new once-per-day, timed quiz with server-side grading and a global leaderboard. Unlike the four
existing **practice** quizzes (`js/features/quiz/*`, client-generated, unchanged), the Daily
Challenge is **backend-driven**: a self-hosted Django API owns question generation, grading,
cumulative scoring, ranking, and the country dataset the bespoke question types need. The static
frontend (Cloudflare) calls it cross-origin. Full design + decisions:
`/home/john/.claude/plans/discussion-only-no-plan-prancy-moonbeam.md`.

**Backend (new `backend/` Django project — self-hosted, not on Cloudflare):**
- `geo` app — `Country` reference data (borders, landlocked, capital, region) seeded from a vendored
  `world-countries` (restcountries mirror) snapshot via `manage.py seed_countries`, reconciled to
  globe names **by ISO-2** (`geo/data/mesh_iso.json` + `geo/aliases.py`). Regenerate the vendored
  data with `npm run build:geo-data`.
- `players` app — anonymous `Player` (device token + nickname + country); `email`/`ads_removed`/
  `stripe_customer_id` fields reserved for Stage 9.
- `quiz` app — `DailyQuiz`/`Question`/`Attempt`/`AnswerRecord`, deterministic date-seeded lazy
  generation (`quiz/generation/`: core 3 + bespoke bordering/landlocked/coastline/region-click),
  server grading + cumulative score + client-time clamp, DRF endpoints under `/api/`. The daily mix
  is weighted (`COMPOSITION_WEIGHTS`) with exactly one `capital` and per-type hard caps
  (`TYPE_CAPS`: bordering ≤ 2, landlocked ≤ 1, coastline ≤ 1) enforced by `_type_sequence`.
- `stats` app — staff-only templated dashboards (`/stats/`): leaderboard, per-question difficulty,
  participation.
- Tests: `backend/*/tests.py` (generation determinism, grading incl. multi-select exact-match,
  one-attempt-per-day, leaderboard ordering, seed reconciliation guard). Run `manage.py test`.

**Frontend (new modules — `index.html` touched only by an import + one instantiation):**
- `js/data/api-client.js` — fetch wrappers + device-token identity. **Extracted to
  `packages/api-client` (stage A4);** this file is now a ~15-line web binding that supplies the
  `window`-sniffed API base and the localStorage/sessionStorage adapters. `ApiError`,
  `AUDIT_TOKEN_KEY` and `isLocalDevHost` are re-exported, so call sites are unchanged.
- `js/features/daily-quiz/` — `daily-quiz.js` (orchestrator, builds its own launch button + panel),
  `question-renderer.js`, `options-grid.js` (reusable variable-dim grid), `onboarding.js`,
  `leaderboard.js`, `panel-sheet.js` (drag/tap the panel down to a "peek" top bar so the globe shows
  through — pure `decideSnap()` is unit-tested in `tests/panel-sheet-snap.test.js`). This is a
  **feature sub-folder** — a deliberate exception to the "one module per
  feature" rule, mirroring the existing `js/features/quiz/` precedent (a cohesive multi-file
  feature, not micro-modules).
  - The panel UI reuses the practice quizzes' Terragotcha chrome: the header is built from the
    shared `.qz-bar`/`.qz-stat`/`.qz-progress` classes + `svgIcon()` (progress label · score chip ·
    a live count-up timer chip driven by `formatDuration()` · close), and `options-grid.js` emits
    `.quiz-option` cells + `.qz-mark` reveal icons against the shared `--qz-*` tokens (daily-scoped
    rules under `.dq-grid` keep variable columns + a distinct gold "missed" cue). The end-of-quiz
    leaderboard is restyled to the same palette. No new `index.html`; all CSS in `styles.css`.
- `js/features/quiz/quiz-invite.js` — bottom-sheet reminder nudging the regular quizzes
  (shares the daily invite's `#dq-`/`#qz-` CSS). Appears after the daily prompt resolves
  (`globe3d:daily-resolved`), shows once (localStorage), and on dismiss fades out + jiggles
  the Take Quiz button.
- `js/features/main-cta.js` — wraps the pre-existing `#take-quiz-btn` in `#main-cta-cluster`
  (amber "Give me a quiz" pill + pulsing glow + two-line scope subtitle) per
  `design/main_buttons`. The docked Daily Challenge pill (`#dq-today`, now a translucent
  **violet ghost pill** with a `calendar-dots` icon) sits in the same cluster slot. Placement is
  responsive: desktop top-left, mobile bottom-right (Quiz hugging the corner; hidden while a
  bottom-sheet invite is open). Introduces the `--violet-400` secondary accent token. All CSS in
  `styles.css`; `index.html` gains only an import + one `initMainCta()` call.
- `js/core/camera-controls.js` — added `frameView()` / `clearViewOffset()` for map questions
  (focal-anchor offset via `camera.setViewOffset`, math extracted to pure `js/utils/view-offset.js`,
  unit-tested in `tests/view-offset.test.js`). Framing distance for a clicked/searched country (≤40%
  of the screen) and a quiz *subject* (≤20%) is computed by `framingDistanceFor()` from the
  country's bbox width + live FOV/aspect (`focus-zoom.framingDistance`); the A–H `LEVEL_DISTANCES`
  now only drive the label-appearance threshold, not framing.
- `js/features/pointer-controls.js` — added a `dailyQuiz` map-click hook alongside the `clickQuiz`
  hook.
- `js/core/context-recovery.js` — WebGL context-loss recovery for the main globe canvas.
  `installContextRecovery(sceneManager, { globeManager })` (wired once in `index.html` init after
  `setupEventListeners()`) listens for `webglcontextlost`/`webglcontextrestored`: on loss it pauses
  the render loop, shows a `.context-recovery-toast` (styled in `styles.css`), and arms a ~4s
  fallback that `location.reload()`s if the browser never restores the context (the symptom when a
  tab is frozen/backgrounded). On restore it nudges app-managed textures via
  `globeManager.markTexturesForUpdate()` and resumes the loop. Scope is the main globe only.
- `js/utils/webgl-diagnostics.js` — `createWebGLRenderer(options, { label })` wraps
  `new THREE.WebGLRenderer(...)` so a *creation* failure (Three's bare `Error creating WebGL
  context.`) logs an actionable console report instead of a mystery error: the browser's real
  `webglcontextcreationerror` `statusMessage`, a per-type context probe (`webgl2`/`webgl`/
  `experimental-webgl`) with unmasked GPU strings, the `WebGL(2)RenderingContext` constructor
  presence, a session renderer-count (context-exhaustion tell), and UA/env. Console-only (no UI);
  success path is identical to the raw constructor (it just pre-creates the `<canvas>` so the
  error listener attaches before `getContext`). Routed through by all four renderer sites —
  `scene.js` (`globe`), `flag-renderer.js` (`flag`), and `identify-flag-quiz.js` ×2 (`quiz-flag`).
  Complements `context-recovery.js` (loss *after* creation); this covers creation itself.
- `js/features/webgl-fallback.js` — `showWebGLFallback(error)` is the user-facing recovery for a
  WebGL *creation* failure. The throw from `createWebGLRenderer` escapes the bare `init()` call
  (first failure is the hover-flag renderer at `index.html:403`, before `loadGlobe`), which would
  leave the opaque `#seo-content` splash frozen forever. Wired via a `try/catch` around `init()`
  (`index.html`, one import + the wrap): on catch it hides the stuck splash directly (`elements`/
  `hide` from `dom.js` — *not* `hideLoading()`, to avoid firing `globe3d:intro-dismissed` on a dead
  app) and shows a full-viewport fallback card (`.webgl-fallback*` in `styles.css`, `z-index:10001`
  above the app max, inline-SVG warning glyph, "3D graphics couldn't start" + Reload button). The
  Stage-1 console diagnostics still fire underneath. Trio with `webgl-diagnostics.js` (why → console)
  + `context-recovery.js` (loss after success) + this (creation failure → user recovery).

**Remaining in this stage:** browser verification pass; wire `manage.py generate_daily` to cron if
pre-warming is wanted (otherwise generation is lazy on first request).

## Stage 9 — Ads + Stripe "remove ads" + account upgrade — ⬜ Pending

Deferred. Ad integration gated by `Player.ads_removed`; Stripe Checkout + webhook to set the
entitlement; optional email/account upgrade linking the device token to an email. Data model is
already forward-compatible (fields exist, unused).

---

## Backend + frontend monitoring — ✅ Completed

Observability for the Daily Challenge backend + static frontend, wired to an existing remote
Prometheus / Grafana / GlitchTip box. Plan:
`/home/john/.claude/plans/i-want-to-implement-optimized-ember.md`; runbook + all server-side
config: `backend/deploy/monitoring/README.md`. Scrape transport is IP-allowlisted ports (ufw
scoped to the Prometheus IP; not through Cloudflare); errors go to GlitchTip.

**Backend (`backend/`):**
- `django-prometheus` metrics at `/metrics` (request latency/counts, DB query counts/latency,
  responses by status), **multiprocess-aggregated** across gunicorn workers via
  `PROMETHEUS_MULTIPROC_DIR` (`deploy/gunicorn.conf.py` `on_starting`/`child_exit` hooks +
  `globe3d.service` `Environment=`). Tuned `PROMETHEUS_LATENCY_BUCKETS`;
  `PROMETHEUS_EXPORT_MIGRATIONS=False`.
- `config/health.py` — `/healthz` (DB `SELECT 1` + Redis PING; JSON + 200/503).
- `sentry-sdk` → GlitchTip, DSN-gated (`GLITCHTIP_DSN`), `send_default_pii=False`, device/audit
  tokens scrubbed.
- New `LOGGING` dict routes 500 tracebacks to stdout→journald (Django's default swallows them
  with `DEBUG=False`).
- `/metrics` + `/healthz` denied on the public `nginx-globe3d.conf`; served only via the
  IP-allowlisted `deploy/monitoring/nginx-metrics.conf` (`:9145`).

**Frontend:**
- `js/features/error-reporter.js` — prod-gated (`isProdHost`) + DSN-gated (`GLITCHTIP_DSN` in
  `js/data/site-config.js`) console-error reporter; lazily imports the Sentry browser SDK from
  jsDelivr and installs global `error`/`unhandledrejection` capture. `index.html` gains only an
  import + one `initErrorReporter()` call (run first, before the app, for start-up coverage).

**Server-side (config committed, applied on the box):** `backend/deploy/monitoring/` —
node/postgres/redis exporter units, `create-monitoring-role.sql`, `nginx-metrics.conf`,
`ufw-metrics.sh`, `prometheus-scrape.yml`, `alerts.yml`, `grafana-dashboards.md`, runbook README.

## Quiz history & progress tracking — ✅ Done

Local-first history for the four **practice** quizzes (the Daily Challenge already has server-side
scoring and is untouched). Per-quiz, per-question results persist to `localStorage` and surface as a
progress screen plus a best/new-best badge on the end-of-quiz results modal (`quiz-results-modal.js`).

- `js/data/quiz-history-store.js` — singleton store (key `globe3d-quiz-history`), same
  guarded-read/write shape as `settings-store.js`. **Both stores were extracted to
  `packages/storage` (stage A3)** and take an injected `StorageAdapter`; the `js/data/` files are now
  thin bindings that construct them against localStorage. Holds a pruned session log (last 200) of
  `{ ts, mode, scope, score, total, durationMs, questions: [{country, correct}] }` plus a permanent
  per-country tally that survives pruning. API: `record()` (returns a best/new-best summary),
  `getSessions()`, `getModeStats()` (per mode×scope bests + best/avg time), `getCountryStats()`
  (worst-accuracy-first), `getTotalGames()`, `clear()`. Also exports `MODE_LABELS` and
  `formatBestSuffix()` (the overlay suffix builder).
- The four quiz modes (`name-flag`, `identify-flag`, `click-country`, `capital`) import the store
  singleton directly (mirroring how they import `state`), accumulate a `questionLog` at their
  existing correctness checkpoints, and call `record()` in `end()` — sourcing `durationMs` from the
  value already computed there (shared `QuizTimer.stop()`, or the click quiz's `timeUsed`). Cancel
  paths never reach `end()`, so abandoned quizzes aren't recorded.
- `js/features/quiz/quiz-stats.js` — self-contained bottom-sheet (shares the mode-picker `qmp` look
  under a `qsv-` prefix in `styles.css`): per-mode bests, "Countries you keep missing", recent
  games, and a clear-history control. Opened from a "View your progress" link in
  `quiz-mode-picker.js` (new `onStats` option). `index.html` touched only by an import + one
  instantiation + passing `onStats`.
- Out of scope (possible phase 2): mode-picker tile badges and a weak-countries *drill* quiz seeded
  from `getCountryStats()` (the store already supports it).

---

## Shared quiz question chrome (`quiz-question-chrome.js` + `.qz-*` CSS)

The redesigned in-quiz question screen (top bar / stat chips / progress bar / two-line
prompt) is a **single reusable component**, `js/features/quiz/quiz-question-chrome.js`,
plus one shared, mostly-unscoped CSS layer (the `.qz-*` classes + the `--qz-*` semantic
colour tokens in `styles.css`). Built to serve all four quizzes; adopted so far by:

- **Identify the flag** (`identify-flag-quiz.js`) — `variant: 'fullscreen'`: the chrome
  takes over the screen (`body.flag-quiz-active`, navy gradient, globe hidden).
- **Name the country** (`name-flag-quiz.js`) — `variant: 'floating'`: the chrome floats
  over the **live globe** (`body.globe-quiz-active`) as a bottom-right card (desktop) /
  bottom sheet capped at `33vh` (mobile). Implements `design/name_country_quiz/`.
- **Capital cities** (`capital-cities-quiz.js`) — `variant: 'floating'`, same globe-floating
  card; `reverse` prompt layout naming the given country/capital.
- **Find the country** (`click-quiz.js`) — `variant: 'floating'`, same globe-floating card.
  No answer grid: the answer is a globe map-click. `reverse` prompt ("CLICK" / country name)
  plus a reused `.dq-map-hint`; no timer pressure (count-up `QuizTimer` only, like its
  siblings). Replaced the old bespoke `#click-quiz-*` DOM/CSS + 45s countdown.

Shared pieces (no per-quiz duplication): the chrome markup/JS, `#quiz-options.qz-answers`
(name-pick option grid: idle/hover/`.correct`/`.incorrect`/`.dimmed` states + the
`.qz-mark` result badge), and the `--qz-correct-*` / `--qz-wrong-*` / `--qz-opt-*` tokens.
Only **container geometry** is scoped by body class (`flag-quiz-active` vs
`globe-quiz-active`). `setPrompt({layout, eyebrow, main, mainQuestion})` is copy-driven so
each quiz supplies its own prompt. All four quizzes now use this chrome. *(CSS gotcha when editing the token comment: never
write a literal `*/` — e.g. `--qz-correct-*/...` — inside a `/* */` block; it closes the
comment early and silently drops the following `:root` rule.)*

## Cross-cutting conventions

- **One stage = one PR** (or one slice = one PR within Stage 4), with a body that links back to this doc and notes which numbered items were completed.
- **No mixing.** Don't slip a Stage-4 module move into a Stage-1 bug-fix PR; reviewer cognitive load is the whole reason for the staging.
- **Tests stay green at every stage.** Stage 2 onward, no PR merges without `npm test` passing.
- **New code respects CLAUDE.md's `index.html` budget:** no new CSS in `index.html` (use `styles.css`), no new inline `<script>` logic (use `js/` modules), prefer self-contained feature modules that build their own DOM.
- **Update this doc.** When a stage lands, edit this file to check it off and link the merged PR. The plan is a living artifact, not a historical one.
