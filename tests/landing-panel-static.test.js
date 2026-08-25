/**
 * The apex must keep shipping real, crawlable content.
 *
 * This is the invariant the AdSense fix rests on for terragotcha.com/. Before
 * this panel existed the apex served ~137 indexable words — 62 of them inside a
 * 1×1px-clipped .sr-only block — and zero links to the country pages, which is
 * precisely the "raw HTML is essentially an empty shell" the rejection named.
 *
 * The checks below run against the SHIPPED index.html, not the generator's
 * output, so they fail if someone regenerates without committing, hand-edits the
 * block away, or reintroduces hidden text. The staleness check itself is
 * `node build-landing-facts.mjs --check`, wired into `npm test` ahead of vitest.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifyEntries, renderPanel, splice, BEGIN, END } from '../build-landing-facts.mjs';

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const html = read('../index.html');
const facts = JSON.parse(read('../landing/landing-facts.json'));
const meta = JSON.parse(read('../assets/country-meta.json'));
const content = JSON.parse(read('../content/countries.json'));

const panel = html.slice(html.indexOf(BEGIN), html.indexOf(END) + END.length);

/** Tag-stripped visible text, the way a crawler counts it. */
const words = (frag) => frag
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .split(/\s+/)
    .filter(w => /[a-zA-Z]/.test(w));

describe('apex static content', () => {
    it('ships the generated panel between its markers', () => {
        expect(html).toContain(BEGIN);
        expect(html).toContain(END);
        expect(html.indexOf(BEGIN)).toBeLessThan(html.indexOf(END));
        expect(panel).toContain('id="landing-panel"');
    });

    it('carries at least as much visible copy as a country page', () => {
        // Country pages run 270–420 words. The apex was 137. Anything that drops
        // it back under 300 has undone the point of the exercise.
        expect(words(panel).length).toBeGreaterThanOrEqual(300);
    });

    it('has no visually-hidden text anywhere in the document', () => {
        // The old .sr-only block was clipped to 1×1px. Hidden keyword copy is a
        // quality signal working against us, not for us.
        expect(html).not.toMatch(/class="[^"]*\bsr-only\b/);
        expect(html).not.toMatch(/clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
    });

    it('exposes exactly one h1, and it is the landing headline', () => {
        expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
        expect(panel).toContain(`<h1>`);
    });

    it('links to every published country page, and to nothing unpublished', () => {
        const hrefs = [...panel.matchAll(/href="\/country\/([^/"]+)\//g)].map(m => m[1]);
        const published = content.countries.map(c => c.slug);
        expect(hrefs.length).toBeGreaterThan(0);
        expect(new Set(hrefs)).toEqual(new Set(published));
    });

    it('is plain static markup — no script, and nothing hydrated into it', () => {
        expect(panel).not.toMatch(/<script/i);
        expect(panel).not.toMatch(/client:/);
    });
});

describe('claim verification', () => {
    it('every shipped claim holds against the baked country geometry', () => {
        const { failures } = verifyEntries(facts.notable.entries, meta);
        expect(failures).toEqual([]);
    });

    it('renders the figure from the data rather than from the entry', () => {
        // No entry carries a number of its own, so prose and figure cannot drift.
        for (const e of facts.notable.entries) {
            expect(Object.keys(e)).not.toContain('stat');
        }
        const { stats } = verifyEntries(facts.notable.entries, meta);
        expect(stats.get('russia')).toBe('17,098,242 km²');
        // Sub-km² countries must not round to a nonsense "0 km²".
        expect(stats.get('vatican')).toBe('0.44 km²');
    });

    it('rejects a claim the data contradicts, naming both countries', () => {
        const bad = structuredClone(facts);
        bad.notable.entries[0].country = 'Canada';
        const { failures } = renderPanel({ facts: bad, meta, content });
        expect(failures).toHaveLength(1);
        expect(failures[0]).toMatch(/claims Canada is #1 largest by land area/);
        expect(failures[0]).toMatch(/data says Russia/);
    });

    it('rejects an unknown metric type rather than rendering it unchecked', () => {
        const bad = structuredClone(facts);
        bad.notable.entries[0].metric = { type: 'gdp-per-capita', rank: 1 };
        const { failures, block } = renderPanel({ facts: bad, meta, content });
        expect(failures[0]).toMatch(/unknown metric type "gdp-per-capita"/);
        // …and the unverifiable entry is not in the output.
        expect(block).not.toContain('Largest country');
    });

    it('rejects a rank beyond the ranking', () => {
        const bad = structuredClone(facts);
        bad.notable.entries[0].metric = { type: 'area-rank', rank: 9999 };
        const { failures } = renderPanel({ facts: bad, meta, content });
        expect(failures[0]).toMatch(/out of range/);
    });
});

describe('splice', () => {
    it('is idempotent', () => {
        const { block } = renderPanel({ facts, meta, content });
        expect(splice(splice(html, block), block)).toBe(splice(html, block));
    });

    it('refuses a file without markers rather than appending a second panel', () => {
        expect(() => splice('<html></html>', 'x')).toThrow(/missing the landing-panel markers/);
    });

    it('refuses markers in the wrong order', () => {
        expect(() => splice(`${END}\nx\n${BEGIN}`, 'x')).toThrow(/out of order/);
    });
});

describe('links only to pages that exist', () => {
    it('renders a country with no page as text, not as a dead link', () => {
        // Russia has no article yet; it must not link out.
        const { block } = renderPanel({ facts, meta, content });
        expect(block).toContain('<span class="lf-name">Russia</span>');
        expect(block).not.toContain('/country/russia/');
    });

    it('drops all outbound links when no content file is available', () => {
        const { block, links } = renderPanel({ facts, meta, content: { countries: [] } });
        expect(links).toBe(0);
        expect(block).not.toContain('href="/country/');
        // …but the content itself survives, so the page is never empty.
        expect(words(block).length).toBeGreaterThanOrEqual(300);
    });
});
