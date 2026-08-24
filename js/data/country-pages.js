/**
 * Which countries have a static article page.
 *
 * `country-pages.json` is baked by `build-landing.mjs` from the same
 * `content/countries.json` the Astro build consumes, so the two can never
 * disagree about what was published. It carries {name, slug} only — the app
 * needs to know *which* countries have a page, not what is on them.
 *
 * Fetched once, lazily, and failing soft: a missing or unreachable file means no
 * "Read more" links, never a broken panel. Linking optimistically instead would
 * send readers (and crawlers) to 404s for the ~230 countries not yet written.
 */

let pending = null;
let index = null;

/** Load the index once. Repeat calls share the in-flight promise. */
export function loadCountryPages() {
    if (index) return Promise.resolve(index);
    if (pending) return pending;
    pending = fetch('/country-pages.json')
        .then(r => (r.ok ? r.json() : []))
        .catch(() => [])
        .then(rows => {
            index = new Map(
                (Array.isArray(rows) ? rows : []).map(r => [r.name, r.slug]),
            );
            return index;
        });
    return pending;
}

/**
 * The article URL for a country's display name, or null if it has no page.
 * Returns null until the index has loaded — callers re-render when it does.
 */
export function countryPageUrl(name) {
    const slug = index && index.get(name);
    return slug ? `/country/${slug}` : null;
}
