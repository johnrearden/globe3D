/**
 * build-landing-facts.mjs — verify the apex landing content against the data.
 *
 * `landing/landing-facts.json` is the editorial copy for the apex: the notable
 * countries and what is said about them. Every superlative in it is a CLAIM
 * about the baked geometry ("largest country", "furthest north"), and this file
 * checks each one against assets/country-meta.json and refuses if the data
 * disagrees. That check is the point of the file, not a formality.
 *
 * The renderer is the Astro apex: apps/web/src/lib/landing.ts calls
 * landingModel() and throws on any failure, and LandingContent.tsx renders the
 * result computing no figure of its own. Until B11 this file also spliced an
 * HTML block into the vanilla index.html; that page is a dev tool now and
 * carries no landing content, so the splice is gone and this is verification
 * only — run by `npm test` and ahead of every `build:pages`.
 *
 * Usage:
 *   node build-landing-facts.mjs            # verify, print the tally
 *   node build-landing-facts.mjs --check    # the same; kept for the scripts that call it
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';


export const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ---------------------------------------------------------------------------
// Metric verification
// ---------------------------------------------------------------------------

/** Centroids are unit vectors; y is sin(latitude). */
const latOf = (c) => Math.asin(Math.max(-1, Math.min(1, c.centroid[1]))) * 180 / Math.PI;

const km2 = (n) => `${Math.round(n).toLocaleString('en-US')} km²`;
// Sub-km² countries (the Vatican is 0.44) round to "0 km²", which reads as a bug.
const areaLabel = (n) => (n < 10 ? `${n} km²` : km2(n));
const degrees = (n) => `${Math.abs(n).toFixed(1)}° ${n >= 0 ? 'N' : 'S'}`;

/**
 * Each metric returns the ordered list it ranks within, how to render the
 * figure, and how to describe itself in an error. Verification is then one
 * shared comparison, so a new metric cannot arrive without a check.
 */
const METRICS = {
    'area-rank': (m, pool) => ({
        ordered: [...pool].sort((a, b) => b.area - a.area),
        label: (c) => areaLabel(c.area),
        describe: () => 'largest by land area',
    }),
    'area-rank-smallest': (m, pool) => ({
        ordered: [...pool].sort((a, b) => a.area - b.area),
        label: (c) => areaLabel(c.area),
        describe: () => 'smallest by land area',
    }),
    'north-rank': (m, pool) => ({
        ordered: pool.filter((c) => c.area >= (m.minAreaKm2 || 0)).sort((a, b) => latOf(b) - latOf(a)),
        label: (c) => degrees(latOf(c)),
        describe: () => `furthest north by centre latitude (area ≥ ${km2(m.minAreaKm2 || 0)})`,
    }),
    'south-rank': (m, pool) => ({
        ordered: pool.filter((c) => c.area >= (m.minAreaKm2 || 0)).sort((a, b) => latOf(a) - latOf(b)),
        label: (c) => degrees(latOf(c)),
        describe: () => `furthest south by centre latitude (area ≥ ${km2(m.minAreaKm2 || 0)})`,
    }),
};

export const METRIC_TYPES = Object.keys(METRICS);

/**
 * Check every entry against the baked country geometry.
 *
 * @param {Array} entries landing-facts.json notable.entries
 * @param {Object} meta   parsed assets/country-meta.json
 * @returns {{stats: Map<string,string>, failures: string[]}} stats is entry id →
 *   the figure to display, derived from the data. An entry that fails has no stat.
 */
export function verifyEntries(entries, meta) {
    const pool = meta.countries.filter((c) => typeof c.area === 'number' && c.area > 0);
    const stats = new Map();
    const failures = [];

    for (const entry of entries) {
        const m = entry.metric;
        const build = METRICS[m?.type];
        if (!build) {
            failures.push(`${entry.id}: unknown metric type "${m?.type}" ` +
                          `(known: ${METRIC_TYPES.join(', ')})`);
            continue;
        }
        const { ordered, label, describe } = build(m, pool);
        const at = ordered[m.rank - 1];
        if (!at) {
            failures.push(`${entry.id}: rank ${m.rank} is out of range (${ordered.length} candidates)`);
            continue;
        }
        if (at.name !== entry.country) {
            const actual = ordered.findIndex((c) => c.name === entry.country) + 1;
            failures.push(
                `${entry.id}: claims ${entry.country} is #${m.rank} ${describe()}, ` +
                `but the data says ${at.name} ` +
                `(${entry.country} is ${actual ? `#${actual}` : 'not in the ranking'})`);
            continue;
        }
        stats.set(entry.id, label(at));
    }
    return { stats, failures };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * The verified landing content, as data.
 *
 * Both renderers go through this — the generator below, which splices markup
 * into index.html, and apps/web's Astro page, which renders the same content as
 * React. One model means the claim checking cannot be re-implemented (or
 * quietly skipped) on the second path, and it is why the Phase B rewrite
 * inherits the verification rather than reproducing it.
 *
 * Pure: it takes parsed JSON rather than reading files, because its two callers
 * run with different working directories.
 *
 * @param {Object} args
 * @param {Object} args.facts   landing/landing-facts.json
 * @param {Object} args.meta    assets/country-meta.json
 * @param {Object} args.content content/countries.json ({countries: []})
 * @returns {{intro: Object, notable: Object, guides: Object, failures: string[], links: number}}
 */
export function landingModel({ facts, meta, content }) {
    const { stats, failures } = verifyEntries(facts.notable.entries, meta);

    // Name → slug for the countries that actually have a written page. Everything
    // else renders as plain text, so the panel never links to a 404 and links
    // light up on their own as pages are written.
    const pageSlug = new Map(content.countries.map((c) => [c.name, c.slug]));
    let links = 0;
    const hrefFor = (name) => {
        const slug = pageSlug.get(name);
        if (!slug) return null;
        links += 1;
        return `/country/${slug}/`;
    };

    const entries = facts.notable.entries
        .filter((e) => stats.has(e.id))
        .map((e) => ({
            id: e.id,
            eyebrow: e.eyebrow,
            name: e.displayName || e.country,
            stat: stats.get(e.id),
            blurb: e.blurb,
            href: hrefFor(e.country),
        }));

    const guideEntries = content.countries.map((c) => {
        links += 1;
        return { name: c.name, slug: c.slug, summary: c.summary, href: `/country/${c.slug}/` };
    });

    return {
        intro: facts.intro,
        notable: { heading: facts.notable.heading, lede: facts.notable.lede, entries },
        guides: { heading: facts.guides.heading, lede: facts.guides.lede, entries: guideEntries },
        failures,
        links,
    };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
    const ROOT = process.cwd();
    const check = argv.includes('--check');

    const facts = JSON.parse(readFileSync(join(ROOT, 'landing/landing-facts.json'), 'utf8'));
    const meta = JSON.parse(readFileSync(join(ROOT, 'assets/country-meta.json'), 'utf8'));

    // The guides section is driven by the same file build-sitemap.mjs reads for
    // the sitemap and country-pages.json. One reader, so a guide, its sitemap
    // entry and its link cannot exist independently of each other.
    let content = { countries: [] };
    try {
        content = JSON.parse(readFileSync(join(ROOT, 'content/countries.json'), 'utf8'));
    } catch (err) {
        console.warn(`build-landing-facts — no content/countries.json (${err.code ?? err.message}); ` +
                     'the guides section will be empty and no entry will link out.');
    }

    const { failures } = landingModel({ facts, meta, content });

    if (failures.length) {
        console.error('build-landing-facts — REFUSING TO BUILD: claim(s) contradict the data\n');
        failures.forEach((f) => console.error(`  ✗ ${f}`));
        console.error('\nFix landing/landing-facts.json (or the entry is simply no longer true).');
        return 1;
    }
    console.log(`build-landing-facts${check ? ' --check' : ''} — ${facts.notable.entries.length} verified ` +
                `claims, ${content.countries.length} guide(s).`);
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exit(main(process.argv.slice(2)));
}
