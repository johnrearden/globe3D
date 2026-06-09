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
  (`country-map.js`, `search.js`).

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
| 6 — Deployment & SEO hardening | ✅ Done | eruda gated behind `?debug`/localhost, full SEO/OG/Twitter/JSON-LD `<head>`, `_headers`, `robots.txt` (dev buttons were already CSS-gated) |
| 7 — Optional next bets | 🟡 In progress | ✅ country borders (baked distance field + shader edge); search index, multi-language labels still open |

**Modules created (~11 new files):** `js/data/country-data.js`, `js/utils/coordinates.js`,
`js/features/{loading,ui-sync,flag-wave,color-editor,zoom-editor,small-country-indicator,label-editor,pointer-controls}.js`,
and `js/features/quiz/quiz-ui.js`. `js/core/camera-controls.js` absorbed the camera-animation +
idle logic and shed its dead duplicate API; the inline DOM helpers now import from the pre-existing
`js/utils/dom.js`. Each Bucket-C feature is a class owning its own state, wired in via constructor
injection (with an `onEnter` seam for the mutually-exclusive edit modes).

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
| Head / meta / external `<script>`s | 3–224 | confetti CDN (11), **eruda + `eruda.init()` (13–14)**, three.js (222), OrbitControls (223) |
| SEO overlay, `#container`, top buttons | ~17–61 | zoom/quiz/bounce/shatter/pinball/edit/color/zoom-editor toggles |
| Zoom widget, flag panel, search, controls legend | ~63–106 | |
| Quiz container + celebration + mode-selector + click-quiz UI + results modals | ~107–187 | |
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
| `onWindowResize()` | 2541–2573 | `js/core/scene.js` | resize handler (see Stage 1 fix) |
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
| **Quiz UI glue** | mode selector / results / cancel | `js/features/quiz/quiz-ui.js` | modal UI + quiz instance refs |
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

1. **Remove or gate the eruda debug console** (`index.html:13–14`). It loads unconditionally today
   and must not ship to production — either delete it or gate it behind a `?debug` query param.
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

- **Country borders.** ✅ **Done.** Baked at build time as a distance field: `buildBorderField()` in `build-textures.js` derives, from the dilated ID buffer, a per-pixel distance-to-nearest-border (a pixel is a border where any 4-neighbour ID differs → covers country↔country seams + coastlines), via a two-pass chamfer EDT clamped to 8 texels and X-wrapped for the antimeridian, written 1 byte/pixel to `assets/world-border.bin`. The shared `ShaderMaterial` (`js/core/globe.js`) samples it through a shader-computed equirectangular UV (matching the picking convention) and draws an anti-aliased `smoothstep` edge (`fwidth`-based AA, derivatives extension enabled). Runtime control via `globeManager.setBorderVisible/Opacity/Color/Width`; the settings gear's borders checkbox + opacity slider drive these (persisted keys `borders`/`borderOpacity`). This **replaced** the earlier vector `LineSegments` overlay — `js/features/borders.js` and `tests/borders.test.js` were deleted (the geojson-derived lines misaligned with the fills and were capped at 1px); `tests/border-field.test.js` covers the new derivation. Trade-off: resolution-limited (≈0.088°/texel), so borders soften slightly at the closest zoom but stay perfectly aligned, gap-free, and adjustable.
- **Search index.** Replace the linear `Array.filter` in `search.js` with a small trigram index or a sorted prefix array for O(log n) lookups. Not urgent at ~250 countries.
- **Multi-language labels.** Listed in `CLAUDE.md`'s future ideas; the label pipeline is now isolated enough to support this cleanly.

---

## Cross-cutting conventions

- **One stage = one PR** (or one slice = one PR within Stage 4), with a body that links back to this doc and notes which numbered items were completed.
- **No mixing.** Don't slip a Stage-4 module move into a Stage-1 bug-fix PR; reviewer cognitive load is the whole reason for the staging.
- **Tests stay green at every stage.** Stage 2 onward, no PR merges without `npm test` passing.
- **New code respects CLAUDE.md's `index.html` budget:** no new CSS in `index.html` (use `styles.css`), no new inline `<script>` logic (use `js/` modules), prefer self-contained feature modules that build their own DOM.
- **Update this doc.** When a stage lands, edit this file to check it off and link the merged PR. The plan is a living artifact, not a historical one.
