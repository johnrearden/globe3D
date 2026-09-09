# Globe3D - Interactive 3D Globe Project

## Project Overview

Globe3D is an interactive 3D web application that displays a rotating globe with all countries baked into a single textured sphere. The project features country selection, quizzes, and an advanced label editor for manually positioning country name labels.

## Technology Stack

- **Three.js** (r128, pinned in `package.json`) - 3D rendering library. Imported by bare specifier
  (`import * as THREE from 'three'`), resolved by the `<script type="importmap">` in `index.html` to
  a pinned CDN ESM build — not a `window.THREE` global. `tests/cdn-pinning.test.js` fails if the
  importmap URL and the `package.json` pin drift apart.
- **OrbitControls** - Camera control
- **Custom ShaderMaterial** - Vector country fills driven by per-vertex country ID + palette texture
- **Vanilla JavaScript** - No frameworks
- **HTML5/CSS3** - UI and styling

## Forbidden Actions

- You are forbidden from running any ssh or scp commands, and from accessing remote servers in any way

## Project Structure

```
globe3d/
├── index.html               # The VANILLA app — since B11 a dev-tool page (editors, audit
│                            #   mode), served locally at /legacy and NOT deployed
├── build-textures.js        # Node.js script to bake GeoJSON → globe assets
├── assets/
│   ├── world-mesh.bin       # Merged country mesh (vertices + per-vertex country ID + indices, ~3.9 MB)
│   ├── world-id.bin         # Equirectangular country-ID map for picking (4096×2048, one byte per pixel)
│   ├── world-border-lines.bin # Country-outline edges as u32 vertex-index pairs into world-mesh.bin (~1.3 MB raw / ~220 KB brotli)
│   ├── country-palette.bin  # 256×1 RGBA palette indexed by country ID (1 KB)
│   └── country-meta.json    # Country IDs, centroids, bboxes, land areas (km²), name↔id maps
├── packages/                # npm workspaces — platform-neutral code shared with the
│   │                        #   coming Astro/React web app and Expo native app.
│   │                        #   No DOM, no Three.js, no React; runs in Node, the
│   │                        #   browser (via index.html's import map) and Metro.
│   ├── quiz-core/           # Question generation, session reducer, grading, quizStore
│   ├── storage/             # StorageAdapter + the settings and quiz-history stores
│   ├── api-client/          # Quiz backend client (host + storage + fetch injected)
│   ├── globe-bridge/        # The globe interface + a test double. No rendering code
│   └── design-tokens/       # 14 knobs → CSS / React Native / backend allow-list
├── apps/web/                # Astro static site (Phase B): one crawlable page per
│                            #   country. `npm run build:web`
├── content/countries.json   # Published country page content, baked from Django by
│                            #   `manage.py export_country_content`. Committed, so the
│                            #   frontend build needs no database
├── spikes/expo-gl-mesh/     # Throwaway React Native rig proving expo-gl renders the
│                            #   real mesh; outside the workspace globs on purpose
├── package.json             # Build dependencies
├── country-colors.json      # (Optional) Per-country color overrides
└── label-config.json        # (Optional) Custom label positions/sizes
```

**Workspace packages are imported by bare specifier** (`@terragotcha/quiz-core`,
`@terragotcha/storage`, `@terragotcha/api-client`), resolved in the browser by the
`<script type="importmap">` in `index.html` and in Node/vitest by the npm-workspace symlink — so the
same import statement works buildless today and under Vite/Metro later. **Adding a package means
adding an importmap entry**, or the browser gets a bare-specifier resolution error while `npm test`
stays green.

**Nothing that survives B11 imports from `js/features/`.** That tree is the vanilla app's and is
deleted at the flip; `js/core`, `js/data`, `js/utils`, `js/landing`, `apps/web/src` and `packages`
must not reach into it, and `tests/features-boundary.test.js` fails on a real `import` that does. If
engine or shell code needs something that lives there, move it (as `pointer-controls.js`,
`small-country-indicator.js`, `color-schemes.js`, `sheet-snap.js`, `options-grid.js` and
`quiz-question-chrome.js` were) — and note that `js/core` is in `check-tokens` SCOPE, so a module
moving there trades its colour literals for `cssToken()` reads with the old literals as fallbacks.

Anything platform-specific stays in `js/`, reduced to a thin binding: `js/data/storage.js` picks
localStorage/sessionStorage, `js/data/globe-bridge.js` wraps GlobeManager + CameraController, and
`js/data/settings-store.js`, `js/data/quiz-history-store.js` and `js/data/api-client.js` are now
~15-line files that construct the shared implementation and re-export it, so no call site had to
change. Follow that pattern rather than importing a package directly from a feature module.

### The globe boundary — `GlobeBridge`

**No quiz code may touch `globeManager` or `cameraController` directly.** Everything under
`js/features/quiz/`, `js/features/daily-quiz/` and `js/features/audit/` takes a single `globeBridge`
dependency and calls `highlight` / `clearSelection` / `flash` / `showOnly` / `showAll` /
`focusCountry` / `setVisibleRegion` / `frameGlobe` / `frameView` / `framingDistanceFor` /
`resetView` / `setInteractive` / `setAutoRotateAllowed` / `onPick` / `onDeselect` /
`markers.*`. That list is `GLOBE_BRIDGE_METHODS`, and
`missingBridgeMembers()` validates an implementation against it.

`onDeselect` is a tap that hit no country, and is its own event rather than `onPick(null)`
for a reason worth keeping: every pick subscriber grades the name it is handed, so a null
would have to be special-cased at each of them — and tapping empty water is a different
gesture, the one that dismisses what is on screen.

The rule that gives the interface its shape: **nothing platform-specific crosses it** — no
`THREE.Vector3`, no DOM node, no engine object, only names and plain values. Aiming the camera at a
capital passes `{lat, lng}`, not a vector; focusing a country passes a name, not a centroid record.

**When a panel covers the globe, say so — do not resize the canvas.** `setVisibleRegion({focalAnchor,
visibleFraction})` moves the projection and scales framing so everything lands in the free region.
The canvas must stay full-viewport: `PointerControls` maps pointer→NDC against
`window.innerWidth/innerHeight`, so a smaller canvas makes every pick resolve to the wrong country
with nothing to notice. Both fields are plain numbers — no DOM rectangle crosses the interface.

**Framing helpers must never return a non-finite number.** `frameGlobe()` legitimately names no
lat/lng, and `latLngToXYZ(undefined, …)` is NaN; a NaN camera position renders an *entirely blank
canvas* with no error, no warning and the ready flag still set. `framingDirection()`
(`js/utils/coordinates.js`) exists for that, `frameView` snaps rather than lerps out of a non-finite
camera, and `CameraController._visibleFraction` is initialised to 1 for the same reason. A check
that only asserts "a canvas exists" will not catch this — assert drawn pixels.

**Country data is not a globe concern.** `getCountryByName`, `getCapital` and the centroid list come
from `createCountryTable()` (`js/data/country-table.js`), not from the bridge — a renderer that
happens to hold a capitals map is an accident of the web implementation and must not be carried onto
native.

Adding a method means adding it to `packages/globe-bridge/src/interface.js` (docs +
`GLOBE_BRIDGE_METHODS`), to `js/data/globe-bridge.js`, and to the fake in
`packages/globe-bridge/src/fake.js` — the fake is what lets quiz logic be tested without WebGL.

**Display state is a second interface, `GlobeAppearance`** (`packages/globe-bridge/src/appearance.js`,
web implementation `js/data/globe-appearance.js`): `applyAll`, `schemes`, `setCountryScheme`,
`setCountriesVisible`, `setLabelsVisible`, `setBordersVisible`, `setBorderOpacity`,
`setSelectionGradient`, `setAutoRotate`, `setLighting`, `lightingDefaults`. **Do not fold these
into `GlobeBridge`** — the bridge is what a *question* does, and every quiz test constructs its
fake. Same governing rule, though: the palette crosses as a scheme *key*, never as colours, and
lighting as five plain numbers.

Two ordering rules on it are load-bearing and tested, because neither throws and both present as
"the setting was ignored": **`setBorderOpacity` before `setBordersVisible(true)`**, and
**enabling auto-rotate at boot sets `autoRotateAllowed` directly** rather than calling
`setAutoRotateAllowed(true)`, which resets the idle timer and stops the intro spin. Persisted
lighting is applied ~1.7 s late on purpose: `fadeInLighting()` ramps the same uniforms.

### The design system — `@terragotcha/design-tokens`

`packages/design-tokens/src/tokens.js` is the **single source of truth**, in three tiers:

- **14 knobs** a theme author may set: `font-heading`, `font-body`; `bg-app` (which also drives the
  Three.js scene background, via the derived `globe-space`), `bg-panel`, `surface-raised`,
  `surface-inset`; `primary`, `on-primary`; `text-primary`, `text-secondary`; `ocean`,
  `globe-border`; `radius-btn`, `radius-panel`.
- **Fixed**: the type scale (5 sizes), weights, the 6-step spacing scale, elevation,
  `radius-pill`/`radius-circle`, and `status-correct`/`status-incorrect` — fixed because red/green is
  the most common colour-vision deficiency and a theme must not be able to break comprehension.
- **Derived in JS**, not `color-mix()`: borders, scrim, primary tints, disabled states, globe ink and
  the selection highlight. JS because React Native resolves neither `var()` nor `color-mix()`, so a
  CSS-first derivation could never be shared — every emitted value is concrete.

**Adding a knob is a cost; a derivation is free. When in doubt, derive.** Add knobs to `tokens.js`,
then run `npm run build:tokens`; the committed artefacts in `packages/design-tokens/dist/` are
regenerated and `npm test` fails if they go stale.

**To restyle the app, do not edit the knob defaults — set them in
`packages/design-tokens/theme.json`, then run `npm run build:tokens`.** Commit both
`theme.json` and the regenerated `dist/` artefacts; `npm test` fails if they go stale,
which is the gate that catches a forgotten rebuild.

The Theme Lab is a view of `theme.json`, not of the last build — it seeds from
`GET /__theme/current`. That matters because the two disagree until you rebuild, and a
panel seeded from the artefact counts an unbaked knob as untouched and deletes it on the
next save. Anything the save endpoint refuses comes back in `dropped` and is shown, since
the write succeeds either way. The endpoint loads the token module through
`server.ssrLoadModule` rather than `await import()`, which Node caches for the life of the
process — a long-lived dev server otherwise filters saves against a stale knob list.

`astro.config.mjs` watches `dist/tokens.css` explicitly, because it lives outside
`apps/web` and Vite's watcher is rooted there — without that a rebuild produced no change
event, the dev server went on serving its cached transform, and `npm run build:tokens`
appeared to do nothing until the dev server was restarted. `tokens.js` defines the *system* (which knobs exist, the
fixed scales, how the other 34 values derive); `theme.json` is a committed override map holding
this product's deviation from it, layered in by the build through the `overrides` parameter
`resolveTheme` / `toCss` / `toNativeTheme` always took. The fastest way to author one is the
**Theme Lab** (`apps/web/src/components/theme/ThemeLab.tsx`), opened from the settings sheet: it
edits all 14 live, warns on contrast below AA, and in dev its Save writes `theme.json` — then
`npm run build:tokens` bakes it in. It generates its rows from `KNOB_GROUPS`, so a fifteenth knob
needs no change to it. The same panel publishes **remote themes** to the backend for a superuser
with the audit token (`/audit/launch`), which is also what gates the button; a reader picks one
from the settings sheet. See "Remote themes" below for what a stored theme is. `src/theme-file.js` is **Node-only and must not be re-exported from `src/index.js`**, which
the browser loads via the importmap.

**A dev-only island needs a conditional `await import()`, not a conditional render.**
`{import.meta.env.DEV && <X client:only="react" />}` still ships X: a client directive is read by
the Astro *compiler*, which registers the island whether or not the expression can be true — the
first build done that way emitted an 8 KB chunk and inlined its CSS into every page. Put the
directive in a wrapper and import that wrapper conditionally, so Rollup has a whole module to
drop. (The Theme Lab was gated this way until B9 promoted it; it is now reached by `React.lazy`
from `ShellControls`, which is the other shape that keeps a component out of the initial chunk.)

**Astro hoists the CSS of every module a page can reach — dynamic imports included.** A plain
`import './x.css'` inside a lazily-loaded component still lands in every page's `<style>`, which
is how the Lab's rules briefly reached the crawler-facing documents. Import it `?inline` and
render the string from the component, so it travels in the chunk. `tests/theme-lab-gate.test.js`
pins both shapes.

**Remote themes.** A stored `Theme` is a **complete** 14-knob map, never a diff: `applyCssVariables`
resolves the whole system from what it is given and writes every property, so a partial map would
reset every knob it omitted to the *package* default rather than to the built artefact with
`theme.json` in it. "Default" in the picker is the absence of a theme — the inline properties are
removed and the cascade shows through — not `defaultTheme()`, which does not know about
`theme.json`. `lib/theme.ts` owns all of this and caches the *resolved* property map in the settings
store; the `is:inline` script in `AppLayout.astro`'s head copies that map onto `<html>` before first
paint, so a reader wearing a theme never sees the default flash. It derives nothing, which is why
it cannot drift. The same script keeps an arriving `?audit=` token, because `AppRouter` drops the
whole query at boot and an island reading `location.search` runs after it.

**Every UI value must resolve to a token, and `check-tokens.mjs` enforces it** (wired into
`npm test`). It fails the build on colour / font / weight / shadow / radius literals, on raw spacing
outside `--space-1…6`, on six-digit `0x……` colours in engine JS, and — the rule that matters most
during the rewrite — on any `var(--x)` or `cssToken('--x')` naming a token the build does not emit.
A legacy name does not error, it resolves to nothing, so it fails silently.

**Its scope is an explicit list, and that list is the migration's progress bar** (`SCOPE` in
`check-tokens.mjs`): `apps/web/src`, `js/core`, `js/utils/theme.js` today. A file joins when it has
been migrated. `styles.css` and `js/features/**` never join — they are deleted, not migrated.
Switching a checker on against a mountain of violations only ends with the checker switched off.

Two exceptions are deliberate and named at their sites: light colours/intensities in `scene.js` are
optics rather than palette, and the 256-colour country fill palette is pinned by *scheme key*
(`COUNTRY_SCHEMES`), not by tokens. A legacy token name kept as a fallback behind a real one is
marked `token-check: legacy-vocabulary`; the checker counts those on every successful run so they
read as a countdown.

**The globe reads tokens.** `--globe-space` (scene background), `--globe-border` (country outlines
and the graticule, colour only — line strength is a user setting), `--globe-label` and
`--globe-label-active` are consumed by `js/core/scene.js`, `globe.js` and `labels.js` through
`cssToken()`. Every one falls back to the value it was previously hard-coded to, so the vanilla app —
which does not load `tokens.css` — is byte-for-byte unchanged.

**The backend speaks the new system (B9).** `backend/themes/tokens.py` carries the generated
allow-list between `BEGIN/END GENERATED` markers — `npm run build:tokens` *splices* it in
rather than overwriting the file, because the validation below the block is hand-written and
security-relevant, and `--check` treats it as a fourth artefact. A stored `Theme` is `{name,
tokens, countryScheme, isPublished}`: the same knob map as `theme.json`, plus the one thing a
theme pins that is not a token (a palette key). `base` (a `styles.css` preset), `scene_bg` and
`ocean_color` were dropped in migration `0003` along with every legacy row — the space and
ocean colours derive from `--bg-app` and `--ocean`. **Still legacy:** `styles.css` and
`js/data/theme-tokens.js`, which the vanilla theme editor uses; it now gets a 400 from the API
and goes with `js/features/**` at B11.

## Deploy (`npm run build:pages`)

One Cloudflare Pages project serves one origin: the Astro app at `/` and `/country/*` (since
B11 — through Phase B the vanilla globe held `/` and the Astro apex was staged at `/app`), the
generated `/borders/*` pages, `/privacy/`, and the static files they share. `build:pages` runs
`build-landing.mjs` → the Astro build → `build-pages.mjs`, and **that order is required** — `build-pages.mjs` opens by wiping `dist/`,
so anything staged before it is destroyed. Astro's output is merged in at the **root** (not as
an `INCLUDE` entry, which would nest it) because its URLs are root-absolute.

It aborts if the Astro output is missing, and — `APEX_IS_ASTRO` — if it carries no
`index.html`: `sitemap.xml` already lists `/` and the `/country/` URLs, so deploying without
them points crawlers at 404s — worse than a failed build and invisible for weeks. `index.html`
and `packages/` are deliberately **not** in `INCLUDE`: the vanilla page is a dev tool now and
only its import map read the packages. `styles.css` stays until B12, because every
`/borders/<slug>` page links it. `npm run build:pages:local` produces the same output with globe assets served from
the repo instead of R2, for previewing locally.

`.node-version` pins 22 for the Pages build image; Astro 7 needs ≥22.12 and `npm ci` installs
every workspace, so the floor applies to the whole deploy.

## Local development (`npm run dev`)

**One origin, one command** — the same shape Cloudflare Pages serves in production:

```bash
npm run dev            # http://localhost:8011 — starts Astro too
npm run dev -- --solo  # just the proxy; bring your own `npm run dev:web`
```

`dev-server.mjs` proxies what Astro owns — `/`, `/index.html`, `/landing.json`, `/country/*`,
plus Vite's `/@…`, `/_astro/`, `/src/`, `/node_modules/.vite/` and the HMR websocket — and
serves everything else statically from the repo root: the `/borders/*` pages, `styles.css`,
`js/`, the assets. The vanilla `index.html` is served at **`/legacy`** — it is the dev-tool page
(label, colour and zoom editors, audit mode) and has no deployed equivalent; its root-absolute
`/js/…`, `/styles.css` and `/packages/` references resolve because the repo root is what this
serves. Before any of this, two ports meant every cross-link 404'd locally and the site looked
broken in exactly the way it is not.

**`astro dev` is a managed daemon, not a foreground process.** It forks, prints a pid and
outlives whatever started it; `npx astro dev status` / `npx astro dev stop` are the controls
(the same ones in the stale-Vite-cache recipe below). So `npm run dev` does not try to own its
lifetime — it starts one if none is up, **reuses** one if it is, waits for it to actually
answer before reporting ready, and leaves it running on exit. Stop it with
`npx astro dev stop`. The `--port` flag is passed explicitly, so `ASTRO_PORT` governs both
ends; without it Astro takes its own default and the proxy points at nothing.

If Astro cannot start, `/` and `/country/*` return a 502 saying what to do; `/legacy` still works.
If port 8011 is taken — a leftover `python3 -m http.server` from the old two-server setup is
the usual culprit — the server says so and suggests `PORT=8012`.

**The trailing slash in the `/country/` proxy prefix is load-bearing.** `/country` alone also
matches `country-pages.json`, `country-colors.json` and `country-zoom.json`, which are
repo-root files the globe fetches; proxying the first of those silently removes every "Read
more" article link. `tests/dev-server-routing.test.js` pins this.

## Static country pages (`apps/web`)

The site was rejected by AdSense for "low quality content": the client-rendered shell has no
substantive text in its initial HTML response. `apps/web` answers that with one static
`/country/<slug>` page per published country, built by Astro from `content/countries.json`.

**The composition is the whole point, and it is one word away from being undone:**

```
PanelSheet     client:idle   — hydrates, so the sheet can be dragged
  CountryArticle             — NO client: directive, passed as a SLOT
```

The same composition serves the apex (`LandingContent` in place of `CountryArticle`).

`CountryArticle` is **React with no `client:` directive**, so Astro renders it to HTML at
build time and ships zero JavaScript for it. Passing it to `PanelSheet` as a *slot* (not a
prop) keeps it static markup that hydration cannot wipe — a prop would serialise the country
into the island and re-render it client-side. Verified: the prose appears in `index.html` and
in none of the JS bundles.

It is React rather than `.astro` so the same component can also render client-side after an
app-owned pushState navigation, without a second copy of the markup drifting from this one.
Consequently it must stay free of hooks, handlers and browser globals — anything interactive
belongs in a sibling island. `tests/country-page-static.test.js` enforces all of this.

Astro is a **build-time generator only**; the runtime is a plain SPA with app-owned
`pushState`, so `ClientRouter` is deliberately not enabled.

**Routes and the staged apex.** `src/lib/routes.ts` is the app's one URL parser and formatter
(`parseRoute` / `pathForRoute` / `HOME_PATH`), shared by the pages, the router and the globe —
replacing the vanilla app's habit of answering "what is on screen?" in two places that could
disagree. Two things it must keep right: country links are emitted in **both** trailing-slash
shapes (the generated landing panel writes `/country/france/`, `CountryArticle` writes
`/country/france`), so it parses either and emits exactly one; and it returns null for paths the
app does not own (`/borders/*`, `/privacy/`), which must stay real navigations.

`HOME_PATH` is **`/`** since B11. Through Phase B it was `/app`: the Astro apex was staged beside the
vanilla front page, `noindex` with a canonical of `/`, and `build-pages.mjs` *refused* an Astro
`index.html` so the flip could only happen as a deliberate edit. The flip was those two constants
plus the page moving to `src/pages/index.astro` — and the guard inverted: `APEX_IS_ASTRO = true`
now makes an Astro build *without* an `index.html` a hard failure, because a deploy with no front
page is worse than none. `PUBLIC_HOME_PATH` still overrides it for a staged build.

**The apex content is the same verified model as the vanilla panel.** `landingModel()` in
`build-landing-facts.mjs` is the single source: it checks every superlative against
`assets/country-meta.json` and reports what the data contradicts. `src/lib/landing.ts` calls it and
**throws on any failure**, so a second renderer cannot become a way around the checking.
`LandingContent.tsx` renders the result and computes no figure of its own.

**Stylesheets are split by scope, not by page.** `styles/shell.css` is the furniture every route
needs — page, globe seat, panel sheet and its breakpoints — imported by `AppLayout.astro` after the
token artefact. `styles/country.css` and `styles/landing.css` hold only their own content and are
imported by their page. Adding a route means adding a stylesheet, not extending someone else's.

**Navigation (`CountryRouter.tsx`, `client:idle`).** After boot, clicks on internal
`/country/<slug>` links are intercepted: the router fetches `/country/<slug>.json` (emitted
beside each page), swaps the panel content, rewrites `<title>`/description/canonical by hand,
and pushes the URL. The globe is never rebuilt — that is the point, since it costs seconds.
Astro's `ClientRouter` is not used: it swaps documents, so every island would need
`transition:persist`; owning the navigation means nothing has to survive anything.

React takes over the panel only on the **first user navigation** (`createRoot`, replacing the
static markup rather than hydrating it — the trees deliberately differ). A crawler never
clicks, so the document it sees is the untouched static one.

Islands share state through the module singleton in `src/lib/route.ts`, not React Context —
separate roots cannot share a provider. Same constraint that makes `quizStore` a singleton.

**The quiz (`QuizLayer.tsx`, `client:idle`, mounted in `AppLayout` for every route).** It
renders **null** at build time and until the reader asks for a quiz, so the article underneath
is untouched static markup — a reader who arrived on `/country/france` from search can play
without leaving it. A quiz is not a route: no URL change, not linkable, never seen by a crawler.

**There is one runner, not four.** Every quiz-core generator already describes what the globe
should do (`payload.map`) and what the grid should show (`payload.grid`); the four vanilla
modes ignored both and hand-wrote each. Reading them instead leaves only a per-mode table —
`src/lib/quiz/specs.ts`: which generator, where the answer comes from, what the eyebrow says.
**A fifth mode is a table entry, not a component.** Mode ids are quiz-core's `MODES`
throughout; those ids are the localStorage history keys, so the vanilla app's private ids and
its translation switch are gone.

Answers to "find the country" arrive through `globeBridge.onPick`, never from an engine
object. `BackButtonGuard` is replaced rather than ported — the component that starts the quiz
pushes the history guard entry itself.

**The Daily Challenge (`DailyLayer.tsx`, `client:idle`).** Its own island because it is the only
thing in the app that talks to a server: `lib/daily/api.ts` imports the API client **lazily**, so
it lands in its own chunk and never constructs during SSR. The flow is a state machine
(`lib/daily/useDailyAttempt.ts`) and deliberately **not** a quiz-core session —
`quizStore.startForeign(DAILY)` publishes "a quiz is on screen" without a reducer to mirror.

**There are two map appliers and they must stay apart.** quiz-core's block *describes* what to
look at and the client picks a camera (`lib/quiz/globe-choreography.ts`); the server's block *is*
a camera (`lib/daily/server-map.ts`). One rule there is load-bearing: **a map-click question is
never rotation-locked**, whatever the server sends, or the player cannot reach the country they
mean and the question is unanswerable.

**Search and the country info panel (`SearchBox.tsx`, `CountryInfo.tsx`).** Both live in
`ShellControls`, not in islands of their own: they need the same globe handle and the same
"stand down while a quiz runs" rule. Matching is `lib/search.ts` — pure, and separate
because both its rules were bugs in the vanilla version: **diacritics fold** (the four
accented names in the mesh were unreachable from an ASCII keyboard) and **prefix beats
substring** (Enter takes the first result, so alphabetical order decided what Enter did).

The info panel reuses `FlagStage` rather than writing a second waving-flag renderer, so
that component takes `{width, height, className}` and owns its canvas rule in
`styles/flag.css`. Its container is `pointer-events: none` with only the close button and
the link opting back in — forget that and the link renders but cannot be clicked. The
"Read more" link is gated on `country-pages.json` (via `lib/published.ts`), because only a
handful of countries have articles and the rest would 404.

**Country facts are the country table's job, not the panel's.** `countryData` covers the
210 sovereigns; territories carry their ISO, parent, population, area and language on the
mesh record instead. The vanilla app merged the two by mutating the imported module at
boot; `createCountryTable` builds the union where both sources are in scope, emitting
`parent`, `population`, `areaLabel` and `language`. Note `areaLabel` (a string to show)
is deliberately not `area` (km², for quiz size filtering).

**Settings, progress and weak spots (`ShellControls.tsx`, `client:idle`).** A sibling island to
the quiz, mounted for every route, rendering **null** until a globe exists. Settings drive
`GlobeAppearance` and never see an engine object. The progress sheet is a pure read over
`quizHistoryStore`. `src/lib/overlay.ts` is a module singleton naming which sheet is open, so
the quiz's mode picker can open the progress sheet across the island boundary — the same
separate-roots constraint as everywhere else. Sheet scaffolding shared by all four surfaces is
`styles/sheet.css`.

The **theme picker** is there since B9: "Default" plus every published remote theme, fetched when
the sheet opens so a reader on the default never causes a request; applying one goes through
`lib/theme.ts`. Beside it, "Open the Theme Lab" appears only for a session that could save
(dev, or the audit token). Not ported: the dev editors.

**Other islands reach the globe through `src/lib/globe.ts`**, a module singleton holding the
`GlobeBridge` and the country table. Forced, not stylistic: `GlobeIsland` is `client:only` and
the quiz UI is a separate React root, and separate roots cannot share a provider — the same
constraint that makes `quizStore` a singleton. `src/lib/globe-types.ts` restates the bridge in
TypeScript because the package is plain JS by design; `tests/globe-bridge-types.test.js` fails
if the two drift, since a restatement nothing checks is a copy waiting to rot.

**The globe (`GlobeIsland.tsx`, `client:only="react"`).** It renders nothing at build time and
must not try — it needs WebGL, a canvas and `window`. That is why the "Loading globe…"
placeholder lives in the page's own markup: a `client:only` island contributes no HTML for
the crawler or the first paint. Both the placeholder and the globe host are `position: fixed`
and out of document flow, so the swap between them cannot reflow the article — measured CLS
is 0.

The island is glue and lifecycle only. It imports the vanilla engine unchanged (`SceneManager`,
`GlobeManager`, `CameraController`, `LabelManager`, `FocusZoomRegistry`, `PointerControls`,
`installContextRecovery`) and drives it through `GlobeBridge`; a second globe implementation
would be the one that drifts. `GlobeManager.init()` must be called before `loadGlobe()` — it
creates the Group the meshes are added to, and skipping it fails later and less obviously.
Everything else is configured **after** `loadGlobe` resolves, in one `cameraController.configure`
call, because the labels need centroids and the focus registry needs bboxes.

`installContextRecovery` matters more here than in the vanilla app: the island mounts once and
never remounts, so without it a lost context is permanent.

`PointerControls`' three edit modes are optional — an absent editor is substituted by a
permanently-inactive stand-in rather than guarded at eleven call sites — because they are dev
tools this app does not build.

The import is dynamic so Three.js (~511 KB) is never in the page's initial bundle.

**The production head is static, and built from one config.** `AppLayout.astro` carries the AdSense
verification meta and loader, Consent Mode v2 defaults, GA4, Google's CMP (Funding Choices),
favicons, manifest, `theme-color`, Open Graph/Twitter images and JSON-LD — generated by
`lib/site-head.ts` from `js/data/site-config.js`, the same file `build-landing.mjs` reads for the
`/borders/*` pages. Three rules: the tags are **raw HTML**, never injected from JS (a non-executing
crawler must find the loader — the class of failure the site was rejected for); the **consent
defaults are the first script** on the page, before anything that could store; and they exist
**only in a production build** (`import.meta.env.PROD`), so `astro dev` never sends a hit. The
region list is `CONSENT_REGIONS` in `site-config.js` and nowhere else — `analytics.js`, the borders
generator and the layout all read it. `tests/production-head.test.js` pins the order and the
single source. Runtime halves: `lib/analytics.ts` (`track`, `quiz_start`/`quiz_complete`/
`daily_complete`), `lib/error-reporter.ts` (hoisted `<script>` in the layout, inert off-prod),
`lib/consent.ts` (the "Manage consent choices" button in settings). Ad *units* wait on a slot id,
as before. A WebGL failure renders a card in the globe's seat from `GlobeIsland` — the article
underneath stays the page.

**Asset origin, and the CORS trap.** R2's CORS policy allows only
`https://terragotcha.com` and `https://www.terragotcha.com`, so anything on localhost that
points at R2 gets a CORS failure and no globe — with the page otherwise looking fine, since
the article does not depend on it. So `astro dev` serves the repo's `assets/` at `/assets`
itself (middleware in `astro.config.mjs`, dev-only — a `public/` symlink would get copied
into production builds). `astro build` points at R2; `npm run build:local` overrides it for
previewing a build. Widen the R2 policy only if a deployed non-production origin needs it —
not for local work.

**Dev troubleshooting: `_jsxDEV is not a function`.** Symptom: the page flashes its content
then goes blank, the globe never appears, and the console blames `GlobeIsland`. It is not a
code bug — `_jsxDEV` only exists in dev builds, and a production build of the same commit is
fine. It means Vite's dependency cache went stale, which happens when `package.json` or the
lockfile changes under a running dev server. `GlobeIsland` is the one that reports it because
it is the only `client:only` island, so its component is resolved in the browser at runtime.

Fix:

```bash
cd apps/web && npx astro dev stop && rm -rf node_modules/.vite && npx astro dev
```

**Styling rule (`apps/web/src/styles/`).** Every colour, radius, weight, font-family and
shadow must resolve to a `var(--…)` token from `@terragotcha/design-tokens` — never a
literal. Spacing comes from the six-step scale (`--space-1`…`--space-6`); its absence is the
single biggest reason the old `styles.css` sprawled to 5,481 lines. The generated
`packages/design-tokens/dist/tokens.css` is imported by `CountryLayout.astro` ahead of the
page styles, so the whole cascade is token-driven.

Layout constants that are *not* theme knobs (an author cannot set them) live as local custom
properties, e.g. `--panel-grip`. Where JS needs the same number it reads the property via
`getComputedStyle` rather than restating it — `PanelSheet` does this for the collapse maths,
because two declarations of one value drift silently.

`styles.css` at the repo root belongs to the **vanilla app** and is not used here; it is
replaced, not migrated.

## Key Features

### 1. Interactive 3D Globe
- **Zoom range:** 1.13 (closest) to 10.00 (farthest)
- **Controls:** Drag to rotate, scroll/pinch to zoom
- **Surface:** Two meshes sharing one ShaderMaterial: an ocean SphereGeometry at radius 1.0 (uniform aCountryId=0 → ocean color) plus a merged country mesh at radius 1.0008 (each vertex tagged with its country ID, fragment shader looks up the color in a 256-pixel palette texture). Vector polygon edges — mathematically crisp at any zoom, no rasterization staircase.
- **Country borders:** An optional line that **shares the fill mesh's exact vertices** — `world-border-lines.bin` lists the mesh's boundary edges (edges used by one triangle = every country's outline + coastlines), drawn as a `THREE.LineSegments` child of the country mesh from the same `position` attribute. Because the line is co-radial with the fills, there's no parallax. It renders with **depthTest off** (so the fill's slope-scaled polygon offset can't win the depth race and occlude the line near the limb — the old cause of borders fading toward the globe's edge) plus a per-vertex **horizon cull** in the border shader — `discard` where the vertex faces away from the camera — to hide the far hemisphere that `depthTest` used to hide. A small clip-space depth bias is retained as a belt-and-braces nudge. Constant 1px (WebGL line-width cap) so it's the same width at every zoom. Toggle/opacity/color via `globeManager.setBorderVisible/setBorderOpacity/setBorderColor` and the settings gear.
- **Country identification:** Per-vertex `aCountryId` attribute; the same ID is also rasterized into a CPU-side ID buffer (`world-id.bin`) for fast picking.
- **Picking:** Ray-sphere intersection + lookup into the CPU-side ID buffer (O(1) per pick)
- **Subgroup display:** `globeManager.showOnly([names])`, `showAll()`, `hideCountry(name)`, `fadeOthers([names], dimAlpha)` — each is a few-byte mutation of the palette texture.

### 2. Country Labels
- **Auto-generated:** Canvas-based text textures
- **3 size tiers:** `LARGE_COUNTRIES` / `SMALL_COUNTRIES` in `js/data/country-sizes.js`
  (anything in neither is medium), shared by both apps. **Every name must be one the globe
  actually uses** — the mesh calls them `USA`, `Democratic Congo` and `Vatican`, and all three
  were spelled out in full and silently did nothing for as long as the lists existed, because a
  tier assignment matching no country just falls through to medium. `tests/country-sizes.test.js`
  checks the lists against `assets/country-meta.json`.
- **Smart visibility:** Based on zoom level and camera direction
- **Position:** Placed at country centroids at radius 1.02
- **Configurable:** Manual positioning via label editor

### 3. Interactive Label Editor
- **Edit mode:** Toggle with 'E' key or "Edit Labels" button
- **Selection:** Click labels to select (green wireframe indicator)
- **Positioning:**
  - Drag labels or selection rectangle to reposition
  - Fine-tune modal with X/Y/Z offset sliders
- **Sizing:**
  - Double-tap to increase (mobile)
  - Long-press to decrease (mobile)
  - Mouse wheel to adjust (desktop)
  - Scale slider in fine-tune modal
- **Reset:** Restore labels to default positions
- **Persistence:** Save/load configuration via JSON

### 4. Quiz System
- **Name the Flag:** Identify highlighted countries
- **Find the Country:** Click correct country within time limit
- **Scoring:** Track correct/incorrect answers
- **Adaptive zoom:** Auto-zooms to clicked countries

### 5. Zoom Level Widget
- **Visual indicator:** Vertical progress bar (right side)
- **Numeric display:** Shows exact camera distance
- **Real-time:** Updates every frame
- **Range:** 1.13 - 10.00 units

## Important Code Sections

### Zoom Thresholds (for label visibility)
```javascript
const ZOOM_FAR = 6.0;      // Show only large country labels
const ZOOM_MEDIUM = 3.5;   // Show large + medium labels
const ZOOM_CLOSE = 2.2;    // Show all labels
```

### Camera Setup
```javascript
controls.minDistance = 1.13;  // Closest zoom
controls.maxDistance = 10;     // Farthest zoom
controls.enablePan = false;    // No panning
```

### Label Configuration Format
```json
{
  "United States": {
    "position": { "x": 0.85, "y": 0.45, "z": 0.25 },
    "fontSize": 32,
    "scale": 1.2
  }
}
```

### Globe Sphere Radius
- **Ocean sphere:** Radius 1.0 (background)
- **Country mesh:** Radius 1.0008 (vector polygons, scaled at runtime)
- **Lat/long line set:** Radius 1.001
- **Labels:** Positioned at radius 1.02

## Build Process

The globe assets are pre-built using `build-textures.js`:

1. **Input:** GeoJSON files from `world-geojson` npm package
2. **Process:**
   - Simplify polygons (`simplify-js`, tolerance 0.006)
   - Antimeridian unfolding (edges with |Δlng| > 180 are continued past ±180 to keep rings continuous)
   - Compute centroid + bbox from each country's largest ring
   - Attach each country's land area (km², from the `world-countries` package via `area-data.js`) to its meta row — used at runtime to size-filter quiz targets (e.g. the "Find the country" quiz skips anything smaller than Guadeloupe). `node -e "require('./area-data').backfillMeta()"` re-derives it into the committed `country-meta.json` without a full mesh rebuild
   - **Clip each unfolded ring to a 4° lat/lng graticule** (`clipRingToCell`, Sutherland–Hodgman) before triangulating, so no triangle spans more than a cell and chord sag is bounded **by construction** (`GRATICULE_CELL_DEG`, budget `MAX_CHORD_SAG`). This replaced a uniform post-triangulation subdivision pass gated on each ring's single *worst* triangle, under which 54 of 5,936 rings dragged the whole mesh up 10.4× in triangles
   - Triangulate each clipped piece with `earcut`; project each vertex to the unit sphere; accumulate into one merged vertex/index/country-id arrays for `world-mesh.bin`. Vertices are **welded per country ID** on rounded lng/lat — required, not an optimisation: adjacent cells each emit the shared cut edge, and `extractBorderEdges` treats an edge used by one triangle as a boundary, so without welding every grid cut would render as a fake border
   - Edge-function scanline rasterizer also fills the 4096×2048 ID buffer (used at runtime only for picking)
   - Connected-components cleanup drops tiny isolated fragments from the ID buffer (preserves each country's largest)
   - 1-pixel ID dilation eliminates seam ambiguity at country borders
   - The ID map stores **one byte per pixel**: `MAX_COUNTRIES` is 256 and `aCountryId` is already a `u8` vertex attribute, so an id can never exceed 255. The build asserts this and fails rather than truncating an id into a different country's — widen the buffer and `js/core/globe.js`'s picker before raising `MAX_COUNTRIES`
   - Country-outline edges (`extractBorderEdges`) are extracted from the merged mesh: edges used by exactly one triangle are each country's boundary (outline + coastlines), since countries don't share vertices. Written as u32 vertex-index pairs into `world-border-lines.bin` for the runtime border line
   - Per-country chosen RGB (from `country-colors.json` or random palette) is written into a 256×1 RGBA palette
3. **Output:**
   - `assets/world-mesh.bin` (~3.9 MB raw, ~1.4 MB brotli — vertex positions, per-vertex IDs, uint32 indices)
   - `assets/world-id.bin` (8 MB raw, ~52 KB brotli — picking only; one byte per pixel, since ids are capped at 255)
   - `assets/world-border-lines.bin` (~1.3 MB raw, ~220 KB brotli — boundary-edge index pairs for the border line)
   - `assets/country-palette.bin` (1 KB)
   - `assets/country-meta.json` (~75 KB minified, floats rounded to 6 dp ≈ 6 m)

The build asserts two Stage 1 invariants and exits non-zero on either: max chord sag stays under
`MAX_CHORD_SAG` (a violation means ocean bleeding through country interiors at max zoom), and no
boundary edge is duplicated *within* one country (which would mean the weld failed and a 4° lattice
of fake borders is about to appear). Duplicated edges across *different* countries are expected —
that is a shared political border, and countries deliberately never share vertices.

Run build: `node build-textures.js` (or `npm run build:globe`)
Set `FRAGDEBUG=1` to log per-country fragment counts without erasing.

## State Management

### Quiz state — `quizStore` (`@terragotcha/quiz-core`)

The single observable answer to "is a quiz on screen, and which one". A module
singleton, not an injected instance, because React Context cannot cross Astro
islands — separate React roots can only share a module-level store.

- `isActive()` / `getState()` → `{active, mode, scope, session}`. `session` is the
  live reducer state, mirrored on every dispatch; null for the Daily Challenge and
  audit mode, which are active quizzes without being reducer sessions
  (`startForeign(FOREIGN_MODES.DAILY|AUDIT)`).
- `onActiveChange(cb)` fires **only on the start/end flip**. Use it rather than
  `subscribe` for anything per-quiz: the store changes ~30 times during one quiz,
  so a raw subscription would fire an analytics event per answered question.
- A quiz mode calls `quizStore.startSession(this.session)` after `createSession`
  and `quizStore.end()` from both `end()` and `cancel()`. Nothing else writes it.

### Settings — `settingsStore` (`@terragotcha/storage`)

`get()` returns a **live reference**, by design: `settings-panel.js` and `scene-appearance.js`
both depend on it. That means its identity never changes, so React cannot use it as a
`useSyncExternalStore` snapshot — the store exposes `subscribe()` and `getVersion()` for that,
and `apps/web/src/lib/settings.ts` reads the version and the values separately.

`js/data/state.js` is **not** the place for new application state — it holds live
Three.js references and editor bookkeeping, and is destined to become internal to
the globe engine. The `quiz.*` slice was removed in stage A5.

The `quiz-active` body class stays: it is a CSS hook (and the MutationObserver
signal `BackButtonGuard` watches), i.e. presentation, not state.

### Global Variables
- `editMode` - Whether label editing is active
- `selectedLabel` - Currently selected label mesh
- `labelConfig` - Custom positions/scales (persisted)
- `labelDefaults` - Original positions (for reset)
- `globeManager` - Owns the textured-sphere mesh, coastline overlay, ID buffer, palette texture, and country lookups (`pick`, `setSelectedCountry`, `flashCountry`, `setHighlightColor`, `setSelectionGradient`, `setCountryColor`, `resetCountryColor`, `showOnly`, `showAll`, `hideCountry`, `fadeOthers`, `getCountryByName`, `getCountryNames`, `getCentroids`)
- `countryLabels[]` - Array of label meshes

### Event Flow
1. User interaction (click/drag/wheel)
2. Raycasting to detect intersections
3. Update state (position/scale)
4. Store in `labelConfig`
5. Save to JSON on demand

## Mobile Optimizations

- **Touch gestures:** Pointer events (not mouse events)
- **Haptic feedback:** Vibration on double-tap/long-press
- **Responsive UI:** Different button positions for mobile/desktop
- **Tap detection:** Threshold-based drag vs. tap differentiation

## UI Components

### Buttons (Mobile & Desktop)
- **Edit Labels** (green) - Toggle edit mode
- **Save Config** (blue) - Download label-config.json
- **Fine Tune** (purple) - Open slider modal (when label selected)
- **Take Quiz** (orange) - Start quiz mode

### Modals
- **Label Editor Modal** - Position/scale sliders with reset button
- **Quiz Mode Selector** - Choose quiz type
- **Quiz Results** - Display final score

### Widgets
- **Zoom Widget** - Vertical progress bar + numeric value
- **Tooltip** - Country name on hover
- **Flag Container** - Country info panel

## Development Workflow

1. **Edit labels:** Use edit mode to position labels
2. **Save config:** Download `label-config.json`
3. **Deploy:** Place JSON file alongside `index.html`
4. **Auto-load:** Labels load custom positions on page load

## Performance Considerations

- **Two draw calls** for the entire globe: ocean sphere + merged country mesh (vs. ~195 in the per-country mesh era). Mobile GL pain comes from per-draw-call setup, not vertex throughput. The mesh is ~157k triangles / ~166k vertices since graticule clipping replaced uniform subdivision — an 83%/90% reduction with no visual change.
- **Vector polygon fills** — country edges are mathematical polygon edges, sharp at any zoom. No rasterization staircase, no bulk color texture.
- **O(1) picking** via CPU-side ID buffer lookup (the GPU never sees the ID texture in this build)
- **Highlighting / subgroup display via 1-byte palette mutation** — `setCountryColor`, `showOnly`, `fadeOthers` all rewrite a few bytes of the 1 KB palette texture and flip `needsUpdate`. No frame cost, no shader recompile.
- **Selection highlight is a flat fill (`uSelectedId`/`uSelectedColor`) with one opt-in embellishment** applied to the selected country only, driven by uniforms in the fill shader (no geometry): **gradient** (`setSelectionGradient`, `uSelGradient` — a radial tonal ramp, bright centre → shaded edge, `color *= mix(1.12, 0.28, gradT)` (mostly edge-darkening, so it doesn't blow out into a hotspot under the globe's lighting), using `uSelectedCentroid`/`uSelectedRadius` set on select). On by default (`selGradient` in `settings-store.js`), toggled by a settings-panel checkbox. It modulates around the per-scheme highlight colour (`setHighlightColor`); the default greys-scheme highlight + the settings swatch are a **mid-gray** (`0x9e9e9e`, not white) so the gradient has headroom to *brighten* the centre as well as darken the edges (a white highlight can only darken). The green quiz `flashCountry` overlay is a separate, unaffected path.
- **Polygon offset** on the country material prevents flicker where neighboring countries share borders.
- **Selective rendering:** Labels hidden when not facing camera
- **Deferred loading:** ID buffer, palette, mesh, and meta JSON fetched in parallel

## Key Coordinates

### Country Size Categories
- **Large:** Russia, Canada, USA, China, Brazil, etc. (50 countries)
- **Small:** Vatican, Monaco, Singapore, etc. (30 countries)
- **Medium:** Everything else (default)

### Rotation Animation
- **Idle timer:** 30 seconds of inactivity
- **Rotation speed:** 0.001 radians/frame
- **Auto-stop:** On user interaction

## Browser Compatibility

- **Chrome/Edge:** Full support
- **Firefox:** Full support
- **Safari:** Full support
- **Mobile browsers:** Touch gestures supported

## Code Organization (IMPORTANT for new work)

`index.html` is gigantic and is slated for a refactor before final deployment. **New features must
minimize what they add to `index.html`:**

- **No new CSS in `index.html`** — put all new rules in the external `styles.css`.
- **Use design tokens, not literals.** `styles.css` opens with a `:root` control panel of design
  tokens (semantic: `--accent`, `--bg-app/-panel/-elevated` (+ `--scrim`), `--text-heading/-body/-muted`,
  `--radius-btn/-panel/-pill`, `--weight-*`, `--font-display/-ui`, `--shadow-low/-mid/-high/-dock`,
  `--glow-cta/-accent`; plus primitive family
  ramps). New rules must reference `var(--…)` for colours, radii, weights, font-families, and
  shadows/glows — never hardcode a hex/rgba/px-radius/weight/family/box-shadow — so the UI theme switcher
  (`js/features/theme-switcher.js`, `<html data-theme>`) keeps working. Canvas surfaces read tokens
  via `js/utils/theme.js` (`cssToken`/`canvasFont`) and re-bake on the `globe3d:theme-changed` event.
  Beyond the built-in presets, admins author **remote themes** (backend `themes` app; superuser-gated
  CRUD via the audit token) that test users pick from the settings selector; the ~24 editable "knob"
  tokens are listed in `js/data/theme-tokens.js` (a legacy list the backend **no longer accepts**
  since B9 — the vanilla editor is a dev-page tool now, not a way to author themes). One of them is
  `--accent-secondary`, the violet used only by the docked Daily Challenge pill (`#dq-today`); the
  pill's `--violet-fill/-fill-hover/-border/-border-hover/-label/-icon` are **derived** from it via
  `color-mix()` (same idiom as `--accent-soft`) and are deliberately not knobs, so one swatch
  recolours the whole pill. Prefer that pattern — derive from a knob rather than adding knobs — the
  editor is already busy. The in-app live editor is `js/features/theme-editor.js`,
  which renders rows straight from `TOKEN_GROUPS` — adding a knob needs no editor change. Roundness is two editable
  knobs — `--radius-btn` (all buttons + controls) and `--radius-panel` (containers); `--radius-pill`
  (999px) and `--radius-circle` (50%) are fixed shapes. A global `button { border-radius:
  var(--radius-btn) !important }` rule unifies button roundness — round/pill `<button>`s (close/swatch
  icons, the segmented control) re-assert their shape with a `!important` override.
  Shadows/glows are likewise a **fixed** token set (like `--radius-pill/-circle`, *not* theme-editor
  knobs): a `--shadow-low/-mid/-high` elevation scale (thumbnails / controls / modals+containers),
  `--shadow-dock` for bottom-docked sheets (same weight, cast upward), `--glow-cta` for primary accent
  CTA buttons, and `--glow-accent` for the pulsing radial halos. Each references a themed colour token,
  so the whole shadow system adapts per theme with no per-theme redefinition — every `box-shadow` and
  accent glow in the app must resolve to one of these (no ad-hoc offsets/blurs). **The two glow
  tokens are currently disabled** (`--glow-cta: none`, `--glow-accent: transparent`) — the effect is
  off app-wide but the tokens and all `var(--glow-*)` usage sites remain; restore the `was:` values in
  the `:root` block to re-enable.
- **No new inline `<script>` logic** — all new JS goes in separate ES modules under `js/`
  (e.g. `js/features/<feature>.js`), imported from the main module block. The last inline
  library, the Perlin noise the flag wave uses, left in B10a and is now `js/utils/perlin.js`;
  it had to, because a `window` global only exists in the document that sets it and the flag
  quiz now also runs in the Astro app.
- **Prefer self-contained feature modules** that create their own DOM and attach their own
  listeners at runtime (as `js/features/flag-renderer.js` does with its canvas), rather than adding
  static markup to `index.html`. Pull third-party libs via ESM `import` from a CDN where practical
  instead of new `<script>`/`<link>` tags.
- Net effect: a new feature should touch `index.html` by roughly an `import` + one instantiation
  call, and nothing more.
- **`index.html` contains one generated region — do not hand-edit it.** Everything between
  `<!-- BEGIN GENERATED: landing panel ... -->` and `<!-- END GENERATED: landing panel -->` is the
  apex's static, crawlable content, written by `build-landing-facts.mjs` from
  `landing/landing-facts.json` (editorial copy) + `assets/country-meta.json` (the figures). Edit the
  JSON and run `npm run build:landing-facts`; `npm test` runs `--check` and fails if the block is
  stale. Every superlative is verified against the baked country geometry, so the build refuses a
  claim the data contradicts — that check is the point of the file, not a formality.
- **Icons: use inline SVG everywhere.** Do not add icon-font `<link>`s (e.g. Phosphor/Font
  Awesome webfonts) or `<i class="...">` glyphs. Define the needed SVG markup as constants in the
  feature's module and inject it at runtime. This keeps `index.html` free of new `<link>` tags and
  avoids a webfont dependency. When recreating a design that specifies an icon font (e.g. Phosphor),
  port the individual glyphs to inline SVG.

**Quiz answer eligibility.** "Name the country" admits dependencies large enough to recognise on the
globe (≥1,628 km² — Greenland, French Guiana, the Falklands, Puerto Rico, …) and excludes the long
tail of specks; sovereign states are **never** size-filtered, since 27 real ones are under that
threshold (Singapore, Malta, Monaco) and all are expected answers. See
`excludeMinorDependencies` in `packages/quiz-core/src/filters.js`. The **capital** quiz excludes every
dependency regardless of size, deliberately: a territory's administrative seat (Nuuk, Cayenne) is a
much more obscure fact than a sovereign capital, so size doesn't make it fair.

**`docs/senior_dev/implementation-plan.md` is the single source of truth** for the refactor and all
prospective code-quality/modularization/deployment improvements (it includes an `index.html`
anatomy review with per-chunk line ranges). Any change that renders it out of date — extracting a
module, shifting line ranges, completing a stage, or altering the structure it describes — must
update that document accordingly in the same change.

## Known Limitations

- `index.html` is bootstrap + glue + (shrinking) inline UI logic; core systems live in modules under `js/` (scene, globe, labels, camera, quiz, flags, search, animations). See `docs/senior_dev/implementation-plan.md` for the modularization roadmap.
- Country borders are a 1px line sharing the fill mesh's exact vertices (`world-border-lines.bin` = boundary-edge index pairs), co-radial with the fills (no radial lift → no parallax). Rendered with `depthTest` off + a shader horizon cull (discard back-facing vertices) so the line stays crisp all the way to the limb without being occluded by the fill's slope-scaled polygon offset; a small clip-space depth bias is kept as a nudge. Toggle/opacity/color via `globeManager.setBorder*` and the settings gear. WebGL caps line width at 1px, so thickness isn't adjustable without a fat-line implementation.
- No search index (linear search through country names)
- Country name labels are canvas-rendered white textures tinted at runtime via `material.color`; the font follows the `--font-base` token (re-baked on theme change), but per-label colour/font styling beyond the tint isn't exposed.
- Per-country mesh manipulation (e.g., scale or move a single country) is no longer supported — the globe is one mesh.

## Future Enhancement Ideas

- Multi-language label support
- Custom label fonts/colors
- Animated country transitions
- Data visualization overlays
- More quiz modes
- Label clustering for small countries

## Git Branch Strategy

- **main** - Stable releases
- **ui** - Current development branch (label editor, quizzes)
- **Don't create new git branches** - commit to the current branch.

## Credits

- Country geometry from `world-geojson` npm package
- Flag icons from `flag-icons` library
- 3D rendering by Three.js
- Label editor and textured-globe migration developed with Claude Code assistance
