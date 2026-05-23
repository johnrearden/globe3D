# Globe3D — Staged Implementation Plan

Derived from the senior-dev code review at `/home/john/.claude/plans/you-are-a-new-replicated-hickey.md`. Stages are ordered so each one is independently shippable and each leaves the repo healthier than it found it. Earlier stages reduce risk; later stages depend on the safety net the earlier ones lay down.

---

## Stage 0 — Baseline & branch hygiene

**Goal:** Snapshot the current state so we can measure improvement and so each later stage lands as a reviewable PR.

- Confirm `main` is clean; create a long-lived integration branch (e.g. `senior-dev-cleanup`) that each stage branches off and merges back into.
- Capture a baseline: page load time on a cold cache, FPS during idle rotation, FPS during a label drag, `performance.memory.usedJSHeapSize` before/after dragging 100 labels. Note them in this folder as `baseline.md`.
- Verify `npm run build:globe` still produces byte-identical assets before any code change. If it doesn't, that's a Stage-0 finding to investigate first.

**Done when:** baseline numbers are written down and the build is reproducible.

---

## Stage 1 — Verified-bug fixes (one PR)

**Goal:** Land the small, high-confidence bug fixes from the review. No behavioral changes for the user; pure correctness.

1. **`index.html:2042` — cache the drag-hit sphere.**
   Hoist `new THREE.SphereGeometry(1.02, 32, 32)` and its `Mesh` to module scope (or onto LabelManager) and reuse them across every `pointermove`. Dispose on teardown. This stops a Geometry+Mesh leak that fires at refresh rate during a drag.

2. **`scene.js:87` / `:280` — fix the resize listener teardown.**
   Replace the inline arrow with a stored bound handler: `this._onResize = () => this.onWindowResize()` in the constructor, then `addEventListener('resize', this._onResize)` and `removeEventListener('resize', this._onResize)` in `destroy()`.

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

## Stage 2 — Test infrastructure (one PR)

**Goal:** Break the zero-tests ceiling. The repo gains a runner, a CI hook, and the first round-trip tests for the math that's easiest to silently break. Every later stage runs under this safety net.

1. **Pick a runner.** Default recommendation: `vitest` — fast, ESM-native, matches the project's existing module style, no transpiler config.
   ```bash
   npm i -D vitest
   ```
   Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json`.

2. **First test files** under `tests/`:
   - `tests/lat-lng.test.js` — import the math out of `globe.js` (may require lifting `latLngToVector3` to a pure helper in `js/utils/`). Round-trip 500 random points: lat/lng → vec3 → back to lat/lng, assert within 1e-6.
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

## Stage 3 — Documentation sync (one small PR)

**Goal:** Stop the docs from lying. Cheap; high signal-to-noise for future readers.

1. **`CLAUDE.md` edits:**
   - Correct `world-mesh.bin` size: "31 MB raw / ~2.2 MB gzipped" (not "~3.8 MB").
   - Correct `COUNTRY_MESH_SCALE` to `1.002` to match `globe.js:17`.
   - Rewrite the "Most code in single HTML file" line to reflect that core systems live under `js/` and `index.html` is now bootstrap + glue + label editor.
   - Add a one-line pointer to `docs/senior_dev/implementation-plan.md`.

2. **Delete or move stray files:**
   - `script1.js` — delete (imports paths that don't exist in this repo).
   - `test-load.html`, `wave_effect.html` — either delete or move under `scratch/` with a one-line README explaining what they were.

3. **Resolve the two stale plan docs:** `REFACTORING_PLAN.md` and `MODULARIZATION_PLAN.md`. Either:
   - Mark them as "executed Phases 1–4; superseded by `docs/senior_dev/implementation-plan.md`" at the top, or
   - Move them into `docs/archive/` so the root stops carrying historical artifacts.

4. **`.gitignore`:** Remove `package-lock.json` from `.gitignore` and commit the lockfile. Reproducible installs are worth the diff noise.

**Done when:** root directory has no stale planning docs, `CLAUDE.md` matches reality, lockfile is tracked.

---

## Stage 4 — Finish the modularization (one PR per slice)

**Goal:** Drain the remaining ~1,800 lines of inline JS out of `index.html` so it's bootstrap + DOM markup only. Each slice is its own small PR; the safety net from Stage 2 means we can refactor without fear.

Recommended slice order (smallest blast radius first):

1. **DOM utilities (`elements`, `show`, `hide`, `showFlex`, `setText`, `addClass`, `removeClass`, `toggleClass`).** Already partially in `js/utils/dom.js` — fold the inline duplicates in (`index.html:225–270`) and import.
2. **Flag wave noise helper (`animateFlagWave`).** Confirm it lives in `flag-renderer.js`; remove the inline copy at `index.html:272`.
3. **Label editor.** Pull the drag handlers, fine-tune modal logic, save/load config, and reset logic into `js/features/label-editor.js`. This is the largest single slice; do it last.
4. **Render loop / main bootstrap.** What remains in `index.html` should be: imports, the `<script type="module">` IIFE that wires managers together, the `animate()` callback registration. Aim for `index.html` under ~500 lines.

For each slice:
- Move code module-by-module, run tests, eyeball the page.
- After each slice, delete dead inline code; do not leave commented-out blocks.

**Done when:** `index.html` is under ~500 lines and contains no JS implementation logic beyond bootstrap.

---

## Stage 5 — Performance polish (one PR)

**Goal:** Address the smaller efficiency items that aren't outright bugs but are worth fixing once the structural cleanup is done.

1. **Tighten `_lookupIdLoose`** (`globe.js:487`). Replace the symmetric substring match with: exact match → normalized exact match → prefix match. Add a unit test that asserts "Niger" and "Nigeria" don't collide.
2. **Decide override precedence.** Document (and enforce in code) which wins when both `country-colors.json` and `label-config.json` set conflicting values. Add a comment near the loader.
3. **Confirm gzip in production.** If the project deploys via Cloudflare/static host, verify `Content-Encoding: gzip` (or `br`) on `.bin` files. The 16 MB raw `world-id.bin` shrinks to ~90 KB gzipped — without it, mobile users eat the full 16 MB.
4. **Optional: drop `getCountries()`.** It returns `[]` with a deprecation comment. Grep for callers; if none, delete it.

**Done when:** the cosmetic items above are cleaned and a perf-sanity pass on a low-end mobile (or DevTools CPU throttle 4×) holds 60 FPS during idle rotation.

---

## Stage 6 — Optional next bets

These aren't required by the review but are natural follow-ups now that the codebase is clean:

- **Country borders.** Re-introduce them via shader neighbor sampling on the ID texture or via a dedicated thin-line overlay — `CLAUDE.md` flags this as a missing feature.
- **Search index.** Replace the linear `Array.filter` in `search.js` with a small trigram index or a sorted prefix array for O(log n) lookups. Not urgent at ~250 countries.
- **Multi-language labels.** Listed in `CLAUDE.md`'s future ideas; the label pipeline is now isolated enough to support this cleanly.

---

## Cross-cutting conventions

- **One stage = one PR**, with a body that links back to this doc and notes which numbered items were completed.
- **No mixing.** Don't slip a Stage-4 module move into a Stage-1 bug-fix PR; reviewer cognitive load is the whole reason for the staging.
- **Tests stay green at every stage.** Stage 2 onward, no PR merges without `npm test` passing.
- **Update this doc.** When a stage lands, edit this file to check it off and link the merged PR. The plan is supposed to be a living artifact, not a historical one.
