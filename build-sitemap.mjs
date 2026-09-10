#!/usr/bin/env node
/**
 * build-sitemap.mjs — `sitemap.xml` and `country-pages.json`, for the whole site.
 *
 * One generator for every page type, not one per type: two would drift, and a
 * sitemap that disagrees with itself is worse than a short one. The country
 * pages are listed from the same `content/countries.json` Astro builds them
 * from; the borders pages from the same `publishedBorderPages()` gate the
 * Astro page's `getStaticPaths` calls — so a page and its sitemap entry cannot
 * exist independently.
 *
 * Until B12 this was the tail of `build-landing.mjs`, which also rendered the
 * borders pages from a hand template. Astro renders them now
 * (`apps/web/src/pages/borders/[slug].astro`); the sitemap half is all that was
 * left, and it runs first in `npm run build:pages`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ORIGIN, imageSlugsIn, publishedBorderPages } from './landing/borders-pages.mjs';

const ROOT = process.cwd();

let countryPages = [];
let countryIndex = [];
try {
    const content = JSON.parse(readFileSync(join(ROOT, 'content', 'countries.json'), 'utf8'));
    countryPages = content.countries.map((c) => c.slug);
    // Name → slug for the globe app, which knows countries by display name and
    // must only link to pages that exist. Emitted from the same read as the
    // sitemap so the two can never disagree about which pages were published.
    countryIndex = content.countries.map((c) => ({ name: c.name, slug: c.slug }));
} catch (err) {
    // Not fatal: the border pages are still worth a sitemap. But say so, because
    // silently dropping ~200 URLs is exactly the kind of SEO regression nobody
    // notices for a month.
    console.warn(`build-sitemap — no content/countries.json (${err.code ?? err.message}); ` +
                 `sitemap will omit the country pages.`);
}

const { published, skipped } = publishedBorderPages({ images: imageSlugsIn(join(ROOT, 'img/borders')) });
const borders = published.map((e) => e.slug);

const urls = [
    { loc: `${ORIGIN}/`, changefreq: 'weekly', priority: '1.0' },
    // Country pages rank above the border quizzes: they carry the editorial
    // content, and they are the reason this sitemap matters.
    ...countryPages.map((slug) => ({ loc: `${ORIGIN}/country/${slug}`, changefreq: 'monthly', priority: '0.8' })),
    ...borders.map((slug) => ({ loc: `${ORIGIN}/borders/${slug}`, changefreq: 'monthly', priority: '0.7' })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);

// Just {name, slug} — the globe app needs to know WHICH countries have a page,
// not what is on them. ~10 KB at full coverage against ~700 KB for the content
// itself, and it is fetched lazily by the flag panel.
writeFileSync(join(ROOT, 'country-pages.json'), JSON.stringify(countryIndex));

if (skipped.length) {
    console.warn(`build-sitemap — ${skipped.length} borders entr${skipped.length === 1 ? 'y' : 'ies'} ` +
                 `held back (no img/borders/<slug>.png): ${skipped.join(', ')}`);
}
console.log(`build-sitemap — sitemap.xml lists ${urls.length} URL(s) ` +
            `(${countryPages.length} country, ${borders.length} borders, 1 apex).`);
