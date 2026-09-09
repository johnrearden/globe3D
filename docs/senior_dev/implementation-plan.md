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
out-of-scope for a casual learning experience. **The three R2 objects outlived the code by two
months** — they were still uploaded and still costing 1.44 GiB of the 10 GB free tier when spotted
during the 2026-08-23 asset deploy, and were deleted then, along with the orphaned
`build-pmtiles-layers.mjs` generator and its `protomaps-themes-base` devDependency. Deleting a
feature is not finished until its deployed artefacts go too. A new reusable `js/core/markers.js` (`MarkerLayer`,
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
panel. Ad *units* remain deferred until `globe3d:intro-dismissed` — the loader alone renders
nothing. (That event no longer coincides with a splash fading out; since the landing panel replaced
the splash it simply marks "the globe is ready".)
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
| Head / meta / external `<script>`s | 3–224 | confetti CDN (11), the `<script type="importmap">` that resolves `three` + `@terragotcha/*` by bare specifier (three.js and OrbitControls were `<script src>` tags until stage A8), Google Fonts (Fredoka/Archivo) |
| Landing panel (`#landing-panel`), `#container`, top buttons | ~96–210 | **The splash overlay (`#seo-content`) and its `.sr-only` block are gone.** In their place is a generated static content panel — markup written between the `BEGIN/END GENERATED: landing panel` markers by `build-landing-facts.mjs` from `landing/landing-facts.json`, styled in `styles.css`, behaviour in `js/features/landing-panel.js`. It is the apex's crawlable content (~700 words, links to every published `/country/*` page) and it paints before the globe, which slides in on `globe3d:intro-dismissed`. Do not hand-edit the generated block — `npm test` runs `build-landing-facts.mjs --check` and fails if it is stale. `.sr-only` REMAINS in `styles.css` for the `/borders/*` pages, which use it on `.lp-answer`. Also here: zoom/quiz/bounce/shatter/pinball/edit/color/zoom-editor toggles |
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
3. **Confirm gzip in production.** (Cross-ref Stage 6.) Verify `Content-Encoding: gzip`/`br` on `.bin` files. (Done — see `compress-assets.mjs` / `npm run build:assets`.) `world-id.bin` is now 8 MB raw and ~52 KB brotli.
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
- The design system's source of truth is `packages/design-tokens` as of stage A7 — 14 knobs
  generating the CSS, React Native and backend-allow-list artefacts (`npm run build:tokens`, checked
  for staleness by `npm test`). `styles.css`, `js/data/theme-tokens.js` and `backend/themes/tokens.py`
  still run the legacy 24-knob system until the Phase B stylesheet lands; the cutover steps are at the
  top of `backend/themes/tokens.py`.
- The quiz layer reaches the globe only through `GlobeBridge` as of stage A6 — `js/features/quiz/`,
  `js/features/daily-quiz/` and `js/features/audit/` hold no reference to `globeManager` or
  `cameraController`. Interface + test double: `packages/globe-bridge`; web implementation:
  `js/data/globe-bridge.js`.
- Quiz state lives in `quizStore` (`packages/quiz-core/src/store.js`, vanilla Zustand) as of stage
  A5, not in `js/data/state.js` — whose `quiz.*` slice was removed. Six readers (analytics,
  weak-spots, pointer-controls ×3, camera-controls, labels) now ask the store.
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

## Phase B10a — the quiz on `/app` (Astro/React) — ✅ Done

The Astro app could be read but not played: `apps/web/src` imported no workspace package
except the token CSS, and its globe loaded `scene.js`/`globe.js`/`camera-controls.js` and
nothing else — no labels, no picking, no markers. This slice closed that.

**The globe island grew interaction** (`GlobeIsland.tsx`). `LabelManager` +
`FocusZoomRegistry` (the labels need it for their appearance thresholds), `PointerControls`,
and `installContextRecovery` — without which a lost context was permanent, since the island
mounts once and never remounts. The three edit modes `PointerControls` consults became
optional via a permanently-inactive stand-in rather than eleven `?.` guards; they are dev
tools the Astro app does not build. Picks reach React through `GlobeBridge.onPick`, wired by
the pre-existing `deliverPick` seam, so no engine object crosses the boundary; the vanilla app
leaves `deliverPick` unset and keeps its direct wiring, so the two schemes coexist.

- `js/data/country-sizes.js` — `LARGE_COUNTRIES` / `SMALL_COUNTRIES` extracted from
  `index.html` so both apps draw the same labels at the same zooms. **The extraction surfaced
  three tier assignments that had silently never applied**: the mesh calls them `USA`,
  `Democratic Congo` and `Vatican`. A name matching no country does not fail — it falls
  through to the medium tier — so this was invisible in the app and in review. Pinned by
  `tests/country-sizes.test.js`.
- `apps/web/src/lib/globe.ts` — module singleton publishing the bridge + country table to the
  islands that are not the globe. Forced, not stylistic: Astro islands are separate React
  roots. `lib/globe-types.ts` restates the bridge in TypeScript, with
  `tests/globe-bridge-types.test.js` failing if it drifts from `GLOBE_BRIDGE_METHODS`.

**One runner, not four.** Every quiz-core generator already describes what the globe should do
(`payload.map`) and what the grid should show (`payload.grid`); the four vanilla modes ignored
both and hand-wrote each. Reading them leaves a per-mode table — `lib/quiz/specs.ts`: which
generator, where the answer comes from, what the eyebrow says. A fifth mode is a table entry.

- `components/quiz/` — `QuizLayer` (mounted `client:idle` in `AppLayout`, renders **null** at
  build time so every article's markup is untouched), `ModePicker`, `QuestionChrome`,
  `OptionGrid`, `ResultsScreen`, `FlagStage`, `Icon`.
- `lib/quiz/` — `modes.ts`, `specs.ts`, `globe-choreography.ts`, `useQuizSession.ts`,
  `useElapsed.ts` (the one genuine gap: elapsed time is not in quiz-core, since
  `toHistoryRecord` takes `durationMs` as an argument), `reveal.ts`.
- **Mode ids are quiz-core's `MODES` throughout**, deleting the vanilla four-arm translation
  switch. Those ids are the localStorage history keys, so a mistranslation would have filed
  sessions under the wrong mode without erroring.
- `BackButtonGuard` is replaced, not ported: it watched `document.body`'s class with a
  MutationObserver because it had no other signal. The component that starts the quiz pushes
  the guard entry itself.
- `styles/quiz.css` is authored against the 47 emitted tokens, not copied from the ~394
  legacy-vocabulary selectors in `styles.css`. `check-tokens.mjs` covers `apps/web/src`, so it
  was enforced from the first line — it caught two hard-coded flash colours, which now read
  `--status-correct` / `--status-incorrect` so the globe flash and the answer grid agree.

**Perlin left `index.html`** (`js/utils/perlin.js`, −2,230 chars, 1,266 → 1,238 lines). The
flag wave read a `window.noise` global set by an inline `<script>`, so it only worked inside
that one document. Transcribed rather than reformulated, and proved identical to the blob
across 16,000 samples over four seeds before deleting it; both consumers (`flag-wave.js`,
`flag-renderer.js`) now import the module.

**Deliberately not carried over:** the vanilla reverse flag question rendered its six options
as six viewports inside a *second* WebGL canvas positioned to line up with the DOM buttons
overlaid on it. A canvas whose contents must track the layout of elements above it is the
coupling this rewrite exists to shed, and it cost a third context. Those tiles are images now.

**Verified:** all four modes play ten questions and record to history; find-the-country
resolved 10/10 answers from globe taps; 14/14 off-centre picks resolved correctly with the
panel's view offset active; a quiz taken from `/country/france` leaves the URL, the globe and
all 290 article words intact, and Back leaves the quiz rather than the article. The production
build holds the AdSense baseline exactly — 728 and 292 words, 4 internal links each, zero quiz
markup, zero hidden text.

**Still vanilla-only** (later B10 slices): progress + settings, the Daily Challenge and
leaderboard, search, the country info panel. The dev editors (label/colour/zoom, audit mode)
are **not being ported** — `index.html` survives B11 as a dev-only tool page. It leaves the
*deploy* (`INCLUDE`) rather than the repo; see the B11 section for the distinction.

---

## Phase B10b — settings, progress and weak spots on `/app` — ✅ Done

**The design decision is a second interface, not a bigger bridge.**
`GlobeBridge` is the *quiz* boundary: its fake is what lets quiz logic be tested without WebGL,
and every method on it is something a question does. Settings are a different consumer with a
different lifetime, so `packages/globe-bridge/src/appearance.js` defines `GlobeAppearance` —
`applyAll` / `schemes` / `setCountryScheme` / `setCountriesVisible` / `setLabelsVisible` /
`setBordersVisible` / `setBorderOpacity` / `setSelectionGradient` / `setAutoRotate` /
`setLighting` / `lightingDefaults`. Same governing rule: **nothing platform-specific crosses**,
so the palette crosses as a scheme *key* and lighting as five plain numbers. Web
implementation: `js/data/globe-appearance.js`; test double: `createFakeGlobeAppearance`.

That separation is what makes the panel portable at all. `settings-panel.js` held
`globeManager`, `cameraController`, `labelManager` **and raw shader uniforms**;
`tests/quiz-layer.test.js` now fails if any of those names reappears in the React one.

**Two ordering rules are carried across with tests**, because neither throws when broken and
both present as "the setting was ignored":

1. `setBorderOpacity` before `setBordersVisible(true)`, or borders enable at the renderer's
   last strength rather than the saved one.
2. Enabling auto-rotate at boot sets `autoRotateAllowed` directly rather than calling
   `setAutoRotateAllowed(true)` — that resets the idle timer and *stops* the intro spin it was
   meant to permit.

Persisted lighting is still deferred `LIGHTING_FADE_MS` (1700 ms) past boot, because
`fadeInLighting()` ramps the same uniforms and would overwrite it mid-ramp.

**Bugs found and fixed rather than ported:**

- `getModeStats()` tracked the highest score and the highest percentage *independently*, so
  they could come from different sessions: a player whose best round was 6/6 was told "best
  7/10". They are now one session's result (`bestScore` + new `bestTotal`, ranked by `bestPct`,
  ties broken on score), and **both** stats screens read `bestTotal` instead of a hard-coded 10.
- `weak-spots-widget.js` reproduced `PointerControls.onPointerUp`'s four-call selection
  sequence by hand, with a comment admitting it. It is `globe.highlight` + `globe.focusCountry`.
- `scene-appearance.js` fell back to `'vibrant'` while `SETTINGS_DEFAULTS` and the globe island
  both said `'greys'` — three answers to one question. It reads `SETTINGS_DEFAULTS.scheme`.

**`settingsStore` gained `subscribe()` and `getVersion()`.** The version is the snapshot
`useSyncExternalStore` compares: `get()` returns a live reference by design — `settings-panel.js`
and `scene-appearance.js` both depend on it — so its identity never changes and React would
never re-render on a write.

**New in `apps/web/src`:** `components/shell/` (`ShellControls`, `SettingsSheet`, `StatsSheet`,
`WeakSpots`), `lib/settings.ts`, `lib/overlay.ts`, `styles/sheet.css` (the sheet scaffolding the
quiz had already duplicated twice), `styles/controls.css`. `ShellControls` mounts `client:idle`
beside `QuizLayer` and renders **null** until a globe exists, so the static document is
untouched. `lib/overlay.ts` is what lets the quiz's mode picker open the progress sheet across
the island boundary.

**Deliberately not included, each for a reason:**

- **UI theme / remote themes** — they need the backend cutover (B9, below). A theme control
  against the legacy 24-knob vocabulary would style nothing. The backend half has since landed;
  the picker is B9's remaining frontend half.
- **"Country info panel"** — that panel is `flag-renderer.js`, still vanilla only (B10d). A
  switch for something the app cannot show is worse than no switch.
- **The dev editors** — not being ported; `index.html` keeps them.

**Verified:** every scheme and toggle applies live and survives a reload through `applyAll`;
lighting stays gated behind the audit token; sliders drive the store from real keyboard input
(setting `.value` does not reach a React-controlled input — a harness trap, not a bug); a
finished quiz fills the progress sheet and raises the weak-spots list. Production build still
728 / 292 words, 4 internal links each, zero control markup.

---

## Phase B10c — the Daily Challenge on `/app` — ✅ Done

The first slice with a server in it. The backend owns the questions, the grading, the running
score and the board; the client owns only what is on screen and the per-question timing.

**The flow is an explicit state machine** (`apps/web/src/lib/daily/useDailyAttempt.ts`), not a
port of `daily-quiz.js:_play`. That was an async `while` loop awaiting a promise resolved from a
DOM click handler, once per question — the quiz's position lived in a call stack rather than in
a value, so nothing could render from it, and closing the panel mid-await needed a stashed
`_cancelWait` to stop a pending timer driving the quiz on invisibly. Here the position IS the
state and closing is one transition.

It is deliberately **not a quiz-core session**: `quizStore.startForeign(FOREIGN_MODES.DAILY)`
exists for exactly this, publishing "a quiz is on screen" — read by labels, auto-rotate and the
weak-spots list — without pretending there is a reducer to mirror.

**Two map appliers, kept apart on purpose.** quiz-core's block *describes* what to look at
(`focus`, `marker`) and the client chooses a camera; the server's block *is* a camera
(`center`, `zoom`, `lockRotation`). `lib/daily/server-map.ts` handles the second so neither has
to guess which shape it was handed. One rule in it is load-bearing and tested: **a map-click
question is never locked**, whatever the server sends — the player has to be able to rotate to
reach the country they mean, and `PointerControls`' drag-vs-tap threshold is what stops that
registering as an answer. A locked globe makes the question unanswerable.

**`OptionGrid` gained multi-select and a fourth reveal state.** `missed` — a right answer the
player did not pick — is its own cue *only* when several answers are right; with one there is
nothing to distinguish and showing it plainly as the answer is the teaching moment. That is the
vanilla distinction between the practice quizzes and the daily, kept rather than flattened.

**The API client is imported lazily** (`lib/daily/api.ts`), so `@terragotcha/api-client` and the
device identity land in their own ~4 KB chunk rather than the shell's — a reader who never opens
the challenge never pays for it, and it never constructs during SSR where there is no
localStorage.

`leaderboard.js` built every row as an `innerHTML` string with a hand-rolled `escapeHtml` around
nicknames **other people typed**. React escapes by construction; the helper went with the
strings. The board is still padded to ten rows, and a player who finished outside them still
gets their own row underneath.

**Not carried over:** the invite's FLIP dock animation (`daily-quiz.js:_dock`), which existed to
move a hand-built DOM node between two positions — here they are two renders of one component.
The `globe3d:intro-dismissed` event is gone too: it came from the vanilla loading overlay, so
the invite waits for the globe instead.

**Verified end to end against a stub backend speaking the real endpoint shapes**
(`packages/api-client/src/client.js` + `backend/quiz/urls.py`), since the Django app is not run
here: single-select; multi-select with correct / incorrect / missed / dimmed all landing right;
a map-click answered by tapping the globe; a flag question; the name prompt **after** the run
rather than before it; a padded board with the player's row highlighted. Reopening once
completed shows the board with the "add your name" CTA, and closing hands the globe back.
Baseline still 728 / 292 words, zero app chrome in the static document.

**Remaining in B10:** search and the country info panel (`flag-renderer.js`) — B10d. The
celebration animations are deletions, not ports.

---

## Phase B10d — search and the country info panel on `/app` — ✅ Done

The last of B10. Both are rewrites rather than ports, and both turned out to be
**bridge-only plus one gap each**.

**Search (`components/shell/SearchBox.tsx`)** is a combobox now, in `ShellControls`
beside `WeakSpots` — shell furniture, sharing the same globe handle and the same
`quizStore` suppression rather than being a fourth island. The old one had no label, no
roles and no `aria-activedescendant`, marked its cursor with an inline background colour,
and was hidden by **five other modules writing to its `style.display`**; it now reads
`quizStore.onActiveChange` and returns null, which deletes all five writers.

Three behaviours changed because they were wrong, not merely dated. Matching folded no
diacritics, so `Curaçao`, `Åland Islands`, `Réunion` and `Saint Barthélemy` — the four
accented names in the mesh — **could not be reached from an ASCII keyboard at all**.
Ranking was alphabetical, putting *British Indian Ocean Territory* above *India* for
"ind", which was not cosmetic because Enter takes the first result. And the arrow keys
wrote the highlighted name **into the input**, destroying the query with no way back.
The matching rules are `lib/search.ts`, pure and tested against the real name list;
`tests/country-search.test.js` derives the accented cases from `country-meta.json` rather
than hard-coding them, so a mesh rebuild that adds one is covered.

**The info panel (`components/shell/CountryInfo.tsx`)** reuses `FlagStage`, now
parameterised with `{width, height, className}` — a second waving-flag renderer was the
one thing worth not writing. Its canvas rule moved to `styles/flag.css`, imported by the
component, since it has two consumers now. Two vanilla behaviours are carried across
deliberately: the container is `pointer-events: none` with only the close button and the
link opting back in (a port that forgets this ships a link that renders and cannot be
clicked), and the "Read more" link is **gated on `country-pages.json`** because four
countries have articles and the other 233 would 404. `lib/published.ts` fetches that
135-byte file rather than importing `content/countries.json`, which is 14 KB of article
prose for four name/slug pairs. `astro.config.mjs` serves it in dev, where it 404'd.

**The `showInfoPanel` switch is the first setting in the sheet that drives no globe
method** — the panel is React, so enabling it is a component reading a setting. That is
why `GlobeAppearance` did not grow, and why `SettingsSheet`'s `set()` helper now takes
`apply` as optional.

**One bridge method, `onDeselect`.** Its own event rather than `onPick(null)`: every pick
subscriber grades the name it is handed, so a null would need special-casing at each of
them, and tapping empty water is a different gesture — it is how you dismiss what is on
screen. `PointerControls` publishes it through a `deliverDeselect` dep mirroring
`deliverPick`.

**One data gap, fixed at the source.** The vanilla app merged
`globeManager.getDependencyData()` into the imported `countryData` at boot
(`index.html:622`) — a module changing shape depending on who loaded first. The Astro app
never did it, so **Greenland opened with no flag and four em-dashes**: it is absent from
`countryToISO` entirely, and its population, area and language live only on the mesh
record. `createCountryTable` now builds that union where both sources are already in
scope, emitting `parent`, `population`, `areaLabel` and `language` alongside the existing
numeric `area` (km², for quiz size filtering — deliberately a different field, not a
different reading of the same one). `tests/country-table.test.js` pins it.

**The celebrations are not ported, per the earlier decision.** `quiz-ui.js:94` fires
shatter at ≤30% and confetti at 100% and says in a comment that bounce and pinball are
not called; all three survive only as buttons on `index.html`'s dev toolbar, which puts
them with the label/colour/zoom editors. They go with `js/features/**` at B11 rather than
being deleted now.

**Verified** in headless Chrome: prefix ranking, diacritic folding, arrow keys leaving the
query intact, `aria-activedescendant` tracking; a search-select and a globe tap both
opening the panel with the right facts and a published link; Greenland showing its flag,
"Territory of Denmark" and its mesh-only facts with no link; a tap on empty canvas
dismissing via the new `onDeselect`; and both surfaces standing down when a quiz starts.
528 tests. Static baseline unmoved — 4 internal links and zero app-chrome elements on both
`/app` and `/country/france`, with no `cs-`/`ci-` markup in either document.

**Remaining before B11:** B9, the backend token cutover. B11 itself is written out below.

---

## Theme Lab — editing the knobs live, in dev — ✅ Done

Independent of the B10 sequence: not blocked by B9, and B11 does not touch it.

`/app` and `/country/*` wear one generated `:root` block of 47 properties, and 14 knobs fan out
to 34 more through `derive()` — so the result of a knob change is genuinely hard to predict by
reading. `apps/web/src/components/dev/ThemeLab.tsx` edits them against the running app.

**Almost none of it was new machinery.** `applyCssVariables` (`design-tokens/src/css.js`) was
written for a theme switcher that never got built and had **zero callers**; `KNOB_GROUPS` already
carried per-knob `label` and `type` for an editor's widgets; `contrastRatio` and `pickKnobs` were
there. The panel is the caller they were waiting for, and it generates its rows from
`KNOB_GROUPS` — **a fourteenth knob needs no change to it**.

**One control per knob `type`.** Colours get a native swatch plus a text field (a hex is often
something you paste, and the picker cannot express `rgba()`). Fonts get a dropdown whose "loaded
on this page" group is read from **`document.fonts`**, not from a hand-written list — the Google
Fonts `<link>` in `AppLayout.astro` is then the only place a family is named, instead of two that
drift; the System group offers generic stacks and names no specific family. Roundness gets a
slider, 0–32px, because the useful range is small, bounded and entirely a matter of looking at
it. `tests/dev-tools-gate.test.js` asserts every `type` in `KNOBS` has a branch, since a knob the
panel does not handle renders an empty cell with nothing to notice.

**Default border strength is 0.1** (shown as 10%), down from 0.2 — the outlines read as
context rather than as a grid. Only `SETTINGS_DEFAULTS` carries that number now: the React
sheet's `?? 0.2` fallback is gone, since a restated default is the shape of the `scheme`
bug from B10b even when the value happens to agree. `tests/settings-defaults.test.js`
checks the relationships rather than the values — the default must be inside the slider's
own range, and both apps must offer the same range for the one value they share.

A reader with a saved setting keeps it; this changes only a first visit.
`js/core/globe.js:206` still builds the border line at `0.85` before settings are applied,
which is an engine default rather than a user one — unchanged here, but the gap it briefly
flashes across is now wider.

**Border *thickness* is deliberately absent, here and everywhere.** `setBorderWidth()` is a
no-op: WebGL caps line width at 1px, so it would need a fat-line mesh implementation. Border
*strength* exists and is a **user setting**, not a theme knob — `SettingsSheet`'s "Border
strength" slider over `settingsStore.borderOpacity`.

**Border *colour* became the 14th knob** (`globe-border`, "Country outlines"). It had been
`alpha(text-primary, 0.28)`, and that derivation was wrong rather than merely tight: this ink is
read against the **country palette**, which is pinned by scheme key rather than by tokens
(`COUNTRY_SCHEMES`), so a `text-primary` chosen to be legible on `bg-panel` says nothing about
whether the outlines will be visible. Two different backgrounds cannot share one colour, and
under a dark scheme the borders could vanish with no knob able to rescue them.

The default is `#eef2f6` — the same RGB the globe was already using, since `globe.js` took only
the RGB and discarded the 0.28. So the promotion changed no pixel, and the emitted set is still
**47 properties**: the name moved tier, it was not added. It carries no alpha on purpose, and a
test pins that: strength belongs to `borderOpacity`, and an alpha here would be silently dropped
and read as a knob that half works.

`globe-label` stays derived from `text-primary`. A label is read against the fill *and* the space
around it, and tracking the body text is what keeps it coherent with the rest of the type — the
argument that moved the outlines does not apply to it.

The Theme Lab picked the knob up with no change, which was the point of generating rows from
`KNOB_GROUPS`. It gained one contrast pair, "Coastlines on water" — half the question, since the
country palette is not a token; the other half is what looking at the globe is for.

**Two ways the save path lost a knob, both silent.**

The middleware loaded `theme-file.js` with a bare `await import()`, which **Node** caches
for the life of the process — and Astro reloading its config does not clear that. A dev
server running since before `globe-border` became the 14th knob went on filtering saves
against the stale 13-name list, dropping that one knob and answering `ok` for nine days.
It uses `server.ssrLoadModule` now, which goes through the module graph the watcher
invalidates. The response also reports anything `pickKnobs` refused, so a future drop
cannot be silent: the write succeeds either way, and without that the panel goes on
claiming success while the value is gone.

Worse, and entirely mine: the panel **seeded from the built artefact** while saving the
diff against defaults. Those disagree for exactly as long as it takes to remember
`npm run build:tokens` — so a knob that had been saved but not yet baked showed its
default, was not counted as an override, and **was deleted by the next save**. `GET
/__theme/current` returns the stored map and the panel seeds from that instead, so it is a
view of `theme.json` rather than of the last build.

**A rebuild has to reach the dev server.** `dist/tokens.css` is outside `apps/web`, so
Vite's watcher — rooted at the Astro project — never saw it change: the server kept serving
its cached transform and `npm run build:tokens` looked like a no-op until the dev server was
restarted. `astro.config.mjs` now watches that one file by absolute path and sends a
**full reload** rather than a CSS hot-update, because the globe reads `--globe-space`,
`--globe-border` and `--ocean` through `cssToken()` when it is *constructed* — swapping the
stylesheet under a live scene would restyle the DOM and leave the globe on the old theme.

**Persistence is `packages/design-tokens/theme.json`**, a committed knob-override map read by
`bin/build-tokens.mjs` and layered over the defaults through the `overrides` parameter that
`resolveTheme` / `toCss` / `toNativeTheme` always took. `tokens.js` keeps the system — knobs,
tiers, derivations, defaults; `theme.json` is this product's deviation from it. `src/theme-file.js`
is Node-only and deliberately **not** re-exported from `src/index.js`, which the browser loads.
A dev-only Vite middleware (`POST /__theme/save`) writes it, filtered through `pickKnobs`.

**Three globe surfaces now follow a theme**, via one new `GlobeAppearance` method,
`setThemeColors({space, border, ocean})` — plain colour strings, nothing engine-specific
crossing. Before it, `--globe-space` (`scene.js:51`) and `--globe-border` (`globe.js:205`, `:401`)
were read once at boot and frozen, and **`--ocean` was read by nothing at all**: it styled only
the `#globe-placeholder` gradient while the real water came from `DEFAULT_OCEAN_COLOR`. One knob
in thirteen did nothing to the globe it names. B9's remote themes need this same method for their
`sceneBg`/`oceanColor`.

Both callers read the three values from the **cascade** (`lib/theme-colors.ts` → `cssToken`),
never from `resolveTheme()` in JS: `theme.json` is baked in at build time, so a JS resolve returns
the unoverridden defaults and would quietly disagree with the stylesheet.

**Two bugs found and fixed on the way, neither new to this work:**

- `setBorderColor` recoloured the country outlines and left the graticule behind — its two
  `LineBasicMaterial`s were locals in `addLatLongLines`, despite the comment there saying the two
  are one ink. The legacy theme editor has always tripped over this. `tests/globe-border-ink.test.js`.
- The package's colour maths **throws** on an unparseable value (`mix`, `alpha`, `luminance` all
  do, correctly). A text field is unparseable on the way to being parseable — `#`, `#3`, `#3b` —
  so the panel holds a draft per knob and only applies values that parse. Without it the island
  unmounted mid-keystroke.

**The dev gate is the subtle part.** `{import.meta.env.DEV && <ThemeLab client:only="react" />}`
looks right and is not: a client directive is read by the Astro **compiler**, which registers the
island whether or not the expression can ever be true. The first build done that way emitted an
8 KB chunk and inlined `dev-theme.css` into all five pages. The working shape is a conditional
`await import()` of `components/dev/DevTools.astro`, which holds the directive — Rollup then has a
whole module to drop. `tests/dev-tools-gate.test.js` pins that shape, because the broken one reads
as the simpler of the two.

**Verified** in headless Chrome against the real module: the panel seeds from the built artefact
(not from defaults, so a committed theme survives the first edit); an edit to `bg-app` moves the
derived `--globe-space`; the ocean knob visibly recolours the water; a contrast pair below AA
warns; Escape restores the defaults. Production build grepped for the panel's markers — absent
entirely, no chunk, no CSS, no `KNOB_GROUPS`. Baseline unchanged: 4 internal links and zero
app-chrome elements on both `/app` and `/country/france`.

**Still emitted and read by nothing: `--globe-selection`.** Found, not fixed — giving it a
consumer changes globe appearance behaviour rather than theming.

**What this deliberately is not:** a production theme picker. `SettingsSheet.tsx` keeps its
deferral comment, which is about *remote* themes and still accurate.

---

## Phase B9 — the backend token cutover — ✅ Done

The `themes` app validated against the 24 legacy names (`--accent`, `--text-mid`,
`--bg-elevated`…), so a theme it stored could style nothing on the token-built app, and the
Astro settings sheet deferred its picker on exactly that ground. `dist/tokens.py` had generated
the replacement allow-list since the design-tokens package landed; nothing had spliced it in.

**Done (backend):**

- `backend/themes/tokens.py` now carries the generated block between `BEGIN/END GENERATED`
  markers, and `build-tokens.mjs` splices it as a **fourth artefact** — `--check` fails when it is
  stale, proven by tampering the tuple and watching the gate refuse. Spliced rather than
  overwritten because the charset regex and length cap below the block are hand-written and are
  the injection guard; those are untouched.
- Migration `0003_cutover_to_design_tokens`: deletes every `Theme` row (no mapping from the old
  names produces a theme anyone authored; superuser-gated, test users only), then removes three
  columns. `scene_bg` / `ocean_color` derive from `--bg-app` / `--ocean` now. **`base` was a fifth
  item the written steps missed**: it named a `:root[data-theme]` preset in `styles.css:203-243`,
  and the Astro app has no presets — `tokens.css` is one block and a theme is purely the deviation
  from it, the same shape as `theme.json`. `country_scheme` stays: a palette key, not a colour.
- Serializer, views and admin follow. A stale client that still sends `base`/`sceneBg`/
  `oceanColor` gets a theme with those ignored, not a 400; a client sending legacy *token names*
  gets the 400. Backend tests 30 → 25, retargeted at the rules (the 14 knobs and only those; every
  legacy group rejected; a fixed radius and a derived globe colour rejected) rather than the list.

**Done (frontend):**

- **The picker**, in `SettingsSheet`: "Default" plus every published theme, fetched when the sheet
  opens, applied through the new `lib/theme.ts`. Choosing one writes `theme: remote:<id>`, caches
  the complete knob map *and the resolved property map* (`themeInline`), and writes a pinned scheme
  into `scheme` so `applyAll` at boot needs no second source. `reconcileSelection` re-applies or
  retires the cached theme against the server's list whenever it is fetched.
- **No flash on reload.** An `is:inline` script in `AppLayout.astro`'s head copies the cached
  property map onto `<html>` before first paint; verified at `DOMContentLoaded`, before the shell
  island mounted. It derives nothing — the map is written by `lib/theme.ts` — so it cannot drift.
- **The Theme Lab promoted**, not the vanilla editor repointed: `components/dev/` is gone, the panel
  is `components/theme/ThemeLab.tsx`, reached by `React.lazy` from `ShellControls` (its own 8.9 KB
  chunk, fetched on open) and opened from settings by a session that can save — dev, or a superuser
  with the audit token. It keeps the dev-only `theme.json` save and gains publish/update/delete
  against `/api/admin/themes`, a name, a published flag, and a country-scheme row (the one row not
  generated from `KNOB_GROUPS`, because a scheme is a key, not a token). Closing it restores the
  persisted look.
- **A stored theme is the complete 14-knob map.** `applyCssVariables` writes every property from
  what it is given, so a diff would reset unmentioned knobs to the package default — not to the
  artefact with `theme.json` in it. "Default" removes the inline properties instead of applying
  `defaultTheme()`, for the same reason.
- **Two things found on the way.** Astro hoists a lazily-loaded module's CSS into every page's
  `<style>` — the Lab's rules were in the crawler-facing documents until the import became
  `?inline`. And `AppRouter` drops the whole query at boot, so `?audit=` arriving from
  `/audit/launch` was lost before any island could read it; the same inline script now keeps it.
  `lib/audit.ts` holds the pure version for the test.

**Verified** in headless Chrome against the dev server and the Django backend: token intake and
scrub; picker and Lab button; live preview writing `--primary` and its derived properties; publish
storing 14 tokens with `blues` pinned, the picker following, the cache holding the resolved map;
reload wearing the theme before the shell island mounted; Default clearing it; picking the stored
theme back into the Lab, two-tap delete, and the server agreeing. 549 tests. Static baseline
byte-identical to the previous build: 738 / 300 words, 4 links, zero chrome elements, no `.tl-`
in either document. The one console 404 is `/favicon.ico` — the B11 head gap, unchanged.

**Left behind on purpose:** the vanilla `theme-editor.js` / `theme-switcher.js` now get a 400 from
the API and are dev-page tools until B11 removes them; `js/data/theme-tokens.js` is a legacy list
nothing validates against.

---

## Phase B11 — the flip: Astro takes the apex — ✅ Done

The last phase of the rewrite, and the only one that changes what a stranger sees. Everything
before it added a surface beside the vanilla app; this one removes the vanilla app from the
front door. Written out before it starts rather than recorded after, because it is the only
slice whose failure mode is *invisible in dev* — every check below is about production.

**B9 is done**, so the settings sheet carries a theme picker and the backend speaks the 14 knobs;
the apex can flip without a second migration and without losing a control the page it replaces has.

### The flip itself is three constants — ✅ done (step 3)

| where | today | after |
|---|---|---|
| `build-pages.mjs:89` | `APEX_IS_ASTRO = false` | `true`, and `'index.html'` leaves `INCLUDE` |
| `apps/web/src/lib/routes.ts:33` | `PUBLIC_HOME_PATH ?? '/app'` | `?? '/'` |
| `src/pages/app/index.astro` | staged, `robots="noindex, nofollow"` | moves to `src/pages/index.astro`, robots override dropped |

`HOME_PATH` is already environment-driven, so the third row is a file move plus deleting two
lines of head. The canonical at `:45` is already `/` — it was written for this day.

**Done.** Plus two things the table did not list: the dev server, and the `_headers` rule. The
plan below said `dev-server.mjs` would retire once Astro owned `/`; it does not, because the
vanilla `index.html` survives as the dev-tool page and something has to serve it with its
root-absolute `/js`, `/styles.css` and `/packages` references resolving. So the proxy flipped
instead — `/`, `/index.html` and `/landing.json` go to Astro (the last is what the router fetches to
navigate home without a document load; unproxied, every "Explore the globe" click would have
fallen back to a reload), and the vanilla page is served at **`/legacy`**, which is not a deployed
path. `_headers` gains a `/` rule: Pages matches the request path, so `/index.html` alone never
matched the apex. `packages` left `INCLUDE` with `index.html` — only its import map read them.
Verified: the production build's `index.html` is the Astro document, indexable, canonical `/`,
738 / 300 words, 4 links; no `packages/` staged; `styles.css`, `/borders/*` and `/country/*`
present; the inverted guard exits 1 when the Astro output has no `index.html`. In Chrome against
the new dev routing: `/` boots the globe; "Explore the globe" from `/country/france` is a
same-document navigation to `/` with the canonical rewritten; `/legacy` boots the vanilla page
off `/js`, `/styles.css` and `/packages`. 567 tests.

### The blocker: `AppLayout.astro` has no production head — ✅ closed (step 1 done)

**Landed** — with one omission found on the first deploy: the vanilla head also set
`window.GLOBE3D_API_BASE` for deployed hosts, and without it the Astro client fell back to
same-origin `/api` on Pages, a 405 for every POST (the Daily Challenge). Now `PRODUCTION_API_BASE`
in `site-config.js`, emitted by a `define:vars` script; the test runs the shipped script against
real hostnames and checks it agrees with `isLocalDevHost`. `lib/site-head.ts` builds the head from `js/data/site-config.js` at build time; the
layout emits it as static markup, consent first, production builds only. Favicons, manifest,
`theme-color` (resolved from the `bg-app` knob, `theme.json` included), OG/Twitter images and JSON-LD
(WebApplication on the apex, Article on a country) came with it. `CONSENT_REGIONS` moved into
`site-config.js` and is the one copy — `analytics.js`, `build-landing.mjs` and the layout all read
it, and the regenerated `/borders/*` pages were byte-identical. Runtime halves ported as
`lib/analytics.ts`, `lib/error-reporter.ts` (hoisted layout script), `lib/consent.ts`; a WebGL
failure now renders a card in the globe's seat from `GlobeIsland` instead of a blank seat.
Verified on `build:pages:local` served statically, Google's domains blocked: `dataLayer[0]` is the
region-scoped denied default on both pages, then granted, then `js`/`config`; the three loaders were
requested; favicon and manifest resolve; with the asset requests aborted, the failure card rendered
with the article intact and pointer events passing around it. 561 tests; 738 / 300 words unchanged.
The table below records what was missing.

`AppLayout.astro`'s `<head>` (`:55-77`) carries title, description, canonical, robots, Open
Graph, Twitter and the fonts link. It carries **none** of what the vanilla apex carries, and a
grep for each of these across `apps/web/src` returns only prose — comments in
`CountryArticle.tsx`, `LandingContent.tsx` and the two pages that *mention* AdSense while
shipping no tag:

| concern | vanilla | `apps/web` |
|---|---|---|
| `adsbygoogle.js` loader | `index.html:20`, static `<script>` in raw HTML | **absent** |
| `google-adsense-account` verification meta | `index.html:11` | **absent** |
| Google consent CMP (`fundingchoicesmessages`) | `js/features/consent-cmp.js` (91 lines) | **absent** |
| GA4 (`gtag.js`) | `js/features/analytics.js` (126 lines) | **absent** |
| GlitchTip error reporting | `js/features/error-reporter.js` (54 lines) | **absent** |
| WebGL-absent fallback | `js/features/webgl-fallback.js` (84 lines) | **absent** |
| favicons, `theme-color`, `og:image`, `manifest.webmanifest` | `index.html:27-43` | **absent** |

**Nothing from Phase B has been deployed yet, so this is not a live exposure — but it is a
first-deploy blocker, not a B11 one.** The moment `/country/*` ships it is a sitemapped page,
built specifically to answer an AdSense rejection, that serves no ad code and asks for no
consent; the second half is a GDPR surface. Close it before the first deploy that includes these
pages, not inside the flip.

**There is already a working reference for the head, and it is generated, not hand-written.**
`build-landing.mjs` emits the 27 `/borders/<slug>` pages, and each one carries the whole stack —
`gtag/js`, `adsbygoogle.js`, `fundingchoicesmessages`, JSON-LD — read from
`js/data/site-config.js`, the one place the GA4, AdSense and GlitchTip ids live. So the work is
to give `AppLayout.astro` the same head from the same config, not to invent one. Keep it
config-read rather than literal: `site-config.js` already notes that the AdSense client id is
duplicated into `index.html`'s static loader by hand and that the borders pages "stay in sync
automatically because build-landing.mjs reads this file". A third hand-copy is the wrong answer.

One constraint carries over verbatim from `index.html:12-19`, and it is the reason that tag is
not a module: **the loader must sit in the raw HTML.** Injecting it from JS hid it behind an
`init()` try/catch and a 6-second deferral, so a non-executing crawler saw no ad code at all.
In Astro that means a literal `<script>` in the layout head — not a component, not an island.

### What gets deleted, and the four modules that must move first

`js/features/**` is 30 modules plus three subdirectories. The plan has always said they go with
the flip. Three qualifications, all found by grepping rather than by reading the plan:

**1. Six modules under `js/features/` are real dependencies of code that survives.** Every
other `js/features` string in `apps/web` is a comment naming the vanilla module a component
replaced — useful as a checklist, invisible to a bundler. The real `import` statements are
exactly these, and two of them belong to a page that stays *deployed*:

```
js/data/globe-appearance.js:15   ← features/color-schemes.js          (SCHEMES, applyScheme)
apps/web PanelSheet.tsx:23       ← features/daily-quiz/panel-sheet.js  (decideSnap)
apps/web GlobeIsland.tsx:82      ← features/small-country-indicator.js
apps/web GlobeIsland.tsx:83      ← features/pointer-controls.js
js/landing/border-quiz.js:14     ← features/daily-quiz/options-grid.js       ← /borders/*
js/landing/border-quiz.js:15     ← features/quiz/quiz-question-chrome.js     ← /borders/*
```

The last two are the sharp ones. `/borders/<slug>` is live, in the sitemap and carrying ads, and
its entire JS closure is three files — `border-quiz.js` plus those two. Deleting either breaks
the quiz on 27 deployed pages, and it breaks at runtime in the browser, so nothing in `npm test`
or the build would say a word.

None of the six is really a vanilla *feature*; they are under `js/features/` by accident of when
they were written. **Moved (step 2, done):** `color-schemes.js` → `js/data/`; `pointer-controls.js`
and `small-country-indicator.js` → `js/core/`; the two borders dependencies → `js/landing/`, where
their only consumer already lives. `panel-sheet.js` did **not** move whole: only `decideSnap` is
shared, and the rest is a DOM class the vanilla app owns — so the pure function is now
`js/utils/sheet-snap.js` and the class re-exports it. Two things the move forced, both
improvements: `pointer-controls.js` imported `track` from `js/features/analytics.js`, which engine
code cannot, so it takes an injected `onSelect` hook that each host wires to its own analytics (the
Astro app gains the `country_select` event it never had); and `small-country-indicator.js` carried
`0xffffff`/`0xffff00`, which `check-tokens` forbids in `js/core`, so its inks are `--globe-label` and
`--primary` with those literals as fallbacks — the vanilla app, which loads no `tokens.css`, is
unchanged. `tests/features-boundary.test.js` now makes the rule structural: no real `import` from
`js/core`, `js/data`, `js/utils`, `js/landing`, `apps/web/src` or `packages` may name `/features/`.
A move done in the same commit as a 30-module delete is a move nobody can review; this one was its
own.

**2. `index.html` is dropped from the deploy, not from the repo.** The two existing entries read
as contradicting each other — `:865` says it "survives B11 as a dev-only tool page", `:1054`
says the celebration animations "go with `js/features/**` at B11". Both are right about
different things and the distinction is `INCLUDE`: the file stops being *deployed* and stays as
a local page for the label, colour and zoom editors, audit mode, and the three celebrations
(`bounce`, `pinball`, `shatter` — `quiz-ui.js:94` fires shatter and confetti and says in a
comment that the other two are never called). None of those is worth porting to React; all of
them need a globe and a toolbar, which is what `index.html` already is.

**3. `styles.css` cannot be deleted at B11.** All 27 `/borders/<slug>` pages carry
`<link href="/styles.css">`, are listed in `sitemap.xml`, and carry ad units. Dropping the
stylesheet unstyles 27 crawlable, ad-carrying pages. It is not a lift-and-shift either: the
pages use 40 `.lp-*` classes (roughly `styles.css:4959-5497`) **plus** `sr-only`, `qz-svg`, and
the `dq-*` classes `js/landing/border-quiz.js` adds at runtime — `dq-actions`, `dq-feedback`,
`dq-submit`, `dq-wide`.

**Recommendation: B11 keeps `styles.css` in `INCLUDE` and does not pretend otherwise.** Giving
the borders pages a self-contained generated stylesheet is a real slice of its own — it is a
token migration as much as a file split, since anything extracted has to join `check-tokens.mjs`'s
`SCOPE` or the checker's progress bar goes backwards. Do it as B12, with `styles.css` deleted at
its end. The alternative — extract during B11 — puts an untested stylesheet under the only pages
on the site that carry ad units, in the same change that moves the apex.

Note that `check-tokens.mjs` already counts down to this: its one remaining legacy-vocabulary
fallback is `js/utils/theme.js:36`, `cssToken('--font-ui')`, flagged on every run as "still to
remove when styles.css goes".

**Done (step 4).** `js/features/**` is 13 modules now, all used by the dev-tool page: the three
editors, the three celebrations, `audit/audit-mode.js` with the two `daily-quiz/` modules it still
needs (`question-renderer.js`, `panel-sheet.js`), and the page's own furniture — `search.js`,
`loading.js`, `ui-sync.js`, `webgl-fallback.js`. Deleted: `quiz/*` (12), `ads/*`, the Daily Challenge
player, flag renderer and wave, landing panel, main CTA, weak spots, back-button guard, settings
panel, theme switcher and editor, scene appearance, analytics, consent CMP, error reporter — plus
`js/data/theme-tokens.js`, `js/utils/after-intro.js` and `js/data/country-pages.js`, which only they
imported. `index.html` went from 1,240 lines to ≈400: the head is a `noindex` title and the
stylesheet, the markup is the editor buttons, zoom widget, search and the label modal, and the boot
module wires the engine, the editors, search and audit mode. The generated landing block went with
`landing-panel.js`; `build-landing-facts.mjs` is verification-only now (the Astro apex is the
renderer) and no longer touches `index.html`. Verified in Chrome at `/legacy?audit=…`: the globe
boots, the token is scrubbed, `audit-mode.js` is fetched, every editor button is present, E opens
the label editor, search lists France, no page errors and no 404s. 550 tests, `check-syntax` down
to the modules that exist.

### What else leaves with the flip

- **The importmap** (`index.html:323-341`) leaves the deploy with `index.html`, but not the
  repo — the dev-tool page still resolves bare specifiers through it. `packages` leaves
  `INCLUDE` with it: after the flip nothing deployed reads `/packages/…`. Verified rather than
  assumed — `border-quiz.js`'s closure contains no bare specifier at all, and Astro bundles its
  own copies.
- ~~**The `/country/*` dev proxy** retires~~ — it does not; see the flip note above. It serves
  the dev-tool page and the borders pages, which Astro's dev server does not.

### Tests that change

Six files couple to the two artefacts being retired. None should simply be deleted — each
encodes a rule that still holds somewhere:

| test | coupling | disposition |
|---|---|---|
| `cdn-pinning.test.js` | reads `index.html`'s importmap vs `package.json` | keep — the dev page still uses it |
| `dev-server-routing.test.js` | asserts `/`, `/index.html`, `/styles.css`, `js/features/…` serve statically | retires with `dev-server.mjs` |
| `landing-panel-static.test.js` | runs against the **shipped** `index.html` generated block | retarget at the Astro apex, which inherits the claim-verification |
| `routes.test.js:69` | comments on `APEX_IS_ASTRO` | update the comment with the constant |
| `country-sizes.test.js`, `perlin.test.js` | reference `index.html` in prose only | prose fix |
| `check-tokens.test.js:100` | asserts `SCOPE` excludes `styles.css` | holds until B12 |

### Order

1. ✅ **The production head** — AdSense loader + verification meta, consent CMP, GA4, GlitchTip,
   WebGL fallback, favicons/manifest/og:image into `AppLayout.astro`, read from
   `site-config.js`. Done; see above.
2. ✅ **Move the six survivors** out of `js/features/`, on their own. Done; see above.
3. ✅ **The flip** — three constants, plus the page move. Done; see above.
4. ✅ **The deletion** — `js/features/**` minus the editors, audit mode and the three celebrations;
   `index.html` and `styles.css` out of `INCLUDE` but kept in the repo. Done; see above.
5. **B12** (separate) — `styles.css` deleted, `--font-ui` removed from `js/utils/theme.js` and the
   legacy counter reaches zero. Written out below; the "generated stylesheet" this line first
   named became "the pages move into Astro" once the two routes were costed.

### Verification

Everything here is a production check; the dev server proves nothing about steps 1 or 3.

1. **`npm test`** — 540 today across 44 files. Expect a net fall as `dev-server-routing`
   retires; nothing else should drop.
2. **The head, in the built output** — grep `apps/web/dist/country/france/index.html` and the new
   `dist/index.html` for `adsbygoogle.js`, `google-adsense-account`, the GA4 id and the CMP
   endpoint. Grep, not a browser: the whole point is that they are in the raw HTML for a client
   that never executes.
3. **The AdSense baseline, unmoved** — 728 words / 4 internal links on the apex, 292 / 4 on
   `/country/france`, zero app-chrome elements, no hidden text. That baseline is why Phase B
   exists; the flip is the change most able to break it.
4. **Consent before tags** — verify in headless Chrome that no GA4 or ad request precedes a
   consent decision. `index.html:403-405` emits Consent Mode v2 defaults before any tag loads for exactly this reason,
   and the ordering does not survive a rewrite by accident.
5. **`/borders/*` and `/privacy/` still styled and still linked** after the `INCLUDE` edit —
   they link `href="/"`, which now resolves to a different document.
6. **`sitemap.xml` unchanged** — 32 URLs, `/` and 27 `/borders/*` among them. The apex URL does
   not move; only what answers it does.
7. **`npm run build:pages` from clean** — the guard at `build-pages.mjs:91` inverts here, so
   prove the *new* failure mode: with `APEX_IS_ASTRO = true` and Astro emitting no `index.html`,
   the build must still fail loudly rather than deploy a site with no front page.

## Phase B12 — the borders pages leave the legacy stylesheet — ⏳ Planned

The last of the vanilla app still in the deploy is `styles.css` — 5,649 lines, shipped for one
reason: all 27 `/borders/<slug>` pages link it. Those pages are also the last documents on the
site that Astro did not build. They come from a hand template (`landing/border-page.template.html`)
through their own generator (`build-landing.mjs`, 281 lines), carry a **second production head**
(the generator regexes `site-config.js` on its own), load the fonts at different weights from the
app (400/500/600 against 400/500/700), and are the only reason `js/` is still in `INCLUDE` —
`js/landing/border-quiz.js` is served raw. Every other page on the site gets its head from
`lib/site-head.ts`, its styles from the token build, and its stylesheet checked by
`check-tokens.mjs`. B12 brings the borders pages onto that path, and deletes what the vanilla
app was still holding open behind them.

**AdSense has not approved the site, and will not for some time.** The B11 note that deferred this
work — "an untested stylesheet under the only pages that carry ad units" — no longer describes
anything: the ad section is gated on both `ADSENSE_CLIENT_ID` *and* `ADSENSE_LANDING_SLOT`, the
slot is empty, and nothing renders. What the pages still have to keep, for the *next* review,
is what the head carries (the verification meta and the loader, in raw HTML) and what a
non-executing crawler reads (the H1, the hidden answer list, the JSON-LD `Quiz`). Those are
the invariants below; the ad markup is not one until a slot id exists.

### What the pages depend on today — measured, not assumed

- **Classes.** 40 `.lp-*` names (`styles.css:4956–5500`, 545 lines), `.sr-only` (`:3358`) on the
  crawler-facing answer, `.qz-svg`, and the quiz grid `options-grid.js` builds at runtime —
  `.dq-grid`, `.dq-grid-wrap`, `.dq-cell-label`, `.quiz-option` with `selected` / `correct` /
  `incorrect` / `missed` / `dimmed`, `.dq-actions`, `.dq-submit`, `.dq-feedback`, `.dq-wide`. The
  grid's base rules sit in the *Daily Challenge* section (`:4455–4552`) and the borders page
  overrides them with `!important` under `.lp-interact` (`:5191–5230`), because the two shared a
  cascade they no longer need to. About 650 lines in all.
- **Vocabulary.** In the `.lp-*` block: 45 references to the primitive ramps (`--steel-*`,
  `--neutral-*`, `--green-*`, `--red-*`, `--glow-*`), 19 to `--accent`, and `--font-display`,
  `--font-ui`, `--weight-semibold`, `--text-heading` / `-mid` / `-low`. **None is emitted by the
  token build.** Zero colour literals — the Stage 7 sweep put everything on the old tokens, so
  this is a name-mapping problem plus a spacing and type-scale one: 39 raw spacing values, 28
  font-size literals, 3 media queries.
- **`js/landing` is the borders pages' alone.** `apps/web` imports nothing from it — the Astro
  quiz has its own `QuestionChrome.tsx` and its own `.quiz-option` rules in `styles/quiz.css`.
  `options-grid.js` and `quiz-question-chrome.js` were moved out of `js/features` at B11 step 2
  for `border-quiz.js`, not for the app.
- **Dead weight the file also carries.** The UI-themes block, the settings panel, the ad rail and
  the theme editor (`:3829–4162`, `:4904–4955`, `:5501–5649`) style things deleted at B11 step 4.
  A selector inventory of `index.html` plus `js/features/**` reaches ~2,200 of the 5,553 rule
  lines; the rest styles nothing that exists.

### Decision: the pages move into Astro, not onto a generated stylesheet

The B11 section said "a generated stylesheet for `/borders/*`". Written out, that route keeps
everything that makes the pages a special case — the second head generator, the second static
generator, a raw-served `js/landing`, a stylesheet built outside Astro's pipeline that has to be
added to `SCOPE` by path and cache-ruled in `_headers` by hand — and adds a CSS build step to
maintain. The CSS rewrite (the ~650 lines above) costs the same either way; it is the only real
work in B12, and it is the same work under both routes. Moving the pages into Astro pays that
cost once and *deletes* the template, the generator's page half and the `_headers` rules, and the
pages get the shared head, the token artefact, `check-tokens` coverage and the per-page CSS
bundling for free. Recorded as the alternative considered; not taken.

Two things are deliberately **not** changed by the move: the URLs (`build.format: 'directory'`
emits `/borders/<slug>/index.html`, exactly what the generator wrote, so `sitemap.xml` is
byte-identical), and the routing — `routes.ts` keeps returning null for `/borders/*`, so a click
from the app is a real navigation and the page needs no React.

### The work

1. **Extract the head.** `AppLayout.astro:103–190` becomes `components/SiteHead.astro`, taking
   the props the layout takes today (`title`, `description`, `canonical`, `robots`, `ogImage`,
   `ogImageAlt`, `jsonLd`). `AppLayout` renders it plus the islands; a new
   `layouts/StaticLayout.astro` renders it plus a `<slot />` — **no globe, no islands, no
   Three.js**, which is what the borders pages are. `tests/production-head.test.js` retargets its
   order assertions at the component, and its "is what the generated /borders pages carry" case
   at the Astro output. The template's hard-coded `theme-color` (`#0a1c30`) goes with it; the
   head derives it from `bg-app` as it does for every other page.
2. **One publish gate.** `landing/borders-pages.mjs` → `publishedBorderPages()`: reads
   `borders-data.json` and drops any entry without `img/borders/<slug>.png`, warning as the
   generator does now. The page's `getStaticPaths` and the sitemap script both call it, so a page
   and its sitemap entry cannot exist independently — the rule the sitemap comment already
   states for the country pages. Node-only, build-time only, the same shape as
   `build-landing-facts.mjs`, which `lib/landing.ts` already imports.
3. **The page.** `src/pages/borders/[slug].astro` — the template's markup, static, in
   `StaticLayout`. The answer section stays `sr-only` in the HTML; the JSON-LD `Quiz` is
   unchanged; the related-links section stays; the ad section stays gated on both ids and renders
   nothing until a slot exists. The quiz data stays in
   `<script type="application/json" id="border-data" is:inline>`, and `border-quiz.js` is
   imported by a page `<script>` so Vite bundles it — after which nothing deployed reads
   `/js/…` (verified: no root-absolute `/js/` reference anywhere in `apps/web/src`; the engine is
   bundled into the globe chunk).
4. **The stylesheet.** `src/styles/borders.css`, imported by the page — the ~650 lines rewritten
   to the token system, in `check-tokens` scope from the first line because `apps/web/src` is.
   The mapping is mechanical for most of it: `--accent` → `--primary`, `--on-accent` →
   `--on-primary`, `--font-display` → `--font-heading`, `--font-ui` → `--font-body`,
   `--text-heading` → `--text-primary`, `--text-mid` / `--text-low` → `--text-secondary`;
   `--bg-app`, `--bg-panel`, `--radius-*` and `--shadow-high` keep their names. Two are not
   mechanical, and are decisions: **`--weight-semibold` → `--weight-bold`** (the scale has 400 /
   500 / 700 and the shared head loads 700, so headings get one step heavier — accepted, it is
   the app's weight), and the **reveal colours** — the `--green-10…17` / `--red-11…14` ramps
   become `--status-correct` / `--status-incorrect` exactly as `quiz.css:433–447` already does
   for the same class names, with `.missed` (a neighbour the player did not pick — a state the
   app's quiz does not have) as the correct colour at reduced emphasis. The primitive-ramp
   surfaces (`--neutral-30`, `--steel-27`…) resolve to `--surface-raised` / `--surface-inset` /
   `--border-subtle`; the amber glows to `--primary-soft`. Spacing goes on `--space-1…6`, type on
   `--text-xs…xl`, and every `!important` disappears with the cascade that forced it.

   **The `.quiz-option` base rules are split, not copied.** `quiz.css:398–447` (the button, its
   hover / focus / disabled and the reveal states) moves to `styles/answers.css`, imported by
   both `quiz.css` and `borders.css` — the "stylesheets split by scope" rule, and the only way the
   two quizzes' answer buttons stay one design. The `.dq-*` grid rules have no app equivalent and
   live in `borders.css` outright.
5. **The sitemap.** `build-landing.mjs` loses its page half and becomes `build-sitemap.mjs`:
   the sitemap and `country-pages.json` writers, reading the publish gate from step 2.
   `build:pages` becomes `build-sitemap → build-landing-facts → build:web → build-pages`, and
   `.gitignore` drops `/borders/`.
6. **`INCLUDE` and `_headers`.** `styles.css`, `js` and `borders` leave `INCLUDE`; the
   `/styles.css` and `/js/*` cache rules leave `_headers` (`:24`, `:26`). Astro's output already
   lands at the root, so `/borders/*` needs no entry.
7. **The dev server.** `ASTRO_PREFIXES` gains `/borders/` — with the trailing slash, for the
   reason the `/country/` entry has one. `dev-server-routing.test.js` flips `/borders/france/`
   and `/js/landing/border-quiz.js` from static to Astro.
8. **The dev page keeps a stylesheet, and it is not this one.** `styles.css` is deleted.
   `index.html` gets `legacy.css`: the ~2,200 rule lines the selector inventory reaches — the
   old `:root` block, the editors, modals, search, zoom widget and celebrations, the Daily
   Challenge panel audit mode reuses, the button normalisation — and nothing else. Pruned by the
   inventory, then verified by eye at `/legacy`. Not in `INCLUDE`, not in `SCOPE`, never extended;
   `check-tokens.test.js:100` asserts the new name. Rewriting 2,200 lines of a dev tool onto
   tokens would be work with no user, so it is not done. **`index.html` also links
   `/packages/design-tokens/dist/tokens.css`, ahead of `legacy.css`** (the dev server serves the
   repo root, so it resolves): the names both files define, `legacy.css` wins by order and the
   page looks unchanged; the names only the token build has — `--font-body`, `--globe-space`,
   `--globe-border`, `--globe-label` — now resolve there, so the engine on the dev page reads the
   same tokens the product does. For a page whose purpose is editing what the product shows,
   that is a correction, not a side effect.
9. **The counter reaches zero.** With `--font-body` resolving on the dev page, the
   `cssToken('--font-ui')` fallback at `js/utils/theme.js:39` goes and `canvasFont` reads one
   name. `check-tokens` reports `0 legacy-vocabulary fallback(s)` and the pragma machinery stays,
   for the next migration.
10. **Prose.** CLAUDE.md (a dozen `styles.css` mentions, the `INCLUDE` paragraph, the "Static
    country pages" section, the Code Organization bullets), the `check-tokens.mjs` header,
    `index.html`'s head comment, the two `js/landing` comments that point at `styles.css`, the
    B11 "cannot be deleted at B11" note, and the Cross-cutting conventions bullet below.

### Tests that change

| test | today | after |
|---|---|---|
| `production-head.test.js:130` | reads `borders/france/index.html` from the generator | reads the Astro output; order assertions target `SiteHead.astro` |
| `dev-server-routing.test.js:43` | `/borders/france/`, `/js/landing/…`, `/styles.css` are static | the first two are Astro paths; `/legacy.css` is static |
| `check-tokens.test.js:100` | `SCOPE` excludes `styles.css` | excludes `legacy.css` |
| `features-boundary.test.js` | prose names "the deployed `/borders/*` pages" | prose fix; the rule is unchanged |
| `routes.test.js:29` | `/borders/poland` parses to null | unchanged — that is the point |
| **new** `borders-page-static.test.js` | — | the page is `StaticLayout`, imports no island, keeps the `sr-only` answer, the `Quiz` JSON-LD and the gated ad section; `answers.css` is imported by both quizzes |

### Verification

1. **`npm test`** — 552 today across 45 files. `check-tokens` must report `borders.css` and
   `answers.css` in its file count and **0** legacy fallbacks.
2. **The built page** — grep `dist/borders/france/index.html` for the H1, the answer list, the
   JSON-LD `Quiz`, `adsbygoogle.js`, `google-adsense-account` and the consent script; and for the
   *absence* of the globe placeholder, any `client:` island and any Three.js chunk. Grep, not a
   browser, for the same reason as B11: the crawler does not execute. Then `grep -r styles.css
   dist/` must find nothing.
3. **Pixels** — headless Chrome screenshots of `/borders/france/` before and after at 390 and
   1280 px wide, through a full quiz (select, submit, the reveal, the CTA fade-in, retry). The
   diff should be the type weight and nothing structural. Same session: `/legacy` still styled,
   the editors open, and the canvas labels render in the token font rather than `system-ui`.
4. **`sitemap.xml` byte-identical**, and `country-pages.json` too — the generator changed hands,
   the output must not.
5. **The AdSense baseline on the pages that have one** — 738 / 300 words, 4 links, no app chrome
   — because the head extraction touches every page, not only the new one.
6. **`npm run build:pages` from clean**, then confirm `dist/` contains no `js/` directory: that
   is the proof `border-quiz.js` was bundled rather than referenced.

### Order

Three commits, the middle one the only one that changes what a visitor gets:

1. The head extraction and `StaticLayout` — no visible change, tests retargeted.
2. The borders pages into Astro: page, `borders.css`, the `answers.css` split, the publish gate,
   the sitemap script, `INCLUDE`, `_headers`, the dev server. Verify against the built output
   before it goes anywhere.
3. `legacy.css`, the dev page's two links, the counter to zero, the prose.

Deploying is frontend-only — no backend change, no migration — and, as always, a push is the
user's.

---

## Cross-cutting conventions

- **One stage = one PR** (or one slice = one PR within Stage 4), with a body that links back to this doc and notes which numbered items were completed.
- **No mixing.** Don't slip a Stage-4 module move into a Stage-1 bug-fix PR; reviewer cognitive load is the whole reason for the staging.
- **Tests stay green at every stage.** Stage 2 onward, no PR merges without `npm test` passing.
- **New code respects CLAUDE.md's `index.html` budget:** no new CSS in `index.html` (use `styles.css`), no new inline `<script>` logic (use `js/` modules), prefer self-contained feature modules that build their own DOM.
- **Update this doc.** When a stage lands, edit this file to check it off and link the merged PR. The plan is a living artifact, not a historical one.
