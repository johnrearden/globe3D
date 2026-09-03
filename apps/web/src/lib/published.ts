/**
 * Which countries have an article to link to.
 *
 * Only a handful do — a country without reviewed content has no page at all,
 * which is deliberate (`lib/content.ts`). So the info panel has to *ask* before
 * offering a "Read more" link; linking optimistically would 404 for the large
 * majority. `flag-renderer.js` made the same check for the same reason.
 *
 * Fetched rather than imported. `content/countries.json` is 14 KB of article
 * prose and importing it would put all of that in a client chunk to obtain four
 * name/slug pairs; `country-pages.json` is 135 bytes and is exactly that list.
 * It is staged into `dist/` by `build-pages.mjs` and served in dev by the
 * middleware in `astro.config.mjs`.
 *
 * One request per session, shared by every caller, and never retried: a failure
 * means no link, which is the same outcome as an unpublished country and is not
 * worth telling the reader about.
 */

let pending: Promise<Map<string, string>> | null = null;

interface PublishedRow {
    name: string;
    slug: string;
}

/** name → slug, for countries with a published article. */
export function publishedPages(): Promise<Map<string, string>> {
    pending ??= fetch('/country-pages.json')
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: PublishedRow[]) => new Map(
            (Array.isArray(rows) ? rows : []).map((r) => [r.name, r.slug]),
        ))
        .catch(() => new Map<string, string>());
    return pending;
}
