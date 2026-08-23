# Terragotcha — React migration with a shared core and a new design system

## Status — last updated 2026-08-23

**Phase A is complete.** A1–A8 and the C0 spike are all landed. No React exists yet, by design; the vanilla app is still the live
reference implementation and `npm test` is green at every commit (24 files, 307 tests).

| Step | State | Commit |
|---|---|---|
| A1 · `quiz-core` question generation | **done** | `0ec0e1a` |
| A2 · session reducer | **done** | `9959ac6` |
| A3 · `packages/storage` + store ports | **done** | `f05406a` |
| A4 · `packages/api-client` | **done** | `f05406a` |
| A5 · vanilla Zustand session store | **done** | `8c3ef46` |
| A6 · `packages/globe-bridge` + adoption | **done** | `a47d1b2` |
| A7 · `packages/design-tokens` (13 knobs) | **done** | `1e3252d` |
| A8 · three as an npm dependency | **done** | `bcc7c0f` |
| C0 · expo-gl spike (scheduled early) | **done — viable** | `f31f6c6` |

**`packages/storage`** defines the sync `StorageAdapter` (memory / Web Storage / MMKV) and holds the
ported settings and quiz-history stores. **`packages/api-client`** takes the API base, the device-token
storage and `fetch` as arguments. No call site changed: the three `js/data/` modules became ~15-line
web bindings. Verified against seeded pre-extraction localStorage — settings, history and (critically)
the device token all survive, since that token *is* the account.

**`packages/design-tokens`** is the design system's single source of truth: 13 knobs → CSS, a React
Native theme object, and the backend allow-list, with the committed artefacts guarded against
staleness by `npm test`. **The cutover is deliberately deferred** — `styles.css`,
`js/data/theme-tokens.js` and `backend/themes/tokens.py` still run the legacy 24-knob system, because
repointing the editor before the new stylesheet exists would give authors controls that style
nothing. Cutover steps are at the top of `backend/themes/tokens.py`.

**`packages/globe-bridge`** is the contract + a test double, no rendering code; the quiz, daily and
audit layers hold no reference to `globeManager`/`cameraController`. Nothing platform-specific crosses
it (no `THREE.Vector3`, no engine objects), and country data deliberately stays with `countryTable`
rather than the renderer. `createFakeGlobeBridge()` makes quiz logic testable without WebGL.

**`quizStore`** (vanilla Zustand, in quiz-core) replaced `state.js`'s `quiz.*` slice. Most of that
slice was already dead after A2; only `active`/`mode` were read, by six call sites, and they now ask
the store. `createSession` is store-backed too, so the store mirrors every dispatch. The `quiz-active`
body class deliberately stays — it is a CSS hook, not state.

**`packages/quiz-core`** is 932 lines across 9 modules (`rng`, `geo`, `filters`, `payload`,
`generators`, `session`, `grade`, `self-evident-capital`). All four quiz modes now read `score`,
`questionsAnswered` and the used-country list off one `createSession` instance, so the three
overlapping sources of truth the plan opened with are one. Client-side generation emits the
backend's payload schema.

**A8** replaced `window.THREE` in 17 modules with `import * as THREE from 'three'` resolved through
an importmap. Version deliberately held at r128 so the change was provably visually neutral;
`tests/three-version.test.js` guards importmap/package.json drift.

**C0 answered the question Phase C hung on: yes.** expo-gl + three r185 renders the real 30 MB mesh
at 60 fps on Android — same assets, same geometry, same shaders. Three plan assumptions were wrong in
our favour (binary fetch is fine on RN 0.86; the format is zero-copy so there is no parse cost; the
"WebGL 1 is not supported" error is a false positive with a one-line workaround). Memory is the one
thing not settled — needs a release build on physical low-end hardware. Findings:
`docs/react_migration/c0-expo-gl-spike.md`; rig: `spikes/expo-gl-mesh/` (outside the workspace globs).

**Off-plan work that landed:** `check-syntax.mjs` (esbuild parse gate over all 86 modules, wired into
`npm test` — the app has no bundler, so a duplicate `const` only ever showed up as a dead page), and
Stage 0 of the asset plan (`087d78f`) — R2 was confirmed serving all 51 MB uncompressed;
`npm run build:assets` brings it to 12.3 MB. Upload is a human step.

**Decisions taken since this plan was approved:**
- ~~The dependency-exclusion asymmetry~~ — **ruled on 2026-08-23**: "Name the country" now admits
  dependencies large enough to recognise on the globe (Greenland, French Guiana, the Falklands,
  Puerto Rico, …) while still excluding the long tail of specks, and sovereign states are never
  size-filtered. The **capital** quiz excludes every dependency regardless of size — ruled separately
  the same day, because a territory's administrative seat is a much more obscure fact than a
  sovereign capital.
- ~~This plan file lives outside the repo~~ — **moved 2026-08-23** to
  `docs/react_migration/migration-plan.md`.

**Revision to the plan below:** the "a lite mesh remains justified for mobile web" conclusion in
Phase C is retired. Stage 1 of `docs/react_migration/asset-size-reduction-plan.md` (graticule
pre-clipping) beats decimation losslessly — 83% fewer vertices, 90% fewer triangles — so there is no
lite variant to build, and it is also the cheapest answer to C0's open memory question.

## Context

Terragotcha (terragotcha.com) is a vanilla-JS geography quiz app built around a Three.js globe.
Three forces drive this work:

1. **AdSense rejected the site for "low quality content."** The app is a client-rendered shell —
   the raw HTML has no substantive text, so the AdSense crawler sees nothing. The fix is real
   editorial content baked into static HTML per country.
2. **The UI is not worth migrating.** `js/` is ~15,100 lines across 75 files, ~57% imperative DOM
   construction, against a 5,481-line `styles.css` whose token set has sprawled. The decision is to
   **rebuild the UI from scratch** on a deliberately small design system, not to port it.
3. **An Expo/React Native app is wanted in parallel**, sharing business logic.

[`terragotcha-adsense-react-plan.md`](./terragotcha-adsense-react-plan.md) records the original
decisions. This plan supersedes it on architecture, sequencing and UI; that document carries a banner
pointing here.

### The central problem this plan solves

Since the UI is being discarded, **the extracted core is the only thing that survives from the
current frontend** — which makes getting it right the whole game. Today the claim "quiz logic can be
shared" is aspirational: of ~5,600 lines of quiz code, only ~500 are portable. State lives in three
overlapping places, none authoritative:

- per-mode class fields (`this.score`, `this.usedCountries`) — the real state, not observable
- `js/data/state.js`'s `quiz.*` slice — write-mostly; only `quiz.active` is genuinely read
- `document.body.classList` — load-bearing state, read by `BackButtonGuard` (`index.html:699`)

All four practice modes are the same state machine written four times. `handleAnswer` at
`name-flag-quiz.js:296`, `capital-cities-quiz.js:329` and `identify-flag-quiz.js:613` are
near-identical bodies mixing scoring, history logging and `classList` mutation.

**Therefore: extract the shared core from the vanilla app FIRST, before any React exists.** The app
keeps working as a reference implementation, the boundary gets proven against real behaviour, and
Phase B starts from a validated core rather than a rewrite of a rewrite.

---

## Decisions taken

| Decision | Choice |
|---|---|
| Sequencing | Extract core on vanilla → Astro/React web → Expo |
| Extraction scope | Full core **plus** a `GlobeBridge` interface the vanilla app adopts |
| Web stack | Astro as a build-time static generator; runtime is a plain SPA |
| Post-boot navigation | App-owned `pushState`; Astro's `ClientRouter` is **not** used |
| Country-page entry | Static content paints first, docked panel expanded, globe loads behind a placeholder |
| Question generation | Client-side in the shared core, emitting the **backend's existing payload schema** |
| UI | Built from scratch; no migration of existing components or `styles.css` |
| Design tokens | 13 authorable knobs, JS object as source of truth |
| Native globe | Real 3D via `expo-gl` + `three`, gated on an early spike |
| Mesh strategy | Prototype the full mesh on native and measure; a lite mesh is justified for mobile **web** |

### Feature scope for the new UI

**Kept:** all four practice quiz modes, Daily Challenge + leaderboard, country content panel,
search, settings, weak-spots widget, quiz stats sheet, in-app theme editor, audit mode, dev editors
(label / colour / zoom).

**Dropped:** the three Three.js celebration animations — `shatter-animation.js` (421),
`pinball-animation.js` (365), `bounce-animation.js` (196). 982 lines removed, and one fewer system
to port to `expo-gl` later. End-of-quiz becomes the results card alone; `canvas-confetti` is already
a CDN dependency and can cover the moment cheaply if wanted. The `celebration-active` body class and
the celebration glue in `quiz-ui.js` go with them.

---

## Target repo layout

npm workspaces monorepo, single deploy for web:

```
packages/
  quiz-core/        pure: session reducer, generators, grading, stats. Zero deps.
  design-tokens/    token object → CSS vars (web), theme object (native), allow-list (backend)
  storage/          StorageAdapter interface + web (localStorage) / native (MMKV) impls
  api-client/       ported js/data/api-client.js, storage- and host-injected
  globe-bridge/     GlobeBridge interface + types (no implementation)
apps/
  web/              Astro + React
  native/           Expo
backend/            themes app's token allow-list regenerated; otherwise unchanged
```

MMKV over AsyncStorage specifically because it is **synchronous on RN**, so the existing sync store
APIs (`quiz-history-store.js:68`, `settings-store.js`) port without an async `init()` refactor.

---

## Phase A — Extract the shared core (vanilla app stays live)

No React. Every step ends with the existing app working and `npm test` green.

### A1. `packages/quiz-core` — question generation

Port the four `generateQuestion()` bodies into pure functions taking a plain country table
(`{name, centroid:[x,y,z], area, iso, capital, region}[]`) instead of `globeManager`.

Sources: `name-flag-quiz.js:170-223`, `capital-cities-quiz.js:179-250`,
`identify-flag-quiz.js:460-520`, `click-quiz.js:88-100`.

- Replace the `THREE.Vector3.dot` great-circle distance with a plain dot product (no Three.js dep).
- Extract the filter predicates currently scattered across modes: region scope
  (`js/data/country-regions.js`), used-this-session, exclude dependencies, must-have-ISO,
  must-have-capital (`js/utils/self-evident-capital.js` moves here as-is), land area ≥ 1628 km².
- Replace `allOptions.sort(() => Math.random() - 0.5)` (`name-flag-quiz.js:216`) with Fisher–Yates —
  the current comparator shuffle is biased.
- Inject an RNG so generation is seedable and testable.

**Emit the backend's payload schema** (`backend/quiz/generation/core.py:19-35`):

```js
{ type, prompt, grid: { options, cols, multiSelect, display }, answer: { method }, map?, flag? }
```

Two mismatches to reconcile deliberately:
- Backend `OPTION_COUNT = 4`; `name-flag` uses 6. Make option count a generator parameter.
- Backend `grid.options` are objects from `country_option(c)`; the frontend uses plain name strings.
  Standardise on the object form.

Payoff: one question renderer per platform handles both practice and daily-challenge payloads,
which are entirely separate code paths today.

### A2. `packages/quiz-core` — session reducer

One `(state, action) => state` state machine replacing four hand-rolled mode classes:
`idle → generating → question → answered/reveal → (next | end) → results`.

Modes differ only in generator and answer-capture method. Collapses the three duplicated
`handleAnswer` bodies. Move `local-grade.js` (already a pure port of
`backend/quiz/services.grade()`) in alongside it.

### A3. `packages/storage` + store ports

Define `StorageAdapter` (`get`/`set`/`remove`, sync — sync is the requirement that makes MMKV the
right native choice and rules out AsyncStorage). Port `quiz-history-store.js` (216 lines, already
DOM-free) and `settings-store.js` (82 lines) to take an injected adapter.

Only four localStorage keys exist repo-wide — `globe3d-settings`, `globe3d-quiz-history`,
`globe3d-device-token`, `globe3d-quiz-reminder-seen` — plus `tg-audit-token` in sessionStorage.
Each store is a singleton export today; keep that shape on web (construct with the localStorage
adapter at module scope) so no call site changes, and expose the factory for native to bind MMKV.

`MODE_LABELS` in `quiz-history-store.js` must keep the four existing mode ids (`name-flag`,
`identify-flag`, `click-country`, `capital`) — real user records already use them.

### A4. `packages/api-client`

Port `js/data/api-client.js` (249 lines). Two injection points only:

- the `DeviceIdentity` localStorage calls → the A3 adapter;
- `resolveApiBase()` (`js/data/api-client.js:41-51`), which reads `window.GLOBE3D_API_BASE` and
  sniffs `window.location`. Take a resolved base string (or a resolver) as a constructor argument.
  **Keep `isLocalDevHost()` exactly as it is** — it is already pure, already exported, and its
  LAN-range branches are load-bearing for the two-server dev setup. Native passes its own base and
  never calls it.

`ApiError` and the request/retry logic move unchanged.

### A5. Session store (vanilla Zustand)

The reducer wrapped in a vanilla Zustand store, in `quiz-core`, with **no React dependency**.
Consumed via `useStore` on both platforms. Mandatory rather than stylistic: **Astro islands are
separate React roots, so React Context does not cross them** — a module-singleton store is the only
thing that does.

Retire `state.js`'s `quiz.*` slice and the `body.classList` state hack. `state.js` keeps only live
Three.js references (`scene`, `mouse`, `flags`) and becomes internal to the globe engine.

### A6. `packages/globe-bridge` + vanilla adoption

Define the narrow interface the UI is allowed to use:

```
focusOn(country) · highlight(country) · flash(country, color, ms) · showOnly(names)
frameCountry(country) · clearSelection() · onPick(cb) · setInteractive(bool)
```

Refactor the four vanilla quiz modes to call this instead of `globeManager` /
`cameraController` directly (`js/core/globe.js:639-1010`, `js/core/camera-controls.js:101-461`
remain the web implementation). This is the step that makes Phase B a swap rather than a rebuild.

### A7. `packages/design-tokens`

Build the new token system here, ahead of the UI that consumes it (see next section). It has no
dependency on React, so it can land during Phase A and immediately regenerate
`backend/themes/tokens.py`.

### A8. Three.js as an npm dependency

~20 files read `const THREE = window.THREE` (r128, CDN global). Convert to `import` from npm `three`.
Required before any bundler, and required for `expo-gl`.

---

## The design system

A JS/TS object is the **single source of truth**, generating three artefacts: CSS custom properties
for web, a plain theme object for React Native, and the validation allow-list for
`backend/themes/tokens.py`. This is necessary, not tidy-minded: CSS custom properties, `color-mix()`
and `data-theme` do not exist in React Native, so a CSS-first definition cannot be shared. It also
collapses today's three-way hand-mirroring (`styles.css` `:root` → `js/data/theme-tokens.js` →
`backend/themes/tokens.py`).

### 13 authorable knobs

| Group | Tokens |
|---|---|
| Type | `font-heading`, `font-body` |
| Surfaces | `bg-app` (also drives the Three.js scene background), `bg-panel`, `surface-raised`, `surface-inset` |
| Brand | `primary`, `on-primary` |
| Text | `text-primary`, `text-secondary` |
| Globe | `ocean` |
| Shape | `radius-panel`, `radius-btn` |

`on-primary` is a knob rather than a derivation because there is no shipped `color-contrast()`; without
it, an author picking a pale primary produces an unreadable CTA. `ocean` is a knob because it cannot
derive from `bg-app` — a dark backdrop with a derived-dark ocean makes the globe disappear.

Country fill colours are **not** tokens: a named scheme selector (vibrant / greens / browns) baked
into the 256-entry palette texture by `build-textures.js`, exactly as today.

### Fixed, not authorable

- `status-correct` / `status-incorrect` — always paired with ✓/✕ icons, since red/green is the most
  common colour-vision deficiency. Fixed so a theme cannot break comprehension.
- Type scale (~5 sizes, 3 weights) and a ~6-step **spacing scale**. The absence of a spacing scale is
  the main reason padding sprawled in the current CSS.
- Elevation/shadow set, each referencing a themed colour so it adapts per theme with no per-theme
  redefinition — the current system's approach, which was correct and carries over.
- `radius-pill` / `radius-circle` as fixed shapes, distinct from the two roundness knobs.

### Derived in JS at build time

Small `mix()` / `alpha()` helpers emitting concrete values for both platforms — not `color-mix()`:
divider ← `text-primary` @12%, scrim ← `bg-app` @alpha, dimmed answer options ← `surface-inset` +
alpha, globe labels ← `text-primary`, globe border lines ← `text-primary` @alpha, selection
highlight ← `primary`.

**Check the selection highlight early.** Today's highlight is deliberately mid-grey (`0x9e9e9e`) so
the radial selection gradient has headroom to brighten the centre as well as darken the edge. A
saturated `primary` may look poor there; if so, drop the gradient rather than adding a knob.

### Consequences

- Dropping `--accent-secondary` removes the violet Daily Challenge pill identity. Daily must
  distinguish itself by icon, label and placement instead.
- `backend/themes/tokens.py` shrinks to these 13 and existing `Theme` rows are dropped via a data
  migration. The feature is superuser-gated with test users only, so the blast radius is small.
  `tests/theme-tokens.test.js` needs rewriting against the new count and shape.
- `styles.css` (5,481 lines) is replaced, not migrated.
- The in-app theme editor (`theme-editor.js`, 495 lines) is rebuilt but becomes far smaller — 13
  rows rendered from the token groups.

---

## Phase B — Astro + React web (`apps/web`)

### B1. Content pipeline

Django is the source of truth. A management command exports `countries.json` (geography, history,
literary heritage per country) consumed by `getStaticPaths()`. Content is authored in Django admin,
curated and fact-checked — scraped or bulk-AI text is what AdSense flags.

### B2. Page structure

```
src/pages/country/[slug].astro    getStaticPaths over ~200 countries
src/components/CountryArticle.tsx  React, NO client: directive → static HTML, 0 KB JS
src/components/GlobeIsland.tsx     client:only="react"
src/components/PanelSheet.tsx      client:idle, receives CountryArticle as a slot
```

`CountryArticle` must be **React, not `.astro`**, so the same component renders server-side at build
time and client-side after a `pushState` navigation. With no `client:` directive Astro ships zero JS
for it, so the content is structurally incapable of being wiped by hydration.

The slot pattern keeps content unhydrated while the drag behaviour hydrates:

```astro
<PanelSheet client:idle expanded>
  <CountryArticle country={country} />
</PanelSheet>
```

Port the drag logic from `js/features/daily-quiz/panel-sheet.js` (181 lines, already covered by
`tests/panel-sheet-snap.test.js`) — logic only, not its markup or styling.

### B3. Cold-load flow on `/country/<slug>`

1. Static HTML paints — article, header, ads. LCP is text.
2. Docked panel renders **expanded** (vs. peeking on the app route) — one class/data attribute.
3. Full-viewport `position: fixed; inset: 0` placeholder behind it, "Loading globe…". Lives in the
   `.astro` page markup, since a `client:only` island renders nothing at build time. Fixed
   positioning keeps the globe out of document flow, so CLS is zero.
4. Globe assets load; engine mounts; fades in focused on the route's country; placeholder removed.

**Decode the mesh in a Worker** and transfer the `ArrayBuffer`s. The download is not the INP risk —
parsing ~31 MB into `BufferGeometry` on the main thread while the user is reading is.

### B4. Navigation and SEO

- Post-boot navigation is app-owned: globe click → `pushState('/country/spain')` → fetch a small
  JSON → React re-renders the panel. `ClientRouter` is never used, so nothing needs
  `transition:persist` and no island needs to survive a document swap.
- `pushState` must manually update `<title>`, meta description and `<link rel="canonical">`.
- URLs pushed by the app must match the build's exactly (watch trailing slashes).
- **Every country page needs a static, server-rendered "related countries" block of real `<a href>`
  anchors** — bordering countries and same-region neighbours. Without it the ~200 pages are sitemap
  orphans with no internal link graph, since a WebGL canvas is not crawlable. Data already exists:
  `landing/borders-data.json` and `Country.borders` in `backend/geo/models.py`.
- Extend `sitemap.xml` (currently apex + 28 `/borders/` URLs) with the country pages.
  `build-landing.mjs` already does template + sitemap generation and is the model to follow.

### B5. UI build

New components against the Phase A core and the new token system. Nothing is ported from
`js/features/**` except behaviour worth preserving (panel drag, search matching, results-card
count-up). `BackButtonGuard`'s `pushState` hack (`js/features/back-button-guard.js:71`) is replaced
by real router integration.

### B6. Deploy

Astro static output → `dist/` → Cloudflare Pages, as today. `assets/` stays excluded and served from
R2 (`world-mesh.bin` exceeds the 25 MiB/file cap).

---

## Phase C — Expo (`apps/native`)

Starts only after Phase A proves the boundary.

- **C0 (do this early, during Phase A): expo-gl spike.** Load the full `world-mesh.bin` through
  `expo-gl` + npm `three` on a **low-end Android device** and measure peak memory and cold-start
  time. Download size is a non-issue at 31 MB inside an app bundle (Play's base AAB limit is 150 MB).
  The real risks are peak memory during parse (~2–3× file size while raw buffer and typed arrays
  coexist) and large `bufferData` calls crossing the JS↔native GL boundary with no streaming.
  If it holds up, ship the full mesh; if not, decimate.
- Consume `quiz-core`, `design-tokens`, `storage` (MMKV) and `api-client` unchanged. Metro needs
  `watchFolders` config for workspace packages.
- Implement `GlobeBridge` against the native engine. Everything above the bridge is already shared.
- Auth needs no work: an opaque device UUID in `X-Device-Token`, no login flow.

A **lite mesh remains justified for mobile web** regardless of the native outcome — ~16 MB gzipped
over cellular, paid by every visitor with no install to amortise it, on the exact pages AdSense
judges.

---

## Verification

**Phase A (the critical one).** `vitest` already runs `environment: 'node'` over `tests/**` — ideal
for a pure core, and the existing 12 specs cover almost exactly the modules being extracted.

- Unit-test the session reducer across all four modes: scoring, used-country exclusion, early
  termination when a region has < 10 eligible countries (`click-quiz` sets `this.total` below 10),
  auto-advance timing, and end conditions.
- Seeded-RNG generator tests asserting each filter predicate: dependencies excluded, ISO required
  for `identify-flag`, self-evident capitals excluded, area ≥ 1628 km² for `click-country` (with the
  `N. America & Caribbean` exemption).
- Assert generated payloads validate against the backend schema. Extend `tests/local-grade.test.js`
  so client grading of a client-generated payload matches `backend/quiz/services.grade()`.
- Assert `design-tokens` generates a `tokens.py` allow-list matching what the backend validates
  against — replacing the hand-mirroring `tests/theme-tokens.test.js` guards today.
- **Differential check against the live vanilla app**: after each extraction step, play each mode
  end-to-end and confirm behaviour is unchanged. Per project memory, drive the real modules in
  headless `google-chrome` via `puppeteer-core` from the scratchpad — there is no Playwright/jsdom here.
- `npm test` and CI (`.github/workflows/test.yml`) stay green throughout.

**Phase B.**
- `curl` a built `/country/france` and grep the raw HTML for the geography/history/literature text
  and the related-countries anchors. This is the AdSense acceptance test — it must pass with JS
  disabled.
- Lighthouse on a country page: LCP is the article text, CLS ≈ 0, INP unaffected by the mesh
  (validates the Worker decode).
- Verify globe→`pushState` navigation updates URL, title and canonical, and that a hard reload of a
  pushed URL serves the same content.
- Author a theme through the rebuilt editor and confirm all 13 knobs propagate to both DOM and the
  Three.js scene, and that `status-correct`/`status-incorrect` remain unaffected.

**Phase C.** Run the C0 spike on physical low-end Android before committing to the full mesh. Verify
the shared packages are byte-identical between `apps/web` and `apps/native` (no forks).

---

## Documentation to update

- `docs/senior_dev/implementation-plan.md` — the declared single source of truth. Each Phase A stage
  updated it as it landed (packages, the globe boundary, the token system), but it still treats the
  vanilla refactor as finished at ~1,059 lines of `index.html`, which Phase B reverses.
- ~~`docs/react_migration/terragotcha-adsense-react-plan.md`~~ — **done**: it carries a banner
  pointing here.
- `CLAUDE.md` — updated through Phase A (the `packages/` layout, the importmap rule, the globe
  boundary, the design system). Its "Code Organization" rules about `index.html` and `styles.css`
  become obsolete once `apps/web` exists.
