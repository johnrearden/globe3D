/**
 * The app's route vocabulary — one parser, one formatter, shared by the pages,
 * the router and the globe.
 *
 * It exists because the vanilla app answered "what is on screen?" in two
 * unrelated places that could disagree about the same URL: `landing-panel.js`
 * read `?country=` to pick a body class, and `index.html` read it again to move
 * the camera. Two readers, one URL, no shared answer. Everything here is pure
 * and takes its input, so it is testable in Node with no DOM.
 *
 * ## The trailing slash
 *
 * Country links are emitted in BOTH shapes and always have been — the generated
 * landing panel writes `/country/france/`, `CountryArticle` writes
 * `/country/france`, and `astro.config.mjs` sets `trailingSlash: 'ignore'` so
 * the server resolves either. So `parseRoute` must accept both, and
 * `pathForRoute` must emit exactly one, or the URL the app pushes will
 * contradict the canonical the page advertises.
 *
 * ## HOME_PATH
 *
 * The apex is still served by the vanilla app, so the Astro one lives at `/app`
 * until it reaches parity. That makes the flip a single constant here plus the
 * guard in `build-pages.mjs`, rather than a change scattered across every place
 * that links home.
 */

export type Route =
    | { view: 'home'; slug: null }
    | { view: 'country'; slug: string };

/** Where this build serves its apex. `/` once the flip has happened. */
export const HOME_PATH: string =
    (import.meta as { env?: Record<string, string> }).env?.PUBLIC_HOME_PATH ?? '/app';

export const HOME_ROUTE: Route = { view: 'home', slug: null };

const COUNTRY_RE = /^\/country\/([a-z0-9-]+)\/?$/;

/** Strip a trailing slash, but never turn "/" into "". */
const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

/**
 * @param pathname a same-origin `location.pathname`
 * @returns the route, or null when the path is not one this app owns (an
 *   external link, `/borders/*`, `/privacy/` — all of which must stay real
 *   navigations rather than being swallowed by the router).
 */
export function parseRoute(pathname: string): Route | null {
    const path = trim(pathname);
    if (path === trim(HOME_PATH)) return HOME_ROUTE;
    const m = COUNTRY_RE.exec(pathname);
    return m ? { view: 'country', slug: m[1] } : null;
}

/**
 * The canonical path for a route — the one shape the app pushes and the one the
 * `<link rel="canonical">` advertises. Country paths carry no trailing slash,
 * matching `CountryArticle`'s links and `sitemap.xml`.
 */
export function pathForRoute(route: Route): string {
    return route.view === 'country' ? `/country/${route.slug}` : HOME_PATH;
}

/** Do two routes name the same screen? */
export function sameRoute(a: Route | null, b: Route | null): boolean {
    return !!a && !!b && a.view === b.view && a.slug === b.slug;
}
