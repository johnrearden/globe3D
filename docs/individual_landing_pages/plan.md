# Plan: Lightweight "bordering countries" SEO landing pages

## Context

Terragotcha is about to launch with a single page (the 3D globe app), which is a thin
SEO surface and slow for cold search traffic (~49 MB of R2 assets before interactive).
This adds a set of **standalone, static, fast-loading quiz landing pages** — one per
country — targeting the evergreen query pattern *"what countries border X"*. Each page
is a single multiple-choice question in the familiar Daily-Challenge style, over a
manually-captured map image, with a CTA funnelling to the main app.

Goal: capture long-tail search traffic (programmatic SEO) and convert it into app
visits, without the page ever loading the heavy globe.

### Why this is viable (from exploration)
- **Answer data already exists**: `Country.borders` (cca3 list), `region`, `area`,
  `mesh_name`, `flag_iso` in `backend/geo/models.py`; and `gen_bordering()` in
  `backend/quiz/generation/bespoke.py` already builds the prompt + option grid
  (neighbours + nearest distractors) + correct answer set. We reuse this at build time.
- **The quiz UI is separable from the globe**: `js/features/daily-quiz/options-grid.js`
  is standalone; the reveal styling (`.dq-cell.reveal-right/-wrong/-missed`) and all
  `.dq-*` rules live in `styles.css` (~lines 2493–2892). Grid questions need the globe
  only for decorative map framing — which we replace with a static image.
- **Cloudflare Pages serves clean URLs natively**: real files at
  `/borders/<slug>/index.html` resolve at `/borders/<slug>` with no `_redirects`.

### Decisions made with the user
- **Scope v1**: curated high-impact subset (~24–30 countries), not all ~150. Expand later.
- **Map images**: captured **manually** by the user into `img/borders/<slug>.png`.
- **Data**: baked into each page statically at build time (no runtime API call) — fast,
  resilient, no API load.

## Non-negotiable SEO rule
The **answer must be in the server-rendered HTML** (a crawlable text list of the bordering
countries + descriptive image `alt`), independent of the interactive reveal. Reuse the
existing hidden-`#seo-content` pattern from `index.html`. If the answer only appears after
a JS click, the page can't rank for the target query.

## Architecture & files

### 1. Build-time data export (reuse backend logic, don't reimplement)
New Django management command **`backend/quiz/management/commands/export_border_quizzes.py`**:
- Input: a curated slug list (see Phased rollout) — store as `backend/quiz/data/border_quiz_targets.json` so it's editable without code.
- For each target, reuse `gen_bordering` machinery (`_resolve_neighbours`, `cca3_index`,
  the nearest-distractor selection) with a **fixed seed** so option sets are deterministic/stable.
- Emit **`landing/borders-data.json`** (committed), one entry per country:
  ```json
  {
    "slug": "poland", "name": "Poland", "region": "Europe", "borderCount": 7,
    "areaKm2": 312679, "flag": "pl",
    "neighbours": ["Belarus","Czechia","Germany","Lithuania","Russia","Slovakia","Ukraine"],
    "options": [{"value":"Belarus","label":"Belarus","flag":"by"}, ...12 total],
    "answer": ["Belarus","Czechia","Germany","Lithuania","Russia","Slovakia","Ukraine"]
  }
  ```

### 2. Static page generator (Node, sibling to `build-pages.mjs`)
New **`build-landing.mjs`**:
- Reads `landing/borders-data.json` + an HTML template (`landing/border-page.template.html`).
- Writes `borders/<slug>/index.html` for each entry. Each page contains:
  - **Unique `<head>`**: title (`What countries border Poland? — Map quiz | Terragotcha`),
    meta description, `<link rel=canonical href=https://terragotcha.com/borders/poland>`,
    OG/Twitter tags pointing at `https://terragotcha.com/img/borders/poland.png`,
    `theme-color`, JSON-LD (`Quiz`/`WebPage`). Mirror the head conventions in `index.html`.
  - **Crawlable SEO block** (visible or `sr-only`): `<h1>Which countries border Poland?</h1>`,
    the answer list as text, one or two unique fact sentences (region, area, border count),
    `<img src=/img/borders/poland.png alt="Map of Europe with Poland highlighted and its 7 bordering countries">`.
  - **Quiz mount** + the question data inlined as `<script type="application/json">`.
  - **CTA** deep-linking the Daily Challenge (`https://terragotcha.com/?daily=1` or equivalent),
    plus **related-page links** to 2–3 neighbours that also have pages (internal-link graph).
  - **In-content AdSense slot** (see below) between the quiz reveal and the related-links block.
  - **Privacy-policy footer link** to `/privacy/` (required disclosure for ads/analytics).
- Appends every page URL to **`sitemap.xml`**.

### 3. Tiny landing JS entry (no globe tree)
New **`js/landing/border-quiz.js`** (+ minimal helpers):
- Imports **`js/features/daily-quiz/options-grid.js`** directly (reuse the grid UI).
- Reads the inlined question JSON, renders the grid, on submit applies reveal classes
  (`reveal-right/-wrong/-missed`) itself, shows "Hard luck/Nice work!" + the CTA.
- **Stubs the globe** (no-op object) and does **not** import `api-client.js` or any
  `js/core/*` module — so none of the heavy globe/Three.js code is pulled in.

### 4. Styling — reuse, don't duplicate
Landing pages `<link>` the existing **`styles.css`** directly. Globe-specific rules are
inert (no matching elements); the `.dq-*` rules give the exact quiz look. ~18 KB gzipped,
cached across pages — avoids a parallel stylesheet that would drift.

### 4b. Ads (AdSense) — these pages are the primary ad surface
These content-rich, standard-layout pages are the **safest, highest-RPM AdSense inventory** and
are what makes the whole domain approvable (the main WebGL app is thin-content). So each border
page carries **one in-content responsive display unit**, placed **between the quiz reveal and the
related-links block** — never adjacent to the answer buttons (accidental-click policy), never
above the fold before content.
- Use the shared client id from **`js/data/site-config.js`** (`ADSENSE_CLIENT_ID`) and a
  dedicated landing ad-unit slot id. The static template can either inline the standard
  `<ins class="adsbygoogle">` + `adsbygoogle.push({})` snippet, or (preferred, to match the app)
  call **`mountAd(el, { slot })`** from `js/features/ads/adsense.js` after loading the loader
  script. Keep the loader `<script async>` in the template `<head>`.
- Label the unit "Advertisement" and reserve its height in `styles.css` so it causes no layout
  shift (protect the cold-traffic Lighthouse win).
- Consent: the same Google CMP + Consent Mode v2 defaults used by the app apply here; set the
  denied defaults before the ad/analytics tags fire.
- **Privacy policy:** link `/privacy/` in the page footer (shared page at `privacy/index.html`).

### 5. Build & routing wiring
- `package.json`: `build:pages` runs `node build-landing.mjs` **before** `node build-pages.mjs`.
- `build-pages.mjs` INCLUDE: add `'borders'` (generated pages) and `'img'` already covers
  `img/borders/`. `js/` is already copied wholesale, so `js/landing/*` ships automatically.
- No `_redirects` needed (real files = clean URLs on Pages).

## Image capture checklist (manual, user)
For each curated country, capture from the app and save as **`img/borders/<slug>.png`**:
- Framing: the country's **continent/region**, target country **highlighted**, neighbours visible.
- Dimensions: **~1200×630** landscape (works in-page *and* as the OG share image).
- Naming: lowercase slug matching `borders-data.json` (`poland`, `chad`, `cote-divoire`).
- Optional later: a second `-answer.png` with neighbours labelled (not needed for v1 — the
  grid reveal already shows correct/incorrect).

## Phased rollout
- **v1 curated list (~24–30)** — high recognition + many land borders. Proposed seed
  (user edits `border_quiz_targets.json`): France, Germany, Poland, Spain, Italy,
  Switzerland, Austria, Belgium, Netherlands, Ukraine, Russia, Turkey, China, India,
  Iran, Iraq, Saudi Arabia, Egypt, Nigeria, Chad, South Africa, Kenya, Brazil, Argentina,
  Mexico, USA, Thailand, Vietnam.
- Get indexed + measure in Search Console before expanding toward the full ~150, and
  before considering continent/region pages (the data + `gen_region_click` already exist).

## Verification
1. `python manage.py export_border_quizzes` → inspect `landing/borders-data.json` (answer
   sets match `Country.borders`, options = neighbours + distractors, 12 options).
2. `npm run build:pages` → confirm `dist/borders/poland/index.html` exists and
   `dist/sitemap.xml` lists the new URLs.
3. Serve `dist/` locally (`python -m http.server`) and load `/borders/poland`:
   - **Network tab: no `world-mesh.bin`, no `*.pmtiles`, no `world-id.bin`** fetched.
   - Quiz renders, multi-select submit works, reveal colours correct/incorrect/missed.
   - **View-source**: the bordering-countries answer list is present as text; canonical,
     OG image, title, JSON-LD all correct and unique.
   - CTA + related links resolve.
4. Lighthouse on the page → LCP/INP green (this is the cold-traffic win).
5. Post-deploy: re-scrape one page in the Facebook/X debuggers (per
   `docs/deployment/manual_steps.md`) to confirm the per-page OG image unfurls; submit the
   updated sitemap in Search Console.

## Risks & mitigations
- **Thin/near-duplicate (top pSEO failure)** → unique map image + crawlable answer list +
  unique fact sentences per page; start with a curated subset, not a 150-page dump.
- **CSS/UI drift** → reuse `styles.css` and `options-grid.js` directly rather than copies.
- **Ranking vs Wikipedia/knowledge panel** → lean on the "test yourself" quiz angle (lower
  competition) and aggregate long-tail; treat as a medium-term, compounding play.
- **Capture effort** → bounded to the v1 subset; only scale once it's proven.
