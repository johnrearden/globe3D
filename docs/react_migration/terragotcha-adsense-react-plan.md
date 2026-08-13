# Terragotcha — AdSense Remediation & React Migration Plan

> **Status: partly superseded.** The problem statement below still holds; the
> architecture, sequencing and UI sections have been overtaken by the shared-core
> plan (extract `packages/quiz-core` from the vanilla app first, then Astro/React
> web, then Expo). That plan is not yet in the repo — it should move here.
>
> Settled since this was written:
> [`c0-expo-gl-spike.md`](./c0-expo-gl-spike.md) — the React Native app can render
> the real 30 MB globe mesh through expo-gl at 60 fps, so the native globe is the
> same globe, not a decimated stand-in.

## Context / Problem

Terragotcha (terragotcha.com) is a geography quiz web app built around an interactive Three.js globe. It was **rejected by Google AdSense for "low quality content."**

The root cause is architectural, not editorial: the app is a client-rendered SPA (currently vanilla JS). All the substantive content — country information and quizzes — is loaded and revealed via JavaScript and click events. On first load, the raw HTML is essentially an empty shell, so the AdSense crawler sees no content.

**Current stack:** Django/DRF backend on Hetzner; frontend on Cloudflare Pages; Protomaps/PMTiles for map layers; globe uses a texture-plus-internal-light model for country highlighting.

---

## Core Fix

Get **real, indexable text into the initial HTML response** for each country, while keeping the interactive globe for human visitors.

### 1. Pre-rendered static country pages
- Generate a static HTML page per country at build time (e.g. `/country/france`), with the country's text content baked into the raw HTML — not injected by JS.
- This satisfies both crawlers regardless of how clever the client-side routing is (see crawler note below).

### 2. Progressive enhancement
- Each country page ships with real static HTML text **first**.
- The Three.js globe then mounts **on top** and reads the current country from the URL (route), auto-focusing on it — same globe code, country comes from the URL instead of a click.
- **Critical:** the static text must be the source of truth. The JS must not wipe it out on mount.

### 3. Persistent globe (no remount on navigation)
- The globe takes ~3–4 seconds to mount. Remounting on every country click is unacceptable UX.
- Solution: **client-side routing** so the app never does a full page navigation after boot. The Three.js instance lives in memory the whole session; clicks are intercepted by the router, the route updates, and the globe is re-focused imperatively. No remount, instant.
- Reconciliation with AdSense: serve real static HTML per country for the crawler and first paint; once the app boots, clicks are handled client-side and the globe persists. Best of both worlds.

---

## Crawler Behaviour (why static HTML matters)

- **Googlebot** (main indexing crawler) does render JavaScript now, but it's a two-pass system — rendering is queued and can lag, and it's less reliable than plain HTML.
- **AdSense crawler** is stricter and less patient; it largely wants content in the **initial HTML response**.
- Pre-rendered static pages return real text in the raw HTML before any JS runs, so **both** crawlers are satisfied. The persistent globe is purely for human visitors.

---

## Content Strategy

### Source of truth: Django
- Treat **Django as the single source of truth**; the build script is a consumer.
- A Country model holds all content layers. Content is edited in Django admin.
- Expose content either via the existing DRF API **or** (simpler) a Django management command that dumps everything to JSON.
- Build flow: **edit content in Django admin → run the export → run the build (generate country HTML) → deploy to Cloudflare Pages.** The static pages are a rendered snapshot of the Django data.
- (Decision on live API vs. management command deferred — pick whichever fits at implementation time.)

### Richer editorial content (the actual quality signal)
- Current model shows ~4–5 facts per country. Enrich each country page into genuine editorial content with layers:
  - **Geography**
  - **History** — key figures and events
  - **Literary heritage** — notable authors, works, maybe a famous line or two
- Content must be **curated and fact-checked** so it reads as original and accurate. Avoid scraped or purely AI-generated text — that's exactly what AdSense flags as low value.
- For scale (~200 countries), use a smart pipeline (curate/fact-check rather than hand-write every word) but keep a human eye on it.
- Bonus: this also displays to real users, so it's not crawler-only busywork.

### Mobile display of the static content
- Desktop has real estate for a side panel; also show it to the actual user (no reason to generate it only for crawlers).
- Mobile: use a **bottom sheet** — a panel peeking up with the country name/summary that the user drags up to reveal the full content over the globe (the Google Maps mobile pattern; intuitive).
- Same static HTML markup in both cases — side panel on desktop, draggable sheet on mobile, differing only by CSS. The crawler sees the text either way because it's in the DOM from the start.

---

## Architecture Decision: Migrate to React

**Decision: migrate from vanilla JS to a React SPA now, at this stage.**

Reasoning:
- **SEO is neutral** between vanilla JS and React — solved by pre-rendering either way, so React doesn't hurt the static pages/SEO as long as pre-rendering is in place.
- **UI maintainability is the real driver.** The vanilla JS build suffered from sprawling style tokens, no clean reusable components, and a UI that was hard to reason about and edit. That's a developer-experience/maintainability problem, and component encapsulation (markup + styling + behaviour together, reused) is exactly where React earns its keep.
- **Comfort + tooling:** John is more comfortable in React; Claude Code is fluent in React patterns.
- **React Native path:** keeping the option open to build a React Native app for the same content (potentially easier to monetize than AdSense). A React web app is a real head start. Note: the Three.js globe and actual UI components won't port directly, but **state management, API layer, business logic, quiz logic, and data models can be shared.**

### Three.js globe inside React
- React and Three.js coexist fine, but **React must not manage the globe's render loop.** React re-renders on state change; if it touches the WebGL scene each time, you get the stutter you're trying to avoid.
- Pattern: mount the globe **once into a ref** (a container React creates but does not re-render) and talk to it **imperatively** — e.g. call `focusOn("France")` on click rather than re-rendering it.
- React drives the UI panels and routing; the globe owns its own animation loop and runs independently underneath.

---

## Infrastructure Note

- Cloudflare Pages **free tier is fine** for 200+ static country pages.
  - Build limit ~500 builds/month; unlimited requests and bandwidth for serving.
  - File-count cap per deployment is 20,000 — 200 pages + assets is far under.

---

## Summary of Decisions

1. Fix AdSense rejection via **pre-rendered static country pages** with real text in the initial HTML.
2. Use **progressive enhancement** — globe mounts on top and reads the country from the URL.
3. Keep the globe **persistent in memory** via client-side routing; no remount per click.
4. **Enrich content** with geography + history + literary heritage, curated and fact-checked, sourced from **Django as the single source of truth** and exported at build time.
5. Display content in a **responsive panel** (desktop side panel / mobile bottom sheet), same markup in the DOM from first load.
6. **Migrate to React** now — driven by UI maintainability and the shared-code React Native path; SEO-neutral given pre-rendering.
7. Mount the **Three.js globe once into a ref and control it imperatively**, keeping it out of React's render cycle.
8. Cloudflare Pages free tier handles the scale with room to spare.
