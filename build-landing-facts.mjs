#!/usr/bin/env node
/**
 * build-landing-facts.mjs — render the apex landing panel into index.html.
 *
 * WHY THIS EXISTS: terragotcha.com/ shipped ~137 indexable words, 62 of them
 * inside a 1x1px-clipped .sr-only block, and zero links to the country pages.
 * The AdSense rejection was diagnosed as "the raw HTML is essentially an empty
 * shell" — a diagnosis about the apex, which every later stage left untouched.
 * This puts real, visible, crawlable content there.
 *
 * WHY IT VERIFIES: the panel is a page of superlatives, and a superlative is a
 * falsifiable claim. "USA, highest GDP per capita" reads perfectly plausibly and
 * is wrong. So every entry's `metric` is checked against the SAME geometry the
 * globe renders (assets/country-meta.json) and the build fails on a mismatch;
 * the figure shown is derived from that data rather than authored, so the prose
 * and the number cannot drift apart. Claims we cannot check are not made.
 *
 * Blurbs are ordinary editorial prose and are not checked — see the note in
 * landing/landing-facts.json about keeping them descriptive rather than
 * comparative.
 *
 * The pure half (verify/render/splice) is exported so tests can exercise the
 * failure path without spawning a build.
 *
 * Usage:
 *   node build-landing-facts.mjs            # splice into index.html
 *   node build-landing-facts.mjs --check    # verify + fail if index.html is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BEGIN = '<!-- BEGIN GENERATED: landing panel (build-landing-facts.mjs) -->';
export const END = '<!-- END GENERATED: landing panel -->';

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
 * @param {Object} args
 * @param {Object} args.facts   landing/landing-facts.json
 * @param {Object} args.meta    assets/country-meta.json
 * @param {Object} args.content content/countries.json ({countries: []})
 * @returns {{block: string, failures: string[], links: number}}
 */
export function renderPanel({ facts, meta, content }) {
    const { stats, failures } = verifyEntries(facts.notable.entries, meta);

    // Name → slug for the countries that actually have a written page. Everything
    // else renders as plain text, so the panel never links to a 404 and links
    // light up on their own as pages are written.
    const pageSlug = new Map(content.countries.map((c) => [c.name, c.slug]));
    let links = 0;

    const countryTag = (name, display) => {
        const slug = pageSlug.get(name);
        const text = esc(display || name);
        if (!slug) return `<span class="lf-name">${text}</span>`;
        links += 1;
        return `<a class="lf-name" href="/country/${slug}/">${text}</a>`;
    };

    const entries = facts.notable.entries
        .filter((e) => stats.has(e.id))
        .map((e) => `                <li class="lf-card">
                    <p class="lf-eyebrow">${esc(e.eyebrow)}</p>
                    <h3 class="lf-heading">${countryTag(e.country, e.displayName)}</h3>
                    <p class="lf-stat">${esc(stats.get(e.id))}</p>
                    <p class="lf-blurb">${esc(e.blurb)}</p>
                </li>`)
        .join('\n');

    const guides = content.countries.map((c) => {
        links += 1;
        return `                <li class="lf-guide">
                    <h3 class="lf-heading"><a class="lf-name" href="/country/${c.slug}/">${esc(c.name)}</a></h3>
                    <p class="lf-blurb">${esc(c.summary)}</p>
                </li>`;
    }).join('\n');

    const guidesSection = guides
        ? `
            <section class="lf-section" aria-labelledby="lf-guides-h">
                <h2 id="lf-guides-h">${esc(facts.guides.heading)}</h2>
                <p class="lf-lede">${esc(facts.guides.lede)}</p>
                <ul class="lf-list lf-list-guides">
${guides}
                </ul>
            </section>`
        : '';

    const block = `${BEGIN}
    <!-- Generated from landing/landing-facts.json + assets/country-meta.json by
         build-landing-facts.mjs. Do not edit by hand: npm run build:landing-facts
         rewrites it, and npm test fails if this block is stale. -->
    <main id="landing-panel" class="landing-panel">
        <div class="lf-inner">
            <header class="lf-intro">
                <div class="lf-wordmark"><span class="tg-terra">Terra</span><span class="tg-gotcha">gotcha</span></div>
                <h1>${esc(facts.intro.h1)}</h1>
${facts.intro.paragraphs.map((p) => `                <p>${esc(p)}</p>`).join('\n')}
            </header>

            <section class="lf-section" aria-labelledby="lf-notable-h">
                <h2 id="lf-notable-h">${esc(facts.notable.heading)}</h2>
                <p class="lf-lede">${esc(facts.notable.lede)}</p>
                <ul class="lf-list">
${entries}
                </ul>
            </section>${guidesSection}
        </div>
    </main>
    ${END}`;

    return { block, failures, links };
}

/**
 * Replace whatever currently sits between the markers. Throws rather than
 * appending, because a second panel that silently shadows the first is a worse
 * failure than a loud one.
 */
export function splice(existing, block) {
    const start = existing.indexOf(BEGIN);
    const end = existing.indexOf(END);
    if (start === -1 || end === -1) {
        throw new Error(`index.html is missing the landing-panel markers (${BEGIN} … ${END})`);
    }
    if (end < start) throw new Error('index.html landing-panel markers are out of order');
    return existing.slice(0, start) + block + existing.slice(end + END.length);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
    const ROOT = process.cwd();
    const check = argv.includes('--check');

    const facts = JSON.parse(readFileSync(join(ROOT, 'landing/landing-facts.json'), 'utf8'));
    const meta = JSON.parse(readFileSync(join(ROOT, 'assets/country-meta.json'), 'utf8'));

    // The guides section is driven by the same file build-landing.mjs reads for
    // the sitemap and country-pages.json. One reader, so a guide, its sitemap
    // entry and its link cannot exist independently of each other.
    let content = { countries: [] };
    try {
        content = JSON.parse(readFileSync(join(ROOT, 'content/countries.json'), 'utf8'));
    } catch (err) {
        console.warn(`build-landing-facts — no content/countries.json (${err.code ?? err.message}); ` +
                     'the guides section will be empty and no entry will link out.');
    }

    const { block, failures, links } = renderPanel({ facts, meta, content });

    if (failures.length) {
        console.error('build-landing-facts — REFUSING TO BUILD: claim(s) contradict the data\n');
        failures.forEach((f) => console.error(`  ✗ ${f}`));
        console.error('\nFix landing/landing-facts.json (or the entry is simply no longer true).');
        return 1;
    }

    const indexPath = join(ROOT, 'index.html');
    const current = readFileSync(indexPath, 'utf8');
    const next = splice(current, block);

    if (check) {
        if (next !== current) {
            console.error('build-landing-facts --check — index.html landing panel is STALE.\n' +
                          'Run: npm run build:landing-facts');
            return 1;
        }
        console.log('build-landing-facts --check — up to date ' +
                    `(${facts.notable.entries.length} verified claims, ${content.countries.length} guides).`);
        return 0;
    }

    writeFileSync(indexPath, next);
    console.log(`build-landing-facts — ${facts.notable.entries.length} claims verified against ` +
                `country-meta.json; ${content.countries.length} guide(s); ${links} internal link(s).`);
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exit(main(process.argv.slice(2)));
}
